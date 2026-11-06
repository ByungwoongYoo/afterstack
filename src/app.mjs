import {StackSession, validateStack, explore} from './engine.mjs';
import {stacks} from './stacks.mjs';
import {
  createEditorState, editCard, addCard, removeCard,
  addChoice, removeChoice, editChoice, editStackMeta,
  undo as editorUndo, canUndo as editorCanUndo, commit, getDraft
} from './editor.mjs';

const $ = s => document.querySelector(s);

// ── Runtime state ─────────────────────────────────────────────────────────────
let stack = stacks[0];
let session = new StackSession(stack);

// ── Scan state ────────────────────────────────────────────────────────────────
let scanTimer = null;
let scanItems = [];   // array of {label, el, action}
let scanNext = 0;     // index of the item that will be highlighted on the NEXT tick
let scanActive = -1;  // index of the item that IS currently highlighted (shown to user)
                      // Space activates scanActive, not scanNext.

function stopScan() {
  clearInterval(scanTimer);
  scanTimer = null;
  $('#scan').textContent = 'Start one-switch scan';
  document.querySelectorAll('.scanned').forEach(x => x.classList.remove('scanned'));
  $('#scan-choice').textContent = '';
  scanActive = -1;
}

// ── Runtime render ────────────────────────────────────────────────────────────
function status(text) { $('#status').textContent = text; }

function render() {
  const view = session.view();
  $('#stack-title').textContent = view.title;
  $('#card-title').textContent = view.card.title;
  $('#card-body').textContent = view.card.body;
  $('#flags').textContent = 'Carried state: ' + (view.flags.join(', ') || 'none');

  $('#choices').replaceChildren();
  view.choices.forEach((choice, i) => {
    const b = document.createElement('button');
    b.textContent = choice.label;
    b.dataset.choice = i;
    b.onclick = () => { session.choose(i); render(); };
    $('#choices').append(b);
  });

  $('#undo').disabled = !session.history.length;

  if (!view.choices.length)
    status('This stack has reached an ending. Restart or undo to explore another path.');
  else
    status(`${view.choices.length} choice${view.choices.length !== 1 ? 's' : ''}. Tab and Enter work throughout. Optional one-switch scan cycles choices + Undo + Restart; Space selects.`);

  // Rebuild scan item list and re-highlight if scan is running
  if (scanTimer) _rebuildAndHighlight();
}

// ── One-switch scan ───────────────────────────────────────────────────────────
// Scans: all visible choices, then Undo (if available), Restart, Stop scan.
function _buildScanItems() {
  const items = [];
  document.querySelectorAll('#choices button').forEach(b => {
    items.push({ label: b.textContent, el: b, action: () => { b.click(); } });
  });
  if (!$('#undo').disabled)
    items.push({ label: 'Undo', el: $('#undo'), action: () => { session.back(); render(); } });
  items.push({ label: 'Restart', el: $('#restart'), action: () => { session.restart(); render(); } });
  items.push({ label: 'Stop scan', el: null, action: () => stopScan() });
  return items;
}

// Rebuild the item list after a state change and immediately show a highlight
// on the same logical position, so the user always sees what Space will do.
function _rebuildAndHighlight() {
  const newItems = _buildScanItems();
  // Try to keep the same position; clamp if the list shrank.
  scanNext = Math.min(scanNext, newItems.length > 0 ? newItems.length - 1 : 0);
  scanActive = Math.min(scanActive, newItems.length > 0 ? newItems.length - 1 : 0);
  scanItems = newItems;
  // Re-run a highlight pass so the visual and scanActive are both fresh.
  _scanTick();
  // Reset the interval timer so the next auto-advance is a full interval away,
  // not an immediate double-tick.
  clearInterval(scanTimer);
  scanTimer = setInterval(_scanTick, 1800);
}

function _scanTick() {
  document.querySelectorAll('.scanned').forEach(x => x.classList.remove('scanned'));
  if (!scanItems.length) return;
  scanNext %= scanItems.length;
  scanActive = scanNext;                    // record what is now shown
  const item = scanItems[scanActive];
  if (item.el) item.el.classList.add('scanned');
  $('#scan-choice').textContent = 'Highlighted: ' + item.label;
  scanNext = (scanActive + 1) % scanItems.length;
}

