import test from 'node:test';
import assert from 'node:assert/strict';
import {StackSession,validateStack,explore} from '../src/engine.mjs';
import {lighthouse,circuit} from '../src/stacks.mjs';

test('both original stacks have reachable endings',()=>{for(const s of [lighthouse,circuit]){assert.deepEqual(validateStack(s),[]);assert.ok(explore(s).endings.length>0);}});
test('lighthouse cannot skip missing parts',()=>{const s=new StackSession(lighthouse);s.choose(1);s.choose(0);s.choose(1);s.choose(1);s.choose(1);assert.equal(s.cardId,'lamp');assert.equal(s.choices().length,1);assert.equal(s.choices()[0].to,'harbor');});
test('complete lighthouse route really reaches ending',()=>{const s=new StackSession(lighthouse);s.choose(0);s.choose(0);s.choose(0);s.choose(0);s.choose(1);s.choose(0);s.choose(1);s.choose(1);s.choose(1);s.choose(0);assert.equal(s.cardId,'ending');assert.equal(s.choices().length,0);});
test('undo restores state rather than just moving the card',()=>{const s=new StackSession(circuit);s.choose(0);assert.ok(s.flags.has('switch_a'));s.back();assert.ok(!s.flags.has('switch_a'));assert.equal(s.cardId,'gate');});
test('save restore round trip',()=>{const a=new StackSession(lighthouse);a.choose(0);a.choose(0);const b=new StackSession(lighthouse);assert.deepEqual(b.restore(a.save()),a.view());});
test('mismatched or forged save rejected',()=>{const s=new StackSession(lighthouse);const d=JSON.parse(s.save());d.flags=['not-a-real-flag'];assert.throws(()=>s.restore(JSON.stringify(d)));d.flags=[];d.stackId='other';assert.throws(()=>s.restore(JSON.stringify(d)));});
test('broken links, duplicate ids, unknown effects rejected',()=>{const s=structuredClone(circuit);s.cards[0].choices[0].to='missing';s.cards[0].choices[0].set=['foreign'];s.cards.push(structuredClone(s.cards[0]));const e=validateStack(s);assert.ok(e.some(x=>x.includes('Broken')));assert.ok(e.some(x=>x.includes('Duplicate')));assert.ok(e.some(x=>x.includes('Unknown')));});
test('invalid choice cannot move or mutate state',()=>{const s=new StackSession(circuit);const before=s.save();assert.throws(()=>s.choose(-1));assert.equal(s.save(),before);});
test('circuit only opens when both switches are closed',()=>{const s=new StackSession(circuit);assert.ok(!s.choices().some(x=>x.to==='lit'));s.choose(0);assert.ok(!s.choices().some(x=>x.to==='lit'));s.choose(0);const i=s.choices().findIndex(x=>x.to==='lit');assert.ok(i>=0);s.choose(i);assert.equal(s.cardId,'lit');});
