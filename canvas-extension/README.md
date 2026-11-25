# StudyPath AI for Canvas (Chrome extension)

A Chrome/Edge extension that adds a **StudyPath panel** to Canvas pages. When a student opens their school's
Canvas, a blue **StudyPath** button appears at the bottom right. The panel shows:

- **Today's plan**: up to 3 study sessions that fit the student's daily minutes, each with the reason
  ("14 points under your 85% goal · Unit 4 Test in 2 days"), a study method and a focus timer.
- **Missing** work and what is **due in the next 7 days** (tests are marked).
- **Classes** with the current grade, a bar against the goal and a status (*On track*, *Watch*, *Needs help*).
- A button to open the **StudyPath AI tutor** (hints, not answers).
- **Demo mode** with a made-up student, so a presentation never shows real grades.

## Install it (Instalarla) — 2 minutes

1. Download this folder (`canvas-extension`) or unzip `studypath-canvas-extension.zip`.
2. In Chrome go to `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `canvas-extension` folder.
5. Pin it: click the puzzle icon in the toolbar and pin **StudyPath AI**.
6. Open your Canvas. If the address ends in `.instructure.com`, the button appears by itself.
   If your school uses its own address (like `canvas.myschool.org`), open Canvas, click the StudyPath
   icon in the toolbar and press **Use StudyPath on this site**.

**Para la presentación:** click the StudyPath icon → **Open the demo page**. It shows a pretend LMS
dashboard with the panel already open and fake data. No Canvas account needed.

> School-managed Chromebooks or browsers may block "Load unpacked". If so, use a personal computer for
> the demo, or show the demo page.

## How it works

```
Canvas page (student already signed in)
   └─ content script (panel.js) ── GET /api/v1/courses?include[]=total_scores      → grades
                                ── GET /api/v1/planner/items                        → what's due, tests
                                ── GET /api/v1/users/self/missing_submissions       → missing work
                                        │
                                   logic.js builds the plan (same idea as the StudyPath app)
                                        │
                                   panel drawn in a Shadow DOM on top of Canvas
```

- It uses the Canvas REST API through the session the student already has open, so **no password and no
  API token** are typed, stored or sent.
- **Read-only:** only GET requests. It cannot submit, change or delete anything in Canvas.
- **Data stays in the browser.** Grades are read when the panel opens and kept in memory only. The only
  thing saved is settings (goal %, minutes per day, demo mode) in `chrome.storage.local`.
- Permissions: `*.instructure.com` only. Any other site needs the student to say yes for that one site.

| File | What it does |
|---|---|
| `manifest.json` | Extension settings (Manifest V3) |
| `logic.js` | Plan and priorities (pure functions, tested in `tests/unit/canvas-extension.test.mjs`) |
| `canvas-api.js` | Reads the 3 Canvas endpoints and turns them into simple data; demo student |
| `panel.js`, `panel.css` | The panel and the focus timer |
| `popup.html`, `popup.js` | Toolbar popup: demo mode, demo page, "use on this site" |
| `demo.html` | Pretend LMS page for presentations |

## The "official" way: LTI 1.3 (for the project write-up)

Canvas has an official system for outside tools called **LTI 1.3** (Learning Tools Interoperability).
Tools like Khan Academy, Quizlet or Google Assignments plug into Canvas this way. With LTI, StudyPath could
appear **inside Canvas itself**: as a link in each course's left menu, in the student's account menu, or
as an assignment. This is how a real school would adopt StudyPath.

**What it needs:**

1. **A server** (backend) with a public HTTPS address. LTI works by Canvas and the tool talking to each
   other, so a static site like GitHub Pages isn't enough. (Example: Supabase Edge Functions, Vercel, Render.)
2. **A Canvas administrator** at the school creates a *Developer Key* (LTI key) for StudyPath and installs
   the tool. **Students and teachers can't do this step**, so Samuel can't turn it on himself.
3. **The launch:** when a student clicks "StudyPath" in Canvas, Canvas sends a signed message
   (OpenID Connect + a JWT) saying who the student is and which course they're in. StudyPath checks the
   signature, so no separate login is needed.
4. **Grades and assignments:** with LTI Advantage services (and an API key the admin approves),
   StudyPath could read the student's assignments and scores, the same data the extension reads today.
5. **Privacy review:** the school checks what data the tool receives and where it is stored (in the US,
   FERPA, plus state student-privacy laws). StudyPath's design (nickname, minimum data, opt-in research,
   totals for groups of 5+) is written for this.

**Extension vs. LTI**

| | Chrome extension (built) | LTI 1.3 (official) |
|---|---|---|
| Who installs it | The student, on their own browser | A Canvas admin, for the whole school |
| Needs a server | No | Yes |
| Where it shows | A panel on top of Canvas pages | Inside Canvas menus and courses |
| Data it can read | The student's own grades and assignments | What the admin allows (usually course + student) |
| Good for | A working demo now, one student | A real rollout to many students |

**Plan for the project:** the extension is the working prototype students can try today. LTI 1.3 is the
"next step" if the school likes it: the same plan logic moves to a server, and a Canvas admin installs it.