$('#scan').onclick = () => {
  if (scanTimer) { stopScan(); return; }
  scanNext = 0;
  scanActive = -1;
  scanItems = _buildScanItems();
  $('#scan').textContent = 'Stop one-switch scan';
  _scanTick();
  scanTimer = setInterval(_scanTick, 1800);
};

document.addEventListener('keydown', e => {
  // Ignore key-repeat (held key) — only the first physical press fires.
  if (e.repeat) return;
  if (scanTimer && e.code === 'Space' && !['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    // Activate the item that is currently highlighted (scanActive).
    if (scanActive >= 0 && scanActive < scanItems.length) {
      scanItems[scanActive].action();
      // action() may call render() which calls _rebuildAndHighlight(),
      // so scanActive/scanNext/scanItems are already updated by the time
      // we return here — no further adjustment needed.
    }
  }
});

// ── Stack selector ────────────────────────────────────────────────────────────
$('#stack-select').onchange = e => {
  stopScan();
  stack = stacks[Number(e.target.value)];
  session = new StackSession(stack);
  editorState = createEditorState(stack);
  syncEditorForms();
  $('#editor').value = JSON.stringify(stack, null, 2);
  render();
};

// ── Runtime controls ──────────────────────────────────────────────────────────
$('#undo').onclick = () => { session.back(); render(); };
$('#restart').onclick = () => { session.restart(); render(); };

// ── Save / load ───────────────────────────────────────────────────────────────
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#save').onclick = () => download('afterstack-save.json', session.save());

$('#load').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file || file.size > 200000) throw Error('Choose a save file under 200KB.');
    session.restore(await file.text());
    render();
  } catch (err) { status(err.message); }
};

// ── Raw-JSON editor (advanced) ────────────────────────────────────────────────
$('#apply').onclick = () => {
  try {
    const candidate = JSON.parse($('#editor').value);
    const errors = validateStack(candidate);
    if (errors.length) throw Error(errors.join('\n'));
    const result = explore(candidate);
    if (!result.endings.length) throw Error('No reachable ending. Add an ending card.');
    stack = candidate;
    session = new StackSession(stack);
    editorState = createEditorState(stack);
    stopScan();
    syncEditorForms();
    render();
    status(`Loaded ${stack.cards.length} cards; ${result.reachableStates} reachable states; endings: ${result.endings.join(', ')}.`);
  } catch (err) { status(err.message); }
};

$('#export').onclick = () => download('afterstack-stack.json', JSON.stringify(stack, null, 2));

$('#stack-import').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file || file.size > 200000) throw Error('Choose a stack under 200KB.');
    $('#editor').value = await file.text();
    $('#apply').click();
  } catch (err) { status(err.message); }
};

// ══ FORM EDITOR ═══════════════════════════════════════════════════════════════

let editorState = createEditorState(stack);

function feStatus(msg) {
  $('#fe-status').textContent = msg;
}

function feErr(fn) {
  try { fn(); feStatus(''); }
  catch (e) { feStatus(e.message); }
}

// Populate all selects and fields from editorState
function syncEditorForms() {
  const d = getDraft(editorState);

  // Stack meta
  $('#fe-stack-title').value = d.title || '';
  _populateSelect($('#fe-start'), d.cards.map(c => ({ value: c.id, label: `${c.id} — ${c.title || '(no title)'}` })), d.start);

  // Card select
  _populateSelect($('#fe-card-select'), d.cards.map(c => ({ value: c.id, label: `${c.id} — ${c.title || '(no title)'}` })));

  // Flags input
  $('#fe-flags-input').value = (d.flags || []).join(', ');

  // Sync card fields for currently selected card
  _syncCardFields();
  _syncChoiceTo();
  _syncNewChoiceFlags();

  // Undo button
  $('#fe-undo').disabled = !editorCanUndo(editorState);
}

function _populateSelect(sel, options, selectedValue) {
  const prev = selectedValue !== undefined ? selectedValue : sel.value;
  sel.replaceChildren();
  for (const { value, label } of options) {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    if (value === prev) o.selected = true;
    sel.append(o);
  }
}

function _syncCardFields() {
  const d = getDraft(editorState);
  const cardId = $('#fe-card-select').value;
  const card = d.cards.find(c => c.id === cardId);
  if (!card) return;
  $('#fe-card-title').value = card.title || '';
  $('#fe-card-body').value = card.body || '';
  _renderChoiceList(card);
}

