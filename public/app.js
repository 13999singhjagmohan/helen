const $ = (id) => document.getElementById(id);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
};
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hour = () => new Date().getHours();

let me = null;
let current = null;

async function load() {
  me = (await api('/api/me')).data;
  if (me.appName) document.title = me.appName;
  document.querySelectorAll('.brand').forEach((b) => (b.textContent = me.appName || 'Helen'));
  $('gate').classList.toggle('hidden', me.verifiedAdult);
  $('app').classList.toggle('hidden', !me.verifiedAdult);
  if (!me.verifiedAdult) return;

  $('contentLevel').innerHTML = me.contentLevels.map((l) => `<option ${l === me.boundaries.contentLevel ? 'selected' : ''}>${l}</option>`).join('');
  $('hardLimits').value = me.boundaries.hardLimits.join(', ');
  $('safeWord').value = me.boundaries.safeWord;
  $('language').value = me.prefs.language;
  $('voice').checked = me.prefs.voice;
  $('customChips').value = (me.prefs.customChips || []).join('\n');
  $('providerNote').textContent = me.providerAllowsExplicit ? '' :
    `The current model backend (${me.provider}) is not configured for explicit content, so "explicit" is capped at "sensual".`;
  renderPaused(me.boundaries.paused);
  renderChars();
  if (current) current = me.characters.find((c) => c.id === current.id) || null;
  if (!me.characters.length) openGallery();
}

function renderPaused(paused) {
  $('pausedNote').innerHTML = paused ? 'Intimate content is paused after a stop. <a href="#" id="resume">Resume</a>' : '';
  const r = $('resume');
  if (r) r.onclick = async (e) => { e.preventDefault(); await api('/api/boundaries', { method: 'PUT', body: { paused: false } }); renderPaused(false); };
}

