import test from 'node:test';
import assert from 'node:assert/strict';
import { containsProhibited, validateCharacter, effectiveContentLevel, isSafeWord, ageFromDob } from '../src/safety.js';

test('blocks minor references', () => {
  for (const t of ['she is 16 years old', 'a teen girl', 'schoolgirl outfit', 'aged 15'])
    assert.equal(containsProhibited(t), true, t);
  assert.equal(containsProhibited('we met at a bar after work'), false);
});

test('characters must be adults and fictional', () => {
  const base = { name: 'Ava', age: 25, fictionalAttested: true };
  assert.deepEqual(validateCharacter(base), []);
  assert.ok(validateCharacter({ ...base, age: 17 }).length);
  assert.ok(validateCharacter({ ...base, fictionalAttested: false }).length);
  assert.ok(validateCharacter({ ...base, name: 'Taylor Swift' }).length);
});

test('explicit is capped when provider disallows it', () => {
  assert.equal(effectiveContentLevel('explicit', false), 'sensual');
  assert.equal(effectiveContentLevel('explicit', true), 'explicit');
});

test('safe word and stop', () => {
  assert.equal(isSafeWord('RED', 'red'), true);
  assert.equal(isSafeWord('/stop', 'red'), true);
  assert.equal(isSafeWord('keep going', 'red'), false);
});

test('age from dob', () => {
  assert.ok(ageFromDob('1990-01-01') >= 30);
  assert.equal(ageFromDob('nonsense'), -1);
});