function _syncChoiceTo() {
  const d = getDraft(editorState);
  _populateSelect($('#fe-new-choice-to'), d.cards.map(c => ({ value: c.id, label: `${c.id} — ${c.title || '(no title)'}` })));
}

function _syncNewChoiceFlags() {
  const d = getDraft(editorState);
  const flags = d.flags || [];
  const container = $('#fe-new-choice-flags');
  container.replaceChildren();
  if (!flags.length) {
    container.textContent = '(No flags declared — add flags in Stack settings first.)';
    return;
  }
  for (const field of ['require', 'forbid', 'set', 'clear']) {
    const row = document.createElement('div');
    row.className = 'fe-row';
    const lbl = document.createElement('span');
    lbl.style.minWidth = '90px';
    lbl.textContent = field;
    row.append(lbl);
    const group = document.createElement('div');
    group.className = 'fe-flag-group';
    group.dataset.field = field;
    for (const f of flags) {
      const id = `fe-new-${field}-${f}`;
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = id; cb.dataset.flag = f;
      const label = document.createElement('label');
      label.htmlFor = id; label.textContent = f;
      label.prepend(cb);
      group.append(label);
    }
    row.append(group);
    container.append(row);
  }
}

function _renderChoiceList(card) {
  const d = getDraft(editorState);
  const flags = d.flags || [];
  const list = $('#fe-choice-list');
  list.replaceChildren();

  if (!card.choices || !card.choices.length) {
    const li = document.createElement('li');
    li.textContent = '(no choices)';
    list.append(li);
    return;
  }

  card.choices.forEach((ch, idx) => {
    const li = document.createElement('li');

    // Label row
    const labelRow = document.createElement('div');
    labelRow.className = 'fe-row';
    const labelInput = document.createElement('input');
    labelInput.type = 'text'; labelInput.value = ch.label; labelInput.maxLength = 120;
    labelInput.style.flex = '1'; labelInput.dataset.choiceIdx = idx; labelInput.dataset.field = 'label';
    labelInput.setAttribute('aria-label', `Choice ${idx + 1} label`);
    labelRow.append(Object.assign(document.createElement('span'), { textContent: 'Label', style: 'min-width:90px' }), labelInput);
    li.append(labelRow);

    // To row
    const toRow = document.createElement('div');
    toRow.className = 'fe-row';
    const toSel = document.createElement('select');
    toSel.dataset.choiceIdx = idx; toSel.dataset.field = 'to';
    toSel.setAttribute('aria-label', `Choice ${idx + 1} target`);
    _populateSelect(toSel, d.cards.map(c => ({ value: c.id, label: `${c.id} — ${c.title || '(no title)'}` })), ch.to);
    toRow.append(Object.assign(document.createElement('span'), { textContent: 'Goes to', style: 'min-width:90px' }), toSel);
    li.append(toRow);

    // Flag rows
    if (flags.length) {
      for (const field of ['require', 'forbid', 'set', 'clear']) {
        const flagRow = document.createElement('div');
        flagRow.className = 'fe-row';
        flagRow.append(Object.assign(document.createElement('span'), { textContent: field, style: 'min-width:90px' }));
        const group = document.createElement('div');
        group.className = 'fe-flag-group';
        for (const f of flags) {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = Array.isArray(ch[field]) && ch[field].includes(f);
          cb.dataset.choiceIdx = idx; cb.dataset.field = field; cb.dataset.flag = f;
          cb.setAttribute('aria-label', `${field} ${f}`);
          const lbl = document.createElement('label');
          lbl.textContent = f; lbl.prepend(cb);
          group.append(lbl);
        }
        flagRow.append(group);
        li.append(flagRow);
      }
    }

    // Save / Remove buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'fe-row';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save choice';
    saveBtn.onclick = () => _saveChoiceFromRow(card.id, idx, li, flags);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove choice';
    removeBtn.onclick = () => feErr(() => {
      editorState = removeChoice(editorState, card.id, idx);
      syncEditorForms();
      feStatus(`Choice ${idx + 1} removed.`);
    });
    btnRow.append(saveBtn, removeBtn);
    li.append(btnRow);

    list.append(li);
  });
}

