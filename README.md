# Helen

An adults-only conversational companion. Users create a fictional adult character, set their own boundaries, and chat. The companion remembers details, has a shifting mood, and keeps a consistent personality.

## Run

```bash
cp .env.example .env     # pick your LLM backend
npm start                # http://localhost:3000
npm test                 # safety unit tests
```

No dependencies are required (Node 20+).

## Features

- **Character builder**: name, age (18+ enforced), gender, orientation, personality, speaking style, appearance, backstory.
- **Memory**: facts the user shares ("my name is", "I love", "remember that") are kept per character and fed back into the conversation, along with recent history.
- **Mood**: affection, energy and playfulness shift with the conversation and drift back to baseline.
- **Natural conversation**: texting-style replies with feelings, questions and callbacks, a typing indicator and a short human-like delay.
- **Relationship progression**: new acquaintance, friend, close, partner. Tone deepens as you talk.
- **Time awareness**: the companion notices the time of day and when you've been away for a while.
- **Editable memories**: see, edit or delete everything a companion remembers.
- **Starter gallery** of original companions, plus **character card import** (TavernAI / SillyTavern JSON or PNG).
- **Photos**: upload a picture for each companion. Optional in-chat photos through a pluggable image backend (`IMAGE_PROVIDER`).
- **Voice**: replies read aloud and talk-to-type, using the browser's built-in speech features.
- **14 reply languages**, regenerate a reply, and download or erase all your data.

## Safeguards

| Safeguard | Where |
|---|---|
| 18+ age gate (date of birth + attestation) | `src/server.js` `/api/verify` |
| Characters must be adults, fictional, and not on the real-person blocklist | `src/safety.js` `validateCharacter`, `data/blocked-names.txt` |
| Minor references and non-consensual themes blocked on input and output | `src/safety.js` `containsProhibited` |
| User content level (none / romantic / sensual / explicit) and hard limits | Boundaries panel, `src/prompt.js` |
| Safe word and Stop button pause intimate content until the user resumes | `src/safety.js` `isSafeWord` |

The keyword filters are a first line of defence only. For a public launch, add a dedicated moderation model, proper age verification (ID or third-party service, as your jurisdiction requires), accounts with passwords, and encrypted storage.

## LLM backends

Adapters live in `src/adapters/`. Each exports `{ name, allowsExplicit, chat({ messages }) }`.

- `mock`: offline replies for development.
- `openai-compatible`: any `/v1/chat/completions` endpoint, including self-hosted model servers.

Many hosted providers prohibit sexually explicit generation in their usage policies. Check your provider's terms before setting `PROVIDER_ALLOWS_EXPLICIT=true`. While it is `false`, the "explicit" level is capped at "sensual".

See [CLOUD_SETUP.md](CLOUD_SETUP.md) to run Helen and a model in the cloud.

## Data

Everything is stored locally in `data/db.json`. Users can delete a character and its memories from the sidebar.
