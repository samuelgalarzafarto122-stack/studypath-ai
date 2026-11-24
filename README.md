# StudyPath AI

A 10-week study coach for high school students who are struggling: a study plan built from their own
grades, an AI tutor that gives hints instead of answers, reminders, and progress they can see.
Made for an Innovation Project around this driving question:

> How can we design an 8–10 week program that uses an AI tutor and students' learning data to help
> struggling high school students understand the material, build better study habits, and improve their
> performance, while protecting their privacy?

It comes in two versions built from the same code:

| | Installable app | Online demo |
|---|---|---|
| Where | GitHub Pages (`docs/` folder) | A claude.ai page (`dist/studypath-online.html`) |
| Install on phone and computer | Yes (PWA), works offline | No, opens in the browser |
| Notifications | Phone/computer notifications + in-app inbox | In-app inbox only |
| Tutor | Built-in hint engine (works offline) | Claude, with the same "no answers" guard |
| Cloud | Optional Supabase database (`supabase/setup.sql`) | The viewer's private space on claude.ai |
| Research totals | Students who opt in, totals for groups of 5+ | Same, visible to the page owner only |

## What students can do

- **Grades and tests**: add grades (tests count 3×, quizzes 2×, homework 1×), see each class as
  *on track*, *watch* or *needs help*, and add upcoming tests.
- **A daily plan** that explains itself ("Math gets today's time because your test is in 3 days and you
  are 10 points under your goal"). It fits the minutes and days the student chose and skips rest days.
- **A focus timer** for each session, with a short tip for the study method (practice test, blank-page
  recall, flashcards, error analysis, teach it back…).
- **The 10-week program**: one habit per week (Start strong, Own your time, Test yourself, Space it out,
  Midpoint check, Learn from mistakes, Ask for help, Teach it back, Test-ready, Keep it going), with a
  3-minute lesson and a weekly challenge.
- **The tutor**: type a problem (linear and quadratic equations, systems, percents, slope, Pythagorean
  theorem, factoring, simplifying…) or a topic (26 short lessons in Biology, Chemistry, Physics, English,
  History and Civics). It gives a ladder of hints, checks the student's own answer and never states the
  final answer. Crisis messages get a fixed reply that points to a trusted adult and the 988 lifeline.
- **Weekly check-in** (mood, confidence, stress, sleep), with a suggestion to talk to a counselor when
  stress is high.
- **Progress**: average over time, per-class trends, study time against the weekly goal, tutor use and
  check-ins, with charts that can also be read as tables.
- **Reminders** for study time, upcoming tests (3 days before, the evening before, the morning of),
  grade drops, the weekly check-in, the streak, and each new program week. Quiet hours are respected.

## Privacy by design

- **Nickname only.** The app never asks for a real name, email, school or phone number. Two consent
  boxes are required at the start (read the privacy notes; 13 or older, parent/guardian aware if under 18).
- **Local first.** Everything is saved on the device (IndexedDB) and works without an account.
- **Cloud is optional.** Supabase: each student signs in anonymously (a random ID) and Row Level Security
  lets each one read and write only their own rows; signed-out requests can do nothing. claude.ai: data
  goes to `data/users/<id>/`, which nobody else can open, not even the page owner.
- **Research is opt-in and numbers only.** A student who opts in shares one weekly summary of numbers
  (average, study minutes, sessions, plan followed, hints per problem, tutor messages, reminders opened,
  check-in scores). No names, notes or chat text. The dashboard shows totals only, and hides any week or
  group with fewer than 5 students (checked in the app and again in the database).
- **Students stay in control.** Download everything (JSON, CSV), move to a new device with the file,
  or delete everything (device and cloud) from Profile.

## Run it on your computer

```bash
npm install
npm run serve          # http://localhost:8080 (the source, no build needed)
npm run build          # docs/ (installable app) + dist/studypath-online.html (online demo)
```

## Publish the installable app (GitHub Pages)

1. Push this repository to GitHub (the built app is in `docs/`).
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`,
   folder `/docs`, then **Save**.
3. After a minute or two the app is at `https://<user>.github.io/<repo>/`. Open it on a phone and use
   *Add to Home Screen* (iPhone, Safari) or *Install app* (Android/computer, Chrome or Edge).

Run `npm run build` again after changing anything in `src/` or `assets/`, and push `docs/`.

## Turn on the cloud database (Supabase, optional)

1. Create a free project at supabase.com.
2. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**.
3. **SQL Editor → New query**: paste all of `supabase/setup.sql` and run it.
4. Copy the **Project URL** (Project Settings → Data API) and the **publishable** key (Project Settings →
   API Keys: `sb_publishable_…`, or the legacy `anon` key). The **Connect** button at the top of the
   dashboard shows both. **Never** use the `secret`/`service_role` key in the app.
5. Put both in `docs/config.js` (and `config.js` for local runs). The build keeps an already filled
   `docs/config.js`.

The publishable key is meant to be public: the database rules (RLS) protect the data.

## Analyze the data

- In the app: **Progress → Research dashboard → Real data** shows weekly totals and the change in average
  by study time, and **Download totals (CSV)** opens in Google Sheets or Excel. A *Simulated class* mode
  shows the dashboard with 24 made-up students.
- In Supabase (project owner only), SQL Editor:
  `select * from analysis.weekly_totals;`, `analysis.grade_change`, `analysis.study_time_vs_change`,
  `analysis.participation`. These views read the research summaries only.

## Tests

```bash
npm test                                         # logic and tutor (28 tests, includes "never leaks the answer")
npm run serve & node tests/e2e/run.mjs http://localhost:8080/          # full student journey + phone layout
node tools/serve.mjs docs 8090 & node tests/e2e/run.mjs http://localhost:8090/ --offline   # built app, offline
node tests/e2e/online.mjs                        # online demo with a stand-in for claude.ai storage
```

The browser tests use Playwright. The database rules were tested against PostgreSQL 16 (own-rows
isolation, signed-out access denied, newest edit wins, totals hidden under 5 students).

## Known limits and next steps

- **iPhone notifications while the app is closed** need a Web Push server (a small scheduled function).
  The tables for it are ready in `setup.sql`; the sender is not built yet. Until then, iPhone reminders
  appear when the app is open, and every reminder lands in the in-app inbox. Android and computers with
  the installed app also get background checks (Periodic Background Sync, timing chosen by the browser).
- **Anonymous cloud accounts belong to one device.** Clearing the browser's data or changing devices
  starts a new ID; use *Download my data* and *Bring your data from a file* to move. A student who moves
  this way may be counted twice in research totals unless the old copy is deleted.
- **The installable app's tutor is the built-in hint engine.** Connecting it to an AI model needs a
  server function that keeps the API key secret and limits use; the online demo already uses Claude.
- Free Supabase projects pause after a week without activity; resume them from the dashboard.
- The Supabase project owner can see the stored backups (under random IDs) and is responsible for them.

## Project layout

```
index.html, sw.js, manifest.webmanifest, config.js   app shell, offline worker, install info, cloud keys
src/main.js            routing, rendering, events          src/state.js    the data store (IndexedDB)
src/views/             one file per screen                  src/ui/         charts, forms, sheets, timer
src/logic/             grades, planner, program, reminders, insights, research, sample student
src/tutor/             hint engine (math parser, problem ladders, topic lessons), AI guard
src/cloud/             sync engine + Supabase and claude.ai back ends
supabase/setup.sql     tables, security rules, sync and research functions, analysis views
tools/                 build, local server, icon generator
tests/                 unit tests and browser tests
```
