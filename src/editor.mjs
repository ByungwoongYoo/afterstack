// AfterStack card/choice editor — pure state, no DOM, no network.
// An EditorState wraps a mutable stack draft and its own undo history.
// All mutations return a new EditorState; the original is never modified.
// "commit" validates and returns the stack or an error list.

import {validateStack} from './engine.mjs';

/** Maximum undo steps kept for the editor */
const MAX_EDITOR_UNDO = 50;

/** ID syntax rule shared with the engine */
const VALID_ID = /^[a-z0-9_-]{1,40}$/i;

function cloneStack(s) { return JSON.parse(JSON.stringify(s)); }

/**
 * Create a fresh EditorState from an existing stack object.
 * The stack is deep-cloned; the caller's copy is not affected.
 */
export function createEditorState(stack) {
  if (!stack || typeof stack !== 'object' || Array.isArray(stack))
    throw new Error('stack must be an object');
  return _make(cloneStack(stack), []);
}

function _make(draft, undoStack) {
  return { draft, _undo: undoStack };
}

function _push(prev, nextDraft) {
  const history = [cloneStack(prev.draft), ...prev._undo].slice(0, MAX_EDITOR_UNDO);
  return _make(nextDraft, history);
}

/**
 * Can undo?
 */
export function canUndo(state) { return state._undo.length > 0; }

/**
 * Undo last editor mutation. Returns the previous EditorState.
 * If there is nothing to undo, returns state unchanged.
 */
export function undo(state) {
  if (!state._undo.length) return state;
  const [head, ...tail] = state._undo;
  return _make(cloneStack(head), tail);
}

/**
 * Edit the stack-level fields (title, start, flags).
 * Pass only the fields you want to change.
 */
export function editStackMeta(state, { title, start, flags } = {}) {
  const d = cloneStack(state.draft);
  if (title !== undefined) d.title = title;
  if (start !== undefined) d.start = start;
  if (flags !== undefined) {
    if (!Array.isArray(flags)) throw new Error('flags must be an array');
    if (flags.some(f => typeof f !== 'string' || !VALID_ID.test(f)))
      throw new Error('Invalid flag name.');
    if (new Set(flags).size !== flags.length) throw new Error('Duplicate flag name.');
    if (flags.length > 16) throw new Error('Declare at most 16 flags.');
    d.flags = flags.slice();
  }
  return _push(state, d);
}

/**
 * Edit a card's title and/or body. cardId must exist.
 */
export function editCard(state, cardId, { title, body } = {}) {
  const d = cloneStack(state.draft);
  const card = d.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);
  if (title !== undefined) card.title = title;
  if (body !== undefined) card.body = body;
  return _push(state, d);
}

/**
 * Add a new card with the given id, title, and body.
 * Rejects duplicate or invalid IDs.
 */
export function addCard(state, { id, title = '', body = '' } = {}) {
  if (typeof id !== 'string' || !VALID_ID.test(id))
    throw new Error('Card ids use letters, numbers, _ or -.');
  const d = cloneStack(state.draft);
  if (d.cards.some(c => c.id === id))
    throw new Error(`Duplicate card: ${id}`);
  if (!Array.isArray(d.cards)) d.cards = [];
  if (d.cards.length >= 100) throw new Error('Use 1–100 cards.');
  d.cards.push({ id, title: String(title), body: String(body), choices: [] });
  return _push(state, d);
}

/**
 * Remove a card by id. Also removes all choices that point to it.
 * Refuses to remove a card that is the current start if it is the only card.
 */
export function removeCard(state, cardId) {
  const d = cloneStack(state.draft);
  const idx = d.cards.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error(`Card not found: ${cardId}`);
  if (d.cards.length <= 1) throw new Error('Cannot remove the only card.');
  d.cards.splice(idx, 1);
  // Remove dangling choices
  for (const card of d.cards)
    card.choices = (card.choices || []).filter(ch => ch.to !== cardId);
  // Fix start if needed
  if (d.start === cardId) d.start = d.cards[0].id;
  return _push(state, d);
}

/**
 * Add a choice to a card.
 * label: string, to: existing card id, optional flag arrays.
 */
export function addChoice(state, cardId, { label, to, require: req, forbid, set, clear } = {}) {
  if (typeof label !== 'string' || !label.trim())
    throw new Error('Choice label must not be empty.');
  const d = cloneStack(state.draft);
  const card = d.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);
  if (!d.cards.some(c => c.id === to))
    throw new Error(`Target card not found: ${to}`);
  if ((card.choices || []).length >= 8)
    throw new Error(`Card ${cardId} already has 8 choices.`);
  const flags = new Set(d.flags || []);
  for (const [field, arr] of [['require', req], ['forbid', forbid], ['set', set], ['clear', clear]]) {
    if (arr !== undefined) {
      if (!Array.isArray(arr)) throw new Error(`${field} must be an array`);
      for (const f of arr)
        if (!flags.has(f)) throw new Error(`Unknown flag "${f}" in ${field}.`);
    }
  }
  const choice = { label: label.trim(), to };
  if (req && req.length) choice.require = req.slice();
  if (forbid && forbid.length) choice.forbid = forbid.slice();
  if (set && set.length) choice.set = set.slice();
  if (clear && clear.length) choice.clear = clear.slice();
  card.choices.push(choice);
  return _push(state, d);
}

/**
 * Remove a choice from a card by index.
 */
export function removeChoice(state, cardId, choiceIndex) {
  const d = cloneStack(state.draft);
  const card = d.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);
  if (!Array.isArray(card.choices) || choiceIndex < 0 || choiceIndex >= card.choices.length)
    throw new Error(`Choice index ${choiceIndex} out of range in card ${cardId}.`);
  card.choices.splice(choiceIndex, 1);
  return _push(state, d);
}

/**
 * Edit a choice (label, to, flag arrays). Pass only fields to change.
 */
export function editChoice(state, cardId, choiceIndex, updates = {}) {
  const d = cloneStack(state.draft);
  const card = d.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);
  if (!Array.isArray(card.choices) || choiceIndex < 0 || choiceIndex >= card.choices.length)
    throw new Error(`Choice index ${choiceIndex} out of range in card ${cardId}.`);
  const ch = card.choices[choiceIndex];
  if (updates.label !== undefined) {
    if (typeof updates.label !== 'string' || !updates.label.trim())
      throw new Error('Choice label must not be empty.');
    ch.label = updates.label.trim();
  }
  if (updates.to !== undefined) {
    if (!d.cards.some(c => c.id === updates.to))
      throw new Error(`Target card not found: ${updates.to}`);
    ch.to = updates.to;
  }
  const flags = new Set(d.flags || []);
  for (const field of ['require', 'forbid', 'set', 'clear']) {
    if (updates[field] !== undefined) {
      const arr = updates[field];
      if (!Array.isArray(arr)) throw new Error(`${field} must be an array`);
      for (const f of arr)
        if (!flags.has(f)) throw new Error(`Unknown flag "${f}" in ${field}.`);
      if (arr.length) ch[field] = arr.slice();
      else delete ch[field];
    }
  }
  return _push(state, d);
}

/**
 * Validate and return the stack, or throw with the joined error list.
 */
export function commit(state) {
  const errors = validateStack(state.draft);
  if (errors.length) throw new Error(errors.join('\n'));
  return cloneStack(state.draft);
}

/**
 * Return a read-only view of the current draft.
 */
export function getDraft(state) { return cloneStack(state.draft); }
