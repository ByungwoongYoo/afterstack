import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditorState, editCard, addCard, removeCard,
  addChoice, removeChoice, editChoice, editStackMeta,
  undo, canUndo, commit, getDraft
} from '../src/editor.mjs';
import {lighthouse, circuit} from '../src/stacks.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────
function freshLight() { return createEditorState(lighthouse); }
function freshCircuit() { return createEditorState(circuit); }

// ── createEditorState ────────────────────────────────────────────────────────
test('createEditorState clones the stack; original is not mutated', () => {
  const s = freshLight();
  getDraft(s).title = 'CHANGED';
  assert.equal(lighthouse.title, 'The Last Lighthouse');
});

test('createEditorState rejects non-objects', () => {
  assert.throws(() => createEditorState(null));
  assert.throws(() => createEditorState([1, 2]));
  assert.throws(() => createEditorState('string'));
});

// ── editCard ─────────────────────────────────────────────────────────────────
test('editCard updates title and body', () => {
  const s = editCard(freshLight(), 'harbor', { title: 'New Title', body: 'New body.' });
  const card = getDraft(s).cards.find(c => c.id === 'harbor');
  assert.equal(card.title, 'New Title');
  assert.equal(card.body, 'New body.');
});

test('editCard with only title leaves body unchanged', () => {
  const orig = getDraft(freshLight()).cards.find(c => c.id === 'harbor').body;
  const s = editCard(freshLight(), 'harbor', { title: 'X' });
  assert.equal(getDraft(s).cards.find(c => c.id === 'harbor').body, orig);
});

test('editCard throws on unknown cardId', () => {
  assert.throws(() => editCard(freshLight(), 'no-such-card', { title: 'x' }),
    /Card not found/);
});

test('editCard does not mutate the previous EditorState', () => {
  const s0 = freshLight();
  const origTitle = getDraft(s0).cards.find(c => c.id === 'harbor').title;
  editCard(s0, 'harbor', { title: 'changed' });
  assert.equal(getDraft(s0).cards.find(c => c.id === 'harbor').title, origTitle);
});

// ── addCard ──────────────────────────────────────────────────────────────────
test('addCard inserts a card with correct defaults', () => {
  const s = addCard(freshLight(), { id: 'new_card', title: 'Hi', body: 'Body' });
  const d = getDraft(s);
  assert.ok(d.cards.some(c => c.id === 'new_card'));
  const c = d.cards.find(c => c.id === 'new_card');
  assert.equal(c.title, 'Hi');
  assert.deepEqual(c.choices, []);
});

test('addCard rejects invalid id (spaces, special chars)', () => {
  assert.throws(() => addCard(freshLight(), { id: 'bad id!' }), /Card ids/);
  assert.throws(() => addCard(freshLight(), { id: '' }), /Card ids/);
  assert.throws(() => addCard(freshLight(), { id: 'a'.repeat(41) }), /Card ids/);
});

test('addCard rejects duplicate id', () => {
  assert.throws(() => addCard(freshLight(), { id: 'harbor' }), /Duplicate card/);
});

test('addCard with only id (title/body default to empty strings)', () => {
  const s = addCard(freshLight(), { id: 'minimal' });
  const c = getDraft(s).cards.find(c => c.id === 'minimal');
  assert.equal(c.title, '');
  assert.equal(c.body, '');
});

// ── removeCard ───────────────────────────────────────────────────────────────
test('removeCard removes the card and its incoming choices', () => {
  // Add a card then add a choice to it from harbor, then remove it.
  let s = addCard(freshLight(), { id: 'temp', title: 'Temp', body: '' });
  s = addChoice(s, 'harbor', { label: 'Go temp', to: 'temp' });
  s = removeCard(s, 'temp');
  const d = getDraft(s);
  assert.ok(!d.cards.some(c => c.id === 'temp'));
  const harbor = d.cards.find(c => c.id === 'harbor');
  assert.ok(!harbor.choices.some(ch => ch.to === 'temp'));
});

test('removeCard throws when card not found', () => {
  assert.throws(() => removeCard(freshLight(), 'ghost'), /Card not found/);
});

test('removeCard refuses to remove the only card', () => {
  const minimal = {
    id: 'mini', title: 'Mini', start: 'only', flags: [],
    cards: [{ id: 'only', title: 'x', body: 'y', choices: [] }]
  };
  const s = createEditorState(minimal);
  assert.throws(() => removeCard(s, 'only'), /only card/);
});