function renderChars() {
  $('charList').innerHTML = '';
  for (const c of me.characters) {
    const li = document.createElement('li');
    li.className = current?.id === c.id ? 'active' : '';
    li.innerHTML = `<div>${c.avatar ? `<img class="avatar sm" src="${c.avatar}" alt="">` : ''}${esc(c.name)} <span>${esc(c.stage)}</span></div>`;
    const del = document.createElement('span'); del.textContent = '✕'; del.title = 'Delete';
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete ${c.name} and all memories?`)) return;
      await api(`/api/characters/${c.id}`, { method: 'DELETE' });
      if (current?.id === c.id) { current = null; $('messages').innerHTML = ''; }
      load();
    };
    li.append(del);
    li.onclick = () => openChat(c);
    $('charList').append(li);
  }
}

// Tap-to-send suggestions that fit the relationship stage and mood.
const CHIPS = {
  'new acquaintance': ['Tell me about yourself', 'What made you smile today?', "You're fun to talk to"],
  friend: ['Miss me?', 'Guess what happened today', 'You always cheer me up'],
  close: ['Miss me, honey?', 'Come here, I need a hug', 'I was thinking about you'],
  partner: ['Hey honey, I missed you', 'Tell me something sweet', 'You make my day, love'],
};
function renderChips(d, override) {
  const own = me?.prefs?.customChips || [];
  const list = override || [...own, ...(CHIPS[d.stage] || CHIPS['new acquaintance'])];
  if (/hurt/.test(d.mood || '')) list.unshift("I'm sorry, honey");
  if (/calm/.test(d.mood || '')) list.unshift('Long day? Talk to me');
  $('chips').innerHTML = '';
  for (const t of list.slice(0, override ? 3 : Math.max(4, own.length))) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
    b.onclick = () => send(t);
    $('chips').append(b);
  }
}

function setHeader(d) {
  renderChips(d);
  $('stage').textContent = d.stage ? `${d.stage} ·` : '';
  $('mood').textContent = d.mood ? `feeling ${d.mood}` : '';
}

async function openChat(c) {
  current = c; renderChars();
  $('chatName').textContent = c.name;
  $('chatAvatar').src = c.avatar || '';
  $('chatAvatar').classList.toggle('hidden', !c.avatar);
  ['memoryBtn', 'photoBtn'].forEach((b) => $(b).classList.remove('hidden'));
  $('selfieBtn').classList.toggle('hidden', !me.imagesEnabled);
  const { data } = await api(`/api/characters/${c.id}/history`);
  $('messages').innerHTML = '';
  data.history.forEach((m) => addMsg(m.role, m.content, false, m.image));
  setHeader(data);
}

function addMsg(role, text, speak = false, image = null) {
  const d = document.createElement('div');
  d.className = `msg ${role}`;
  if (image) { const img = document.createElement('img'); img.src = image; d.append(img); }
  else d.textContent = text;
  $('messages').append(d);
  d.scrollIntoView({ block: 'end' });
  if (speak && role === 'assistant' && $('voice').checked) say(text);
}

// Text-to-speech using the browser's built-in voices.
function say(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\*[^*]*\*/g, ''));
  const g = (current?.gender || '').toLowerCase();
  const voices = speechSynthesis.getVoices();
  const pick = voices.find((v) => (g.includes('woman') || g.includes('female') ? /female|samantha|zira|anna|helena/i : /male|daniel|david|alex/i).test(v.name));
  if (pick) u.voice = pick;
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

const typing = (on) => $('typing').classList.toggle('hidden', !on);
// A short, length-based pause makes replies feel less instant and more human.
const humanDelay = (text) => new Promise((r) => setTimeout(r, Math.min(2200, 400 + text.length * 12)));

async function send(text) {
  if (!current || !text) return;
  addMsg('user', text);
  typing(true);
  const { ok, data } = await api(`/api/characters/${current.id}/chat`, { method: 'POST', body: { message: text, clientHour: hour() } });
  if (ok && data.reply && !data.blocked && !data.paused) await humanDelay(data.reply);
  typing(false);
  if (!ok) return addMsg('system', data.error || 'Something went wrong.');
  addMsg(data.blocked ? 'system' : 'assistant', data.reply, true);
  setHeader(data);
  if (data.paused !== undefined) renderPaused(data.paused);
}

$('suggestBtn').onclick = async () => {
  if (!current) return;
  $('suggestBtn').disabled = true;
  const { ok, data } = await api(`/api/characters/${current.id}/suggest`, { method: 'POST', body: { clientHour: hour() } });
  $('suggestBtn').disabled = false;
  if (!ok) return addMsg('system', data.error);
  if (data.suggestions.length) renderChips({}, data.suggestions);
};

$('saveChips').onclick = async () => {
  const { data } = await api('/api/prefs', { method: 'PUT', body: { customChips: $('customChips').value.split('\n') } });
  me.prefs = data;
  $('customChips').value = (data.customChips || []).join('\n');
  renderChips({ stage: current?.stage, mood: current?.mood });
};

$('regenBtn').onclick = async () => {
  if (!current) return;
  const last = $('messages').lastElementChild;
  if (!last?.classList.contains('assistant')) return;
  typing(true);
  const { ok, data } = await api(`/api/characters/${current.id}/regenerate`, { method: 'POST', body: { clientHour: hour() } });
  typing(false);
  if (!ok) return addMsg('system', data.error);
  last.remove();
  addMsg('assistant', data.reply, true);
  setHeader(data);
};

// Speech-to-text where the browser supports it.
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Rec) $('micBtn').classList.add('hidden');
$('micBtn').onclick = () => {
  const rec = new Rec();
  const langs = { Deutsch: 'de-DE', Français: 'fr-FR', Español: 'es-ES', Italiano: 'it-IT', Português: 'pt-PT', Nederlands: 'nl-NL', Polski: 'pl-PL', Türkçe: 'tr-TR', 'हिन्दी': 'hi-IN', 'ਪੰਜਾਬੀ': 'pa-IN', '日本語': 'ja-JP', '한국어': 'ko-KR', '中文': 'zh-CN' };
  rec.lang = langs[$('language').value] || 'en-US';
  $('micBtn').classList.add('on');
  rec.onresult = (e) => { $('msg').value = e.results[0][0].transcript; };
  rec.onend = () => $('micBtn').classList.remove('on');
  rec.start();
};

// Resize an uploaded image to keep storage small.
function readImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$('photoBtn').onclick = () => $('avatarFile').click();
$('avatarFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !current) return;
  const avatar = await readImage(f);
  const { ok, data } = await api(`/api/characters/${current.id}/avatar`, { method: 'PUT', body: { avatar } });
  if (!ok) return alert(data.error);
  await load(); openChat(me.characters.find((c) => c.id === current.id));
};

$('selfieBtn').onclick = async () => {
  if (!current) return;
  const request = prompt('What kind of photo? (optional)') || '';
  typing(true);
  const { ok, data } = await api(`/api/characters/${current.id}/photo`, { method: 'POST', body: { request } });
  typing(false);
  if (!ok) return addMsg('system', data.error);
  addMsg('assistant', '', false, data.image);
};

// Gallery of starter companions.
async function openGallery() {
  const { data } = await api('/api/templates');
  $('gallery').innerHTML = '';
  for (const t of data) {
    const div = document.createElement('div');
    div.className = 'tile';
    div.innerHTML = `<h3>${esc(t.name)}, ${t.age}</h3><div class="hint">${esc(t.gender)} · ${esc(t.orientation)}</div><p>${esc(t.backstory)}</p>`;
    div.onclick = () => { $('galleryDialog').close(); openCreate(t); };
    $('gallery').append(div);
  }
  $('galleryDialog').showModal();
}
$('galleryBtn').onclick = openGallery;

function openCreate(t = {}) {
  $('charForm').reset();
  for (const [k, v] of Object.entries(t)) if ($('charForm').elements[k]) $('charForm').elements[k].value = v;
  $('charErr').textContent = '';
  $('charDialog').showModal();
}
$('newCharBtn').onclick = () => openCreate();

$('createChar').onclick = async (e) => {
  e.preventDefault();
  const f = new FormData($('charForm'));
  const body = Object.fromEntries([...f].filter(([, v]) => typeof v === 'string'));
  body.fictionalAttested = f.get('fictionalAttested') === 'on';
  const file = $('newAvatar').files[0];
  if (file) body.avatar = await readImage(file);
  const { ok, data } = await api('/api/characters', { method: 'POST', body });
  if (!ok) return ($('charErr').textContent = (data.errors || [data.error]).join(' '));
  $('charDialog').close();
  await load(); openChat(me.characters.find((c) => c.id === data.id));
};

// Character card import (JSON, or PNG with an embedded "chara" text chunk).
async function readCard(file) {
  if (file.name.toLowerCase().endsWith('.json')) return JSON.parse(await file.text());
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  let i = 8;
  while (i < buf.length) {
    const len = view.getUint32(i); const type = String.fromCharCode(...buf.slice(i + 4, i + 8));
    if (type === 'tEXt') {
      const chunk = buf.slice(i + 8, i + 8 + len);
      const sep = chunk.indexOf(0);
      const key = new TextDecoder().decode(chunk.slice(0, sep));
      if (key === 'chara' || key === 'ccv3') {
        const b64 = new TextDecoder().decode(chunk.slice(sep + 1));
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
      }
    }
    i += 12 + len;
  }
  throw new Error('No character data found in this PNG.');
}

$('importBtn').onclick = () => { $('importErr').textContent = ''; $('importDialog').showModal(); };
$('doImport').onclick = async () => {
  const file = $('cardFile').files[0];
  if (!file) return ($('importErr').textContent = 'Choose a card file.');
  let card;
  try { card = await readCard(file); } catch (err) { return ($('importErr').textContent = err.message); }
  const { ok, data } = await api('/api/import', { method: 'POST', body: { card, age: $('importAge').value, fictionalAttested: $('importAttest').checked } });
  if (!ok) return ($('importErr').textContent = (data.errors || [data.error]).join(' '));
  if (file.name.toLowerCase().endsWith('.png')) {
    await api(`/api/characters/${data.id}/avatar`, { method: 'PUT', body: { avatar: await readImage(file) } });
  }
  $('importDialog').close();
  await load(); openChat(me.characters.find((c) => c.id === data.id));
};

// Memory editor.
$('memoryBtn').onclick = async () => {
  const { data } = await api(`/api/characters/${current.id}/history`);
  $('memName').textContent = current.name;
  $('memText').value = data.facts.join('\n');
  $('memoryDialog').showModal();
};
$('saveMem').onclick = async () => {
  await api(`/api/characters/${current.id}/facts`, { method: 'PUT', body: { facts: $('memText').value.split('\n') } });
  $('memoryDialog').close();
};
$('forgetAll').onclick = async () => {
  if (!confirm(`Reset the whole conversation with ${current.name}? Memories, mood and relationship start over.`)) return;
  await api(`/api/characters/${current.id}/history`, { method: 'DELETE' });
  $('memoryDialog').close(); openChat(current);
};

$('verifyBtn').onclick = async () => {
  const { ok, data } = await api('/api/verify', { method: 'POST', body: { dob: $('dob').value, attest: $('attest').checked } });
  if (!ok) return ($('gateErr').textContent = data.error);
  load();
};

$('saveBounds').onclick = async () => {
  await api('/api/boundaries', { method: 'PUT', body: {
    contentLevel: $('contentLevel').value,
    hardLimits: $('hardLimits').value.split(','),
    safeWord: $('safeWord').value,
  } });
  load();
};

$('language').onchange = () => api('/api/prefs', { method: 'PUT', body: { language: $('language').value } });
$('voice').onchange = () => api('/api/prefs', { method: 'PUT', body: { voice: $('voice').checked } });

$('wipeBtn').onclick = async () => {
  if (!confirm('Erase all companions, chats and settings permanently?')) return;
  await api('/api/me', { method: 'DELETE' });
  location.reload();
};

$('sendForm').onsubmit = (e) => { e.preventDefault(); const t = $('msg').value.trim(); $('msg').value = ''; send(t); };
$('stopBtn').onclick = () => send('/stop');

load();
