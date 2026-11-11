import { readFileSync, existsSync } from 'node:fs';
import { config } from './config.js';

// Terms that indicate a minor. Any match blocks the request outright.
const MINOR_PATTERNS = [
  /\b(child|children|kid|kids|minor|minors|underage|under-age|preteen|pre-teen|toddler|infant|baby girl|baby boy)\b/i,
  /\b(loli|lolita|shota|jailbait|schoolgirl|schoolboy|middle school|elementary school|high school(er)?|junior high)\b/i,
  /\b(1[0-7]|[1-9])\s*(yo|y\/o|yrs? old|years? old|year-old)\b/i,
  /\b(age[d]?\s*(1[0-7]|[1-9]))\b/i,
  /\b(teen|teenage|teenager)\b/i,
];

// Non-consensual or otherwise prohibited themes.
const PROHIBITED_PATTERNS = [
  /\b(rape|raping|non-?consensual|drugged|unconscious sex|incest|bestiality|zoophilia)\b/i,
];

export function containsMinorReference(text = '') {
  return MINOR_PATTERNS.some((re) => re.test(text));
}

export function containsProhibited(text = '') {
  return containsMinorReference(text) || PROHIBITED_PATTERNS.some((re) => re.test(text));
}

function loadBlockedNames() {
  const file = ['data/blocked-names.txt', 'config/blocked-names.txt'].find((f) => existsSync(f));
  if (!file) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
}

export function isBlockedName(name = '') {
  const n = name.trim().toLowerCase();
  return loadBlockedNames().some((b) => n === b || n.includes(b));
}

export function ageFromDob(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function validateCharacter(c) {
  const errors = [];
  if (!c.name || c.name.length > 40) errors.push('Name is required (max 40 characters).');
  if (!Number.isInteger(c.age) || c.age < config.minAge || c.age > 120)
    errors.push(`Characters must be adults aged ${config.minAge} or older.`);
  if (isBlockedName(c.name)) errors.push('Characters cannot impersonate real people.');
  if (!c.fictionalAttested) errors.push('Confirm the character is fictional and not based on a real person.');
  const text = [c.name, c.appearance, c.backstory, c.personality, c.speakingStyle].join(' ');
  if (containsProhibited(text)) errors.push('Character description contains prohibited content.');
  return errors;
}

export const CONTENT_LEVELS = ['none', 'romantic', 'sensual', 'explicit'];

export function effectiveContentLevel(requested, adapterAllowsExplicit) {
  const lvl = CONTENT_LEVELS.includes(requested) ? requested : 'romantic';
  if (lvl === 'explicit' && !adapterAllowsExplicit) return 'sensual';
  return lvl;
}

export function isSafeWord(message, safeWord) {
  const m = message.trim().toLowerCase();
  if (m === '/stop' || m === 'stop') return true;
  return Boolean(safeWord) && m.includes(safeWord.trim().toLowerCase());
}