function _saveChoiceFromRow(cardId, idx, li, flags) {
  feErr(() => {
    const labelInput = li.querySelector(`input[data-choice-idx="${idx}"][data-field="label"]`);
    const toSel = li.querySelector(`select[data-choice-idx="${idx}"][data-field="to"]`);
    const updates = { label: labelInput.value, to: toSel.value };
    for (const field of ['require', 'forbid', 'set', 'clear']) {
      const cbs = li.querySelectorAll(`input[data-choice-idx="${idx}"][data-field="${field}"]`);
      if (cbs.length) updates[field] = [...cbs].filter(cb => cb.checked).map(cb => cb.dataset.flag);
    }
    editorState = editChoice(editorState, cardId, idx, updates);
    syncEditorForms();
    feStatus('Choice saved.');
  });
}

// ── Form event handlers ───────────────────────────────────────────────────────

$('#fe-card-select').onchange = () => _syncCardFields();

$('#fe-save-stack-meta').onclick = () => feErr(() => {
  editorState = editStackMeta(editorState, { title: $('#fe-stack-title').value });
  syncEditorForms();
  feStatus('Stack title saved.');
});

$('#fe-save-start').onclick = () => feErr(() => {
  editorState = editStackMeta(editorState, { start: $('#fe-start').value });
  syncEditorForms();
  feStatus('Start card updated.');
});

$('#fe-save-flags').onclick = () => feErr(() => {
  const raw = $('#fe-flags-input').value.trim();
  const flags = raw ? raw.split(',').map(f => f.trim()).filter(Boolean) : [];
  editorState = editStackMeta(editorState, { flags });
  syncEditorForms();
  feStatus('Flags saved.');
});

$('#fe-save-card').onclick = () => feErr(() => {
  const cardId = $('#fe-card-select').value;
  editorState = editCard(editorState, cardId, {
    title: $('#fe-card-title').value,
    body: $('#fe-card-body').value
  });
  syncEditorForms();
  feStatus('Card saved.');
});

$('#fe-remove-card').onclick = () => feErr(() => {
  const cardId = $('#fe-card-select').value;
  if (!cardId) throw new Error('Select a card first.');
  editorState = removeCard(editorState, cardId);
  syncEditorForms();
  feStatus(`Card "${cardId}" removed.`);
});

$('#fe-add-card').onclick = () => feErr(() => {
  const id = $('#fe-new-id').value.trim();
  const title = $('#fe-new-title').value;
  const body = $('#fe-new-body').value;
  editorState = addCard(editorState, { id, title, body });
  $('#fe-new-id').value = '';
  $('#fe-new-title').value = '';
  $('#fe-new-body').value = '';
  syncEditorForms();
  feStatus(`Card "${id}" added.`);
});

$('#fe-add-choice').onclick = () => feErr(() => {
  const cardId = $('#fe-card-select').value;
  if (!cardId) throw new Error('Select a card first.');
  const label = $('#fe-new-choice-label').value;
  const to = $('#fe-new-choice-to').value;
  const flagGroups = {};
  for (const field of ['require', 'forbid', 'set', 'clear']) {
    const cbs = document.querySelectorAll(`#fe-new-choice-flags [data-field="${field}"] input[type=checkbox]`);
    flagGroups[field] = cbs.length ? [...cbs].filter(cb => cb.checked).map(cb => cb.dataset.flag) : undefined;
  }
  editorState = addChoice(editorState, cardId, { label, to, ...flagGroups });
  $('#fe-new-choice-label').value = '';
  syncEditorForms();
  feStatus('Choice added.');
});

$('#fe-undo').onclick = () => feErr(() => {
  if (!editorCanUndo(editorState)) throw new Error('Nothing to undo.');
  editorState = editorUndo(editorState);
  syncEditorForms();
  feStatus('Editor change undone.');
});

$('#fe-play').onclick = () => {
  try {
    const candidate = commit(editorState);
    const result = explore(candidate);
    if (!result.endings.length) throw Error('No reachable ending. Add an ending card.');
    stack = candidate;
    session = new StackSession(stack);
    stopScan();
    $('#editor').value = JSON.stringify(stack, null, 2);
    render();
    feStatus('');
    status(`Playing: ${stack.cards.length} cards; ${result.reachableStates} reachable states; endings: ${result.endings.join(', ')}.`);
  } catch (e) { feStatus(e.message); }
};

// ── Boot ──────────────────────────────────────────────────────────────────────
$('#editor').value = JSON.stringify(stack, null, 2);
syncEditorForms();
render();
