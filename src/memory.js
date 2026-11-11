// Long-term memory, mood and relationship tracking.

const FACT_PATTERNS = [
  /\bmy name is ([a-z][a-z'-]{1,20})/i,
  /\bcall me ([a-z][a-z'-]{1,20})/i,
  /\bi (?:really )?(?:like|love|enjoy) ([^.!?]{2,60})/i,
  /\bi (?:hate|dislike|don't like) ([^.!?]{2,60})/i,
  /\bi work (?:as|at|in) ([^.!?]{2,60})/i,
  /\bi live in ([^.!?]{2,40})/i,
  /\bmy birthday is ([^.!?]{2,30})/i,
  /\bremember (?:that )?([^.!?]{3,80})/i,
];

export function extractFacts(message) {
  const found = [];
  for (const re of FACT_PATTERNS) {
    const m = message.match(re);
    if (m) found.push(m[0].trim());
  }
  return found;
}

export function rememberFacts(state, message, max = 60) {
  for (const f of extractFacts(message)) {
    if (!state.facts.some((x) => x.toLowerCase() === f.toLowerCase())) state.facts.push(f);
  }
  if (state.facts.length > max) state.facts = state.facts.slice(-max);
}

const clamp = (n) => Math.max(0, Math.min(100, n));
const WARM = /\b(love|miss|beautiful|handsome|sweet|thank|adore|cute|gorgeous|proud of you)\b/;

export function updateMood(state, message) {
  const m = message.toLowerCase();
  const mood = state.mood;
  if (WARM.test(m)) mood.affection += 6;
  if (/\b(hate you|shut up|stupid|boring|annoying)\b/.test(m)) mood.affection -= 10;
  if (/\b(haha|lol|lmao|tease|joke|play)\b/.test(m)) mood.playfulness += 6;
  if (/\b(tired|sad|lonely|stressed|bad day|anxious)\b/.test(m)) { mood.energy -= 5; mood.playfulness -= 4; }
  if (/!/.test(m)) mood.energy += 3;
  mood.affection = clamp(mood.affection + (50 - mood.affection) * 0.02);
  mood.energy = clamp(mood.energy + (60 - mood.energy) * 0.05);
  mood.playfulness = clamp(mood.playfulness + (50 - mood.playfulness) * 0.05);
}

export function moodLabel({ affection, energy, playfulness }) {
  if (affection < 30) return 'hurt and a little distant';
  if (energy < 35) return 'calm and gentle';
  if (playfulness > 70) return 'playful and teasing';
  if (affection > 75) return 'warm and affectionate';
  return 'relaxed and curious';
}

// Relationship deepens gradually with real conversation.
const STAGES = [
  { min: 0, name: 'new acquaintance', guide: 'You are just getting to know each other. Be friendly and curious, a little reserved.' },
  { min: 15, name: 'friend', guide: 'You are comfortable friends. Share opinions and small personal stories.' },
  { min: 50, name: 'close', guide: 'You are close and trust each other. Be openly affectionate and vulnerable at times.' },
  { min: 120, name: 'partner', guide: 'You are deeply bonded. Use inside jokes, pet names if fitting, and speak with familiarity.' },
];

export function bumpRelationship(state, message) {
  state.relationship ??= { points: 0, lastSeen: null };
  state.relationship.points += 1 + (message.length > 80 ? 1 : 0) + (WARM.test(message.toLowerCase()) ? 1 : 0);
}

export function relationshipStage(state) {
  const pts = state.relationship?.points || 0;
  return [...STAGES].reverse().find((s) => pts >= s.min);
}

export function timeContext(state, clientHour) {
  const parts = [];
  const last = state.relationship?.lastSeen;
  if (last) {
    const hours = (Date.now() - last) / 36e5;
    if (hours > 48) parts.push(`It has been about ${Math.round(hours / 24)} days since you last talked. You missed them; mention it naturally.`);
    else if (hours > 8) parts.push('You have not talked since earlier today or yesterday. Greet them like you are glad they are back.');
  }
  if (Number.isInteger(clientHour)) {
    const t = clientHour < 5 ? 'late at night' : clientHour < 12 ? 'morning' : clientHour < 18 ? 'afternoon' : 'evening';
    parts.push(`For the user it is currently ${t}.`);
  }
  return parts.join(' ');
}
