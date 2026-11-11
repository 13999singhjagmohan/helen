import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { config } from './config.js';
import { getUser, save, deleteUser, newCharacterState, randomUUID } from './store.js';
import { TEMPLATES } from './templates.js';
import { rememberFacts, updateMood, moodLabel, bumpRelationship, relationshipStage } from './memory.js';
import { buildSystemPrompt } from './prompt.js';
import { createAdapter } from './adapters/index.js';
import { createImageAdapter } from './adapters/image.js';
import {
  ageFromDob, validateCharacter, containsProhibited, effectiveContentLevel,
  isSafeWord, CONTENT_LEVELS,
} from './safety.js';

const adapter = createAdapter();
const imageAdapter = createImageAdapter();
const HISTORY_TURNS = 20;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1.5e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
});

const sessionId = (req) => (req.headers.cookie || '').match(/sid=([\w-]+)/)?.[1];

function sanitizeProfile(body) {
  return {
    name: String(body.name || '').trim(),
    age: Number.parseInt(body.age, 10),
    gender: String(body.gender || '').slice(0, 40),
    orientation: String(body.orientation || '').slice(0, 40),
    personality: String(body.personality || '').slice(0, 600),
    speakingStyle: String(body.speakingStyle || '').slice(0, 300),
    appearance: String(body.appearance || '').slice(0, 600),
    backstory: String(body.backstory || '').slice(0, 1500),
    scenario: String(body.scenario || '').slice(0, 800),
    greeting: String(body.greeting || '').slice(0, 600),
    avatar: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.avatar || '') && body.avatar.length < 1e6 ? body.avatar : '',
    fictionalAttested: body.fictionalAttested === true,
  };
}

function createCharacter(user, profile) {
  const errors = validateCharacter(profile);
  if (profile.greeting && containsProhibited(profile.greeting)) errors.push('Greeting contains prohibited content.');
  if (errors.length) return { errors };
  const cid = randomUUID();
  const state = newCharacterState();
  if (profile.greeting) state.history.push({ role: 'assistant', content: profile.greeting });
  user.characters[cid] = { profile, state };
  save();
  return { character: { id: cid, ...profile } };
}

// Maps a TavernAI / SillyTavern style character card (v1 or v2 JSON) to our profile.
function fromCard(card, age) {
  const d = card?.spec === 'chara_card_v2' || card?.spec === 'chara_card_v3' ? card.data : card || {};
  return sanitizeProfile({
    name: d.name, age,
    personality: d.personality,
    appearance: '',
    backstory: d.description,
    scenario: d.scenario,
    greeting: d.first_mes,
    fictionalAttested: true,
  });
}

async function generate(user, ch, message, clientHour) {
  const b = user.boundaries;
  const contentLevel = b.paused ? 'none' : effectiveContentLevel(b.contentLevel, adapter.allowsExplicit);
  const system = buildSystemPrompt({
    character: ch.profile, state: ch.state, boundaries: b, contentLevel,
    language: user.prefs?.language, clientHour,
  });
  const history = ch.state.history.slice(-HISTORY_TURNS * 2).map(({ role, content }) => ({ role, content }));
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];
  let text = await adapter.chat({ messages });
  if (!text || containsProhibited(text)) text = "Let me steer us somewhere else. What's on your mind tonight?";
  return { text, contentLevel };
}

const charSummary = (cid, c) => ({
  id: cid, ...c.profile,
  stage: relationshipStage(c.state).name,
  mood: moodLabel(c.state.mood),
});

