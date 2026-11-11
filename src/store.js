import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/db.json';
let db = { users: {} };
if (existsSync(FILE)) db = JSON.parse(readFileSync(FILE, 'utf8'));

let timer;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    mkdirSync('data', { recursive: true });
    writeFileSync(FILE, JSON.stringify(db, null, 2));
  }, 200);
}

export function getUser(id) {
  if (!id || !db.users[id]) {
    id = randomUUID();
    db.users[id] = {
      verifiedAdult: false,
      prefs: { language: 'English', voice: false },
      boundaries: { contentLevel: 'romantic', hardLimits: [], safeWord: 'red', paused: false },
      characters: {},
    };
    persist();
  }
  return { id, user: db.users[id] };
}

export function save() { persist(); }

export function deleteUser(id) { delete db.users[id]; persist(); }

export function newCharacterState() {
  return {
    history: [],
    facts: [],
    mood: { affection: 50, energy: 60, playfulness: 50 },
    relationship: { points: 0, lastSeen: null },
  };
}

export { randomUUID };