test('removeCard updates start to another card when start is removed', () => {
  let s = addCard(freshLight(), { id: 'alt', title: 'Alt', body: '' });
  // Change start to alt
  s = editStackMeta(s, { start: 'alt' });
  s = removeCard(s, 'alt');
  const d = getDraft(s);
  assert.notEqual(d.start, 'alt');
  assert.ok(d.cards.some(c => c.id === d.start));
});

// ── addChoice ────────────────────────────────────────────────────────────────
test('addChoice adds a choice pointing to an existing card', () => {
  let s = addCard(freshLight(), { id: 'extra', title: 'Extra', body: '' });
  s = addChoice(s, 'harbor', { label: 'Go extra', to: 'extra' });
  const harbor = getDraft(s).cards.find(c => c.id === 'harbor');
  assert.ok(harbor.choices.some(ch => ch.to === 'extra' && ch.label === 'Go extra'));
});

test('addChoice rejects empty label', () => {
  assert.throws(() => addChoice(freshLight(), 'harbor', { label: '', to: 'shore' }),
    /label/);
  assert.throws(() => addChoice(freshLight(), 'harbor', { label: '   ', to: 'shore' }),
    /label/);
});

test('addChoice rejects target card that does not exist', () => {
  assert.throws(() => addChoice(freshLight(), 'harbor', { label: 'Go', to: 'nowhere' }),
    /Target card not found/);
});

test('addChoice rejects unknown flags in require/set/clear/forbid', () => {
  assert.throws(
    () => addChoice(freshLight(), 'harbor', { label: 'x', to: 'shore', set: ['no-such-flag'] }),
    /Unknown flag/
  );
});

test('addChoice accepts valid flag arrays from the declared list', () => {
  // lighthouse flags: ['lens','code','charged']
  const s = addChoice(freshLight(), 'harbor', {
    label: 'Test',
    to: 'shore',
    require: ['lens'],
    set: ['code']
  });
  const harbor = getDraft(s).cards.find(c => c.id === 'harbor');
  const ch = harbor.choices.find(c => c.label === 'Test');
  assert.deepEqual(ch.require, ['lens']);
  assert.deepEqual(ch.set, ['code']);
});

test('addChoice enforces 8-choice limit', () => {
  let s = freshCircuit();
  // circuit gate already has 5 choices; add 3 more to fill up
  for (let i = 0; i < 3; i++) {
    s = addCard(s, { id: `fill${i}`, title: '', body: '' });
    s = addChoice(s, 'gate', { label: `Fill ${i}`, to: `fill${i}` });
  }
  // Now gate has 8; adding one more should fail
  s = addCard(s, { id: 'one_too_many', title: '', body: '' });
  assert.throws(() => addChoice(s, 'gate', { label: 'Over', to: 'one_too_many' }),
    /8 choices/);
});

// ── removeChoice ─────────────────────────────────────────────────────────────
test('removeChoice removes by index', () => {
  const before = getDraft(freshLight()).cards.find(c => c.id === 'harbor').choices.length;
  const s = removeChoice(freshLight(), 'harbor', 0);
  const after = getDraft(s).cards.find(c => c.id === 'harbor').choices.length;
  assert.equal(after, before - 1);
});

test('removeChoice throws on out-of-range index', () => {
  assert.throws(() => removeChoice(freshLight(), 'harbor', 99), /out of range/);
  assert.throws(() => removeChoice(freshLight(), 'harbor', -1), /out of range/);
});

// ── editChoice ───────────────────────────────────────────────────────────────
test('editChoice updates label', () => {
  const s = editChoice(freshLight(), 'harbor', 0, { label: 'Renamed' });
  assert.equal(getDraft(s).cards.find(c => c.id === 'harbor').choices[0].label, 'Renamed');
});

test('editChoice updates to', () => {
  const s = editChoice(freshLight(), 'harbor', 0, { to: 'notebook' });
  assert.equal(getDraft(s).cards.find(c => c.id === 'harbor').choices[0].to, 'notebook');
});

test('editChoice rejects broken link', () => {
  assert.throws(
    () => editChoice(freshLight(), 'harbor', 0, { to: 'nowhere' }),
    /Target card not found/
  );
});

test('editChoice rejects unknown flags', () => {
  assert.throws(
    () => editChoice(freshLight(), 'harbor', 0, { set: ['ghost-flag'] }),
    /Unknown flag/
  );
});

test('editChoice clears a flag array when empty array passed', () => {
  // shore card index 0 has set:['lens']; clear it
  const s = editChoice(freshLight(), 'shore', 0, { set: [] });
  const ch = getDraft(s).cards.find(c => c.id === 'shore').choices[0];
  assert.ok(!('set' in ch));
});

// ── editStackMeta ─────────────────────────────────────────────────────────────
test('editStackMeta updates title', () => {
  const s = editStackMeta(freshLight(), { title: 'Retitled' });
  assert.equal(getDraft(s).title, 'Retitled');
});