async function api(req, res, path) {
  const { id, user } = getUser(sessionId(req));
  user.prefs ??= { language: 'English', voice: false };
  const cookie = { 'Set-Cookie': `sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` };
  const reply = (status, body) => send(res, status, body, cookie);
  const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};

  if (path === '/api/me' && req.method === 'GET') {
    return reply(200, {
      verifiedAdult: user.verifiedAdult,
      boundaries: user.boundaries,
      prefs: user.prefs,
      characters: Object.entries(user.characters).map(([cid, c]) => charSummary(cid, c)),
      appName: config.appName,
      imagesEnabled: Boolean(imageAdapter),
      provider: adapter.name,
      providerAllowsExplicit: adapter.allowsExplicit,
      contentLevels: CONTENT_LEVELS,
    });
  }

  if (path === '/api/verify' && req.method === 'POST') {
    const age = ageFromDob(body.dob);
    if (!body.attest || age < config.minAge) {
      return reply(403, { error: `You must be ${config.minAge} or older to use this app.` });
    }
    user.verifiedAdult = true; save();
    return reply(200, { ok: true });
  }

  if (path === '/api/me' && req.method === 'DELETE') {
    deleteUser(id);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  if (!user.verifiedAdult) return reply(403, { error: 'Age verification required.' });

  if (path === '/api/export' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="companion-data.json"', ...cookie });
    return res.end(JSON.stringify(user, null, 2));
  }

  if (path === '/api/templates' && req.method === 'GET') return reply(200, TEMPLATES);

  if (path === '/api/prefs' && req.method === 'PUT') {
    if (typeof body.language === 'string') user.prefs.language = body.language.slice(0, 30);
    if (typeof body.voice === 'boolean') user.prefs.voice = body.voice;
    if (Array.isArray(body.customChips)) {
      user.prefs.customChips = body.customChips.map((c) => String(c).trim().slice(0, 120))
        .filter((c) => c && !containsProhibited(c)).slice(0, 12);
    }
    save();
    return reply(200, user.prefs);
  }

  if (path === '/api/boundaries' && req.method === 'PUT') {
    const b = user.boundaries;
    if (CONTENT_LEVELS.includes(body.contentLevel)) b.contentLevel = body.contentLevel;
    if (Array.isArray(body.hardLimits)) b.hardLimits = body.hardLimits.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 30);
    if (typeof body.safeWord === 'string' && body.safeWord.trim()) b.safeWord = body.safeWord.trim().slice(0, 30);
    if (typeof body.paused === 'boolean') b.paused = body.paused;
    save();
    return reply(200, b);
  }

  if (path === '/api/characters' && req.method === 'POST') {
    const r = createCharacter(user, sanitizeProfile(body));
    return r.errors ? reply(400, { errors: r.errors }) : reply(201, r.character);
  }

  if (path === '/api/import' && req.method === 'POST') {
    if (body.fictionalAttested !== true) return reply(400, { errors: ['Confirm the imported character is fictional and an adult.'] });
    const r = createCharacter(user, fromCard(body.card, Number.parseInt(body.age, 10)));
    return r.errors ? reply(400, { errors: r.errors }) : reply(201, r.character);
  }

  const charMatch = path.match(/^\/api\/characters\/([\w-]+)(\/chat|\/history|\/facts|\/regenerate|\/avatar|\/photo|\/suggest)?$/);
  if (charMatch) {
    const ch = user.characters[charMatch[1]];
    if (!ch) return reply(404, { error: 'Character not found.' });
    const sub = charMatch[2];
    const hour = Number.isInteger(body.clientHour) ? body.clientHour : undefined;

    if (!sub && req.method === 'DELETE') {
      delete user.characters[charMatch[1]]; save();
      return reply(200, { ok: true });
    }
    if (sub === '/history' && req.method === 'GET') {
      return reply(200, { history: ch.state.history, facts: ch.state.facts, ...charSummary(charMatch[1], ch) });
    }
    if (sub === '/history' && req.method === 'DELETE') {
      ch.state = newCharacterState(); save();
      return reply(200, { ok: true });
    }
    if (sub === '/suggest' && req.method === 'POST') {
      // Ask the connected model for short replies the user might send next, within their boundaries.
      try {
        const b = user.boundaries;
        const contentLevel = b.paused ? 'none' : effectiveContentLevel(b.contentLevel, adapter.allowsExplicit);
        const system = buildSystemPrompt({ character: ch.profile, state: ch.state, boundaries: b, contentLevel, language: user.prefs?.language, clientHour: hour });
        const recent = ch.state.history.slice(-10).map((m) => `${m.role === 'user' ? 'User' : ch.profile.name}: ${m.content}`).join('\n');
        const raw = await adapter.chat({ messages: [
          { role: 'system', content: `${system}\n\nYou are now helping the USER, not playing the character. Suggest 3 short, natural messages (max 12 words each) the user could send next, matching the content level above. Reply with one suggestion per line and nothing else.` },
          { role: 'user', content: recent || 'The conversation is just starting.' },
        ] });
        const suggestions = raw.split('\n').map((l) => l.replace(/^[\s\d.)*-]+/, '').replace(/^"|"$/g, '').trim())
          .filter((l) => l && l.length <= 120 && !containsProhibited(l)).slice(0, 3);
        return reply(200, { suggestions });
      } catch (err) {
        console.error(err.message);
        return reply(502, { error: 'The language model backend is unavailable.' });
      }
    }
    if (sub === '/avatar' && req.method === 'PUT') {
      const avatar = sanitizeProfile({ avatar: body.avatar }).avatar;
      if (!avatar) return reply(400, { error: 'Use a PNG, JPEG or WebP image under 1 MB.' });
      ch.profile.avatar = avatar; save();
      return reply(200, { ok: true });
    }
    if (sub === '/photo' && req.method === 'POST') {
      if (!imageAdapter) return reply(400, { error: 'Photos are not enabled. Set IMAGE_PROVIDER in .env.' });
      const request = String(body.request || '').slice(0, 300);
      if (containsProhibited(request)) return reply(400, { error: 'That request is not allowed.' });
      const p = ch.profile;
      const level = effectiveContentLevel(user.boundaries.paused ? 'none' : user.boundaries.contentLevel, adapter.allowsExplicit);
      const prompt = [
        `photo of a ${p.age}-year-old adult ${p.gender || 'person'}, clearly adult, mature features`,
        p.appearance, request,
        level === 'none' || level === 'romantic' ? 'fully clothed, tasteful' : level === 'sensual' ? 'tasteful glamour, no nudity' : '',
        user.boundaries.hardLimits.length ? `avoid: ${user.boundaries.hardLimits.join(', ')}` : '',
      ].filter(Boolean).join(', ');
      try {
        const image = await imageAdapter.generate(prompt);
        ch.state.history.push({ role: 'assistant', content: '[sent a photo]', image });
        save();
        return reply(200, { image });
      } catch (err) {
        console.error(err.message);
        return reply(502, { error: 'The image backend is unavailable.' });
      }
    }
    if (sub === '/facts' && req.method === 'PUT') {
      if (!Array.isArray(body.facts)) return reply(400, { error: 'facts must be a list.' });
      ch.state.facts = body.facts.map((f) => String(f).trim().slice(0, 200)).filter((f) => f && !containsProhibited(f)).slice(0, 60);
      save();
      return reply(200, { facts: ch.state.facts });
    }
    if (sub === '/regenerate' && req.method === 'POST') {
      const h = ch.state.history;
      if (h.length < 2 || h.at(-1).role !== 'assistant' || h.at(-2).role !== 'user') return reply(400, { error: 'Nothing to regenerate.' });
      h.pop();
      const userMsg = h.pop().content;
      try {
        const { text, contentLevel } = await generate(user, ch, userMsg, hour);
        h.push({ role: 'user', content: userMsg }, { role: 'assistant', content: text });
        save();
        return reply(200, { reply: text, contentLevel, ...charSummary(charMatch[1], ch) });
      } catch (err) {
        h.push({ role: 'user', content: userMsg });
        console.error(err.message);
        return reply(502, { error: 'The language model backend is unavailable.' });
      }
    }
    if (sub === '/chat' && req.method === 'POST') {
      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) return reply(400, { error: 'Empty message.' });
      const b = user.boundaries;

      if (isSafeWord(message, b.safeWord)) {
        b.paused = true;
        const text = "Okay. Stopping right here. You're in control, and I'm glad you said something. Do you want to talk about it, change the subject, or take a break?";
        ch.state.history.push({ role: 'user', content: message }, { role: 'assistant', content: text });
        save();
        return reply(200, { reply: text, paused: true, ...charSummary(charMatch[1], ch) });
      }

      if (containsProhibited(message)) {
        return reply(200, {
          reply: "That's something I won't go along with. Everyone here is an adult and everything stays consensual. Let's take this somewhere else.",
          blocked: true,
        });
      }

      rememberFacts(ch.state, message);
      updateMood(ch.state, message);
      bumpRelationship(ch.state, message);

      let result;
      try {
        result = await generate(user, ch, message, hour);
      } catch (err) {
        console.error(err.message);
        return reply(502, { error: 'The language model backend is unavailable.' });
      }
      ch.state.relationship.lastSeen = Date.now();
      ch.state.history.push({ role: 'user', content: message }, { role: 'assistant', content: result.text });
      if (ch.state.history.length > 400) ch.state.history = ch.state.history.slice(-400);
      save();
      return reply(200, { reply: result.text, paused: b.paused, contentLevel: result.contentLevel, facts: ch.state.facts, ...charSummary(charMatch[1], ch) });
    }
  }

  return reply(404, { error: 'Not found.' });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
    const routes = { '/': 'landing.html', '/app': 'index.html', '/app/': 'index.html' };
    const rel = routes[url.pathname] || url.pathname.slice(1);
    const file = normalize(join('public', rel));
    if (!file.startsWith('public')) return send(res, 403, { error: 'Forbidden' });
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, { error: 'Not found' });
    console.error(err);
    send(res, 500, { error: 'Server error' });
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Companion app on http://localhost:${config.port} (provider: ${adapter.name})`);
});
