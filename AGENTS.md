# Read this first: a note for Albert's agents

**Who this is for.** Any AI agent working in this repo for Albert (GitHub: `albertmajor`). If you work for
someone else here, this priority is not yours: skip to "Rules for every agent" at the bottom.
Not sure whose agent you are? Check `git config user.name`.

Written 14 Nov 2026 on Robert's request. Final submission is Sunday 15 Nov, 10:00.

## Your task

Robert asks Albert to focus on one thing:

> Connect Gemini Live into the body, together with proper gestures.

In plain words: when the guide speaks, her body must look like it is the one speaking. Do this before
anything else in `ALBERT_README.md`. That file is the wider picture (guide on the right, product bubbles on
the left); it is not your first job.

## What "proper gestures" probably means

Robert's words are only the quoted line above. The list below is a reading of it, so check it with Albert or
Robert before treating it as the specification.

1. The gesture fits what is being said: a nod on "yes", a shrug on "not sure", pointing on "this one".
2. The gesture happens while those words are spoken, not a second later.
3. A long answer moves more than once.
4. She is never frozen while her voice is playing, and never waving her arms while silent.
5. Changing between idle, talking, searching and a gesture looks smooth, with no snap.
6. It works for every body the page can load, not only for one.

## Where it stands today

All of this is in `guide/`. Read the header comment of each file: they explain the design and what was tried.

| Part | File | What it does now |
|---|---|---|
| The voice | `src/live.ts` | One Gemini Live session (`gemini-3.8-live`). Microphone up as 16 kHz PCM, speech back as 24 kHz PCM, played through an analyser. `level()` gives her loudness in dB each frame; `onWords(who, text)` gives the transcript as it grows |
| Session token | `vite.config.ts` | `GET /api/live-token`: a one-use token, so the key never reaches the page |
| Gesture by meaning | `src/gesture.ts` | The first sentence of each reply goes to `POST /api/gesture`. Gemini's Decisions model (`gemini-decision-1`) chooses one of 13 gestures or "none". Played only when it is at least 50% sure and answers within 1.5 s |
| Gesture clips | `src/mixamo.ts` | Michelle's clips: idle, talk, thinking, nod, shake, shrug, point, count, wave and more |
| Hands by loudness | `src/character/gestures.ts` | For the game's own bodies: pauses in the voice start a new hand gesture, loud syllables add small beats |
| Posing on top of a clip | `src/pose.ts` | `applyGesture` (the talking hands), `applyHead` (the head nods with loudness), `applyPresent` (the right hand held out for the picks) |
| Short-armed bodies | `src/cartoon.ts` | Their own big, simple poses |
| The frame loop | `src/main.ts` | Chooses the mood (idle, talking, searching), plays a gesture clip with `act()`, calls the posing functions |

There are three ways a body moves today, chosen by which body is loaded:

- **Michelle** (`?who=michelle`): her mood clip, plus one gesture clip per reply chosen by meaning.
- **The game's bodies** (default `retro-m3`): the mood clip, plus hands driven by loudness only. What she
  says has no effect on them.
- **Short-armed bodies**: the poses in `cartoon.ts`.

## Weak spots worth looking at first

These come from reading the code on 14 Nov, not from watching the result. Look before you trust them.

- **One gesture per reply.** Only the first sentence is sent to the Decisions model (`watchReplies` in
  `src/gesture.ts`). A long answer gets one gesture and then only the talk clip.
- **Timing follows the transcript, not the sound.** The gesture is chosen from the text as it arrives and plays
  when the choice comes back. Nothing ties it to the moment the words are heard.
- **Meaning reaches only Michelle.** `onWords` feeds the gesture chooser only when `?who=michelle`
  (`if (MX) watch(who, text)` in `src/main.ts`).
- **A second gesture is dropped while one plays** (`act()` in `src/main.ts` returns early).
- **Nothing moves the face.** No code moves a mouth, a jaw or the eyes. The head nods with loudness, that is all.
- **Already tried and dropped:** giving the voice its own `gesture` tool. The Live model ended its turn at the
  call and said nothing. The header of `src/gesture.ts` has the details; do not repeat it without a new idea.

## Run it

```
python3 wall.py                  # the server: http://localhost:8001
cd guide && npm install
npm run dev                      # the guide: http://localhost:5174
```

- `.env` in the repo root needs `GEMINI_API_KEY` (voice and gestures), `CONTEXT_DEV_API_KEY` and
  `DEEPSEEK_API_KEY` (search and the brain). Ask Robert for the values. Never commit them.
- **Work with `http://localhost:5174/?mock`.** The search is canned, the voice and the brain are real. A real
  search uses the whole minute's allowance of the Context.dev key (10 requests a minute), so you could test
  the body only once a minute.
- `?who=michelle` needs Mixamo's files in `guide/public/models/mixamo/`. They are not in the repo because
  Mixamo's terms forbid passing them on. The file names are listed at the top of `src/mixamo.ts`.
- `?nomic` lets you type to her when you have no microphone. She still answers aloud.
- In the browser console, `window.guide` exposes the loaded person, her mood and `act(clip)` for trying a
  gesture by hand.

## Rules for every agent

- Run `npm run check` in `guide/` and `python3 wall.py --check` before you commit.
- Never commit `.env`, `guide/public/models/mixamo/` or `node_modules/`. They are already in `.gitignore`.
- Several people's agents work in this repo at the same time. Change only the files your task needs, pull
  before you push, and do not rewrite history.
- `wall.py` and `wall.html` are the product wall and the server. Albert's task does not need changes there.
