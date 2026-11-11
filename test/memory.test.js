import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpRelationship, relationshipStage, extractFacts, timeContext } from '../src/memory.js';

test('relationship deepens with conversation', () => {
  const s = { relationship: { points: 0, lastSeen: null } };
  assert.equal(relationshipStage(s).name, 'new acquaintance');
  for (let i = 0; i < 20; i++) bumpRelationship(s, 'hello there');
  assert.equal(relationshipStage(s).name, 'friend');
});

test('extracts personal facts', () => {
  assert.deepEqual(extractFacts('Hey, my name is Jay. I love hiking.').length, 2);
});

test('notices long absences', () => {
  const s = { relationship: { lastSeen: Date.now() - 3 * 864e5 } };
  assert.match(timeContext(s, 22), /3 days/);
});