test('editStackMeta rejects invalid flag names', () => {
  assert.throws(() => editStackMeta(freshLight(), { flags: ['bad flag!'] }), /Invalid flag/);
});

test('editStackMeta rejects duplicate flags', () => {
  assert.throws(() => editStackMeta(freshLight(), { flags: ['lens', 'lens'] }), /Duplicate/);
});

test('editStackMeta rejects more than 16 flags', () => {
  assert.throws(
    () => editStackMeta(freshLight(), { flags: Array.from({ length: 17 }, (_, i) => `f${i}`) }),
    /16 flags/
  );
});

// ── undo ─────────────────────────────────────────────────────────────────────
test('undo restores previous title after editCard', () => {
  const s0 = freshLight();
  const orig = getDraft(s0).cards.find(c => c.id === 'harbor').title;
  const s1 = editCard(s0, 'harbor', { title: 'Changed' });
  const s2 = undo(s1);
  assert.equal(getDraft(s2).cards.find(c => c.id === 'harbor').title, orig);
});

test('undo after addCard removes the new card', () => {
  const s1 = addCard(freshLight(), { id: 'temp2', title: 'T', body: '' });
  const s2 = undo(s1);
  assert.ok(!getDraft(s2).cards.some(c => c.id === 'temp2'));
});

test('undo after removeCard restores the card', () => {
  const s0 = freshLight();
  const cardCount = getDraft(s0).cards.length;
  const s1 = addCard(s0, { id: 'undo_me', title: 'U', body: '' });
  const s2 = removeCard(s1, 'undo_me');
  const s3 = undo(s2);
  assert.equal(getDraft(s3).cards.length, cardCount + 1);
});

test('canUndo is false on fresh state, true after mutation', () => {
  const s0 = freshLight();
  assert.equal(canUndo(s0), false);
  const s1 = editCard(s0, 'harbor', { title: 'x' });
  assert.equal(canUndo(s1), true);
});

test('undo on fresh state returns state unchanged', () => {
  const s = freshLight();
  const s2 = undo(s);
  assert.deepEqual(getDraft(s2), getDraft(s));
});

test('multiple undos walk back through the full mutation chain', () => {
  let s = freshLight();
  s = editCard(s, 'harbor', { title: 'Step 1' });
  s = editCard(s, 'harbor', { title: 'Step 2' });
  s = editCard(s, 'harbor', { title: 'Step 3' });
  s = undo(s);
  assert.equal(getDraft(s).cards.find(c => c.id === 'harbor').title, 'Step 2');
  s = undo(s);
  assert.equal(getDraft(s).cards.find(c => c.id === 'harbor').title, 'Step 1');
});

test('undo does not share object references with history (deep clone)', () => {
  const s0 = freshLight();
  const s1 = editCard(s0, 'harbor', { title: 'Mut' });
  const s2 = undo(s1);
  // Mutate s2's draft directly (simulating a bug) — s0 must be unaffected
  getDraft(s2); // read-only clone, but check we can't poison s0
  const s3 = editCard(s2, 'harbor', { title: 'Another' });
  assert.equal(getDraft(s0).cards.find(c => c.id === 'harbor').title,
    getDraft(freshLight()).cards.find(c => c.id === 'harbor').title);
});

// ── commit ───────────────────────────────────────────────────────────────────
test('commit on a valid stack returns a clean clone', () => {
  const s = freshLight();
  const result = commit(s);
  assert.deepEqual(result, lighthouse);
  // Mutate result; original draft unaffected
  result.title = 'X';
  assert.equal(commit(s).title, lighthouse.title);
});

test('commit throws on a stack with broken links', () => {
  const broken = structuredClone(lighthouse);
  broken.cards[0].choices[0].to = 'nonexistent';
  const s = createEditorState(broken);
  assert.throws(() => commit(s), /Broken link/);
});

test('commit throws when start card missing', () => {
  const s = editStackMeta(freshLight(), { start: 'nonexistent-start' });
  assert.throws(() => commit(s), /Start card/);
});

// ── interaction between editor and original stacks ───────────────────────────
test('both original stacks produce valid editor states that commit cleanly', () => {
  for (const stack of [lighthouse, circuit]) {
    const s = createEditorState(stack);
    assert.doesNotThrow(() => commit(s));
  }
});

test('editing card and undoing leaves commit result identical to original', () => {
  const s0 = createEditorState(circuit);
  const s1 = editCard(s0, 'gate', { title: 'Temp edit' });
  const s2 = undo(s1);
  assert.deepEqual(commit(s2), circuit);
});
