// Sample student for demos and presentations: "Alex", in week 6 of 10.
// All dates are relative to today, so the demo always looks current. Clearly marked as sample data.

import { emptyState } from '../state.js';
import { addDays, todayISO, weekday, uid, toISODate, parseISODate } from '../util.js';

function rng(seed) {
  // mulberry32: small deterministic random generator so the demo looks the same every time
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLASSES = [
  { key: 'math', name: 'Math', color: 's1', target: 80, teacher: 'Ms. Rivera' },
  { key: 'bio', name: 'Biology', color: 's2', target: 88, teacher: 'Mr. Chen' },
  { key: 'eng', name: 'English', color: 's3', target: 88, teacher: 'Ms. Okafor' },
  { key: 'hist', name: 'History', color: 's4', target: 85, teacher: 'Mr. Silva' },
  { key: 'chem', name: 'Chemistry', color: 's5', target: 88, teacher: 'Dr. Patel' },
];

// [day offset from program start, type, title, score out of 100]
const GRADES = {
  math: [
    [0, 'start', 'Starting grade', 62],
    [4, 'quiz', 'Quiz 1: Linear equations', 60],
    [8, 'homework', 'Homework: Slope', 75],
    [12, 'quiz', 'Quiz 2: Systems of equations', 66],
    [17, 'test', 'Test 1: Linear functions', 68],
    [22, 'homework', 'Homework: Exponent rules', 82],
    [26, 'quiz', 'Quiz 3: Polynomials', 74],
    [31, 'homework', 'Homework: Factoring', 80],
    [34, 'quiz', 'Quiz 4: Factoring quadratics', 78],
  ],
  bio: [
    [0, 'start', 'Starting grade', 75],
    [5, 'classwork', 'Lab: Using a microscope', 80],
    [10, 'quiz', 'Quiz: Cell organelles', 78],
    [14, 'homework', 'Homework: Cell membrane', 88],
    [19, 'test', 'Test: Cell structure', 84],
    [27, 'quiz', 'Quiz: Photosynthesis', 88],
    [33, 'project', 'Project: 3D cell model', 92],
  ],
  eng: [
    [0, 'start', 'Starting grade', 86],
    [6, 'project', 'Essay: Personal narrative', 88],
    [11, 'quiz', 'Quiz: Of Mice and Men, ch. 1–3', 84],
    [16, 'homework', 'Homework: Thesis statements', 92],
    [24, 'project', 'Essay: Literary analysis', 87],
    [30, 'quiz', 'Quiz: Vocabulary unit 4', 90],
  ],
  hist: [
    [0, 'start', 'Starting grade', 82],
    [7, 'quiz', 'Quiz: Industrial Revolution', 84],
    [13, 'homework', 'Homework: Primary sources', 90],
    [20, 'project', 'Project: Imperialism map', 85],
    [29, 'quiz', 'Quiz: Alliances in Europe', 68],
    [33, 'homework', 'Homework: Timeline of 1914', 64],
  ],
  chem: [
    [0, 'start', 'Starting grade', 88],
    [6, 'classwork', 'Lab: Density', 92],
    [12, 'quiz', 'Quiz: Atomic structure', 86],
    [18, 'homework', 'Homework: Periodic table', 94],
    [25, 'test', 'Test: Atoms and the periodic table', 88],
    [32, 'quiz', 'Quiz: Ionic bonds', 90],
  ],
};

// [days from today, class, title, topics]
const TESTS = [
  [3, 'math', 'Quadratic equations', 'Factoring, the quadratic formula, graphing parabolas'],
  [9, 'bio', 'Cell division', 'Mitosis, meiosis, the cell cycle'],
  [12, 'hist', 'Causes of World War I', 'Alliances, imperialism, nationalism, the assassination of Franz Ferdinand'],
];

const TUTOR = [
  // [day offset, class, problem, hints used, solved]
  [9, 'math', '3x + 7 = 22', 4, true],
  [11, 'math', '2(x - 4) = 10', 3, true],
  [13, 'chem', 'How do I balance H2 + O2 -> H2O?', 3, true],
  [16, 'math', '5x - 3 = 2x + 9', 3, true],
  [18, 'math', 'x^2 + 5x + 6 = 0', 4, false],
  [20, 'bio', 'What happens in photosynthesis?', 2, true],
  [23, 'math', 'x^2 - 9 = 0', 2, true],
  [25, 'math', 'x^2 + 7x + 12 = 0', 3, true],
  [27, 'hist', 'What were the main causes of WWI?', 2, true],
  [29, 'math', '4x + 1 = 2x - 7', 1, true],
  [31, 'math', 'x^2 - 5x + 6 = 0', 2, true],
  [33, 'math', '2x^2 + 7x + 3 = 0', 2, true],
  [35, 'math', 'x^2 + 2x - 15 = 0', 1, true],
];

const CHECKINS = [
  [6, 1, 3, 2, 4, 'Math is really hard right now. I don\'t know where to start on homework.'],
  [13, 2, 3, 3, 4, 'The 25-minute timer helps. Phone in the other room is hard but works.'],
  [20, 3, 4, 3, 3, 'Quizzing myself feels harder than reading notes but I remember more.'],
  [27, 4, 4, 4, 3, 'Flashcards for Chemistry are working. History is slipping a bit.'],
  [34, 5, 4, 4, 2, 'Math quiz went better (78!). I need to start History earlier.'],
];

const METHOD_BY_WEEK = [
  ['review', 'flashcards'],
  ['review', 'flashcards'],
  ['recall', 'practice'],
  ['flashcards', 'recall'],
  ['review', 'recall'],
  ['mistakes', 'recall'],
];

const isoAt = (date, hhmm) => {
  const d = parseISODate(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export function buildSampleState(today = todayISO()) {
  const r = rng(20261123);
  const start = addDays(today, -37);
  const s = emptyState(start);
  const t0 = isoAt(start, '16:00');
  s.onboarded = true;
  s.demo = true;
  Object.assign(s.profile, { nickname: 'Alex', gradeLevel: '10', goalAverage: 85, avatar: 'blue', createdAt: t0, updatedAt: t0 });
  Object.assign(s.consent, { privacy: true, ageOk: true, cloud: false, research: false, at: t0, updatedAt: t0 });
  Object.assign(s.settings, {
    studyDays: [1, 2, 3, 4, 5],
    studyTime: '17:00',
    sessionMinutes: 25,
    dailyMinutes: 50,
    updatedAt: t0,
  });
  s.settings.notifications.enabled = false;
  s.program = { startDate: start, lessonsDone: { 1: true, 2: true, 3: true, 4: true, 5: true }, reflections: {}, updatedAt: t0 };

  const ids = {};
  CLASSES.forEach((c, i) => {
    const id = uid();
    ids[c.key] = id;
    s.classes.push({ id, name: c.name, color: c.color, target: c.target, teacher: c.teacher, order: i, createdAt: t0, updatedAt: t0 });
  });

  for (const [key, list] of Object.entries(GRADES)) {
    for (const [off, type, title, score] of list) {
      const date = addDays(start, off);
      const at = isoAt(date, '18:30');
      s.grades.push({ id: uid(), classId: ids[key], type, title, score, maxScore: 100, date, createdAt: at, updatedAt: at });
    }
  }

  for (const [off, key, title, topics] of TESTS) {
    s.tests.push({ id: uid(), classId: ids[key], title, topics, date: addDays(today, off), createdAt: t0, updatedAt: t0 });
  }

  // Study sessions: the habit grows week by week; the last 12 days are a streak.
  const weights = [['math', 0.4], ['bio', 0.2], ['hist', 0.15], ['eng', 0.13], ['chem', 0.12]];
  const pickClass = () => {
    let x = r();
    for (const [k, w] of weights) {
      if ((x -= w) <= 0) return k;
    }
    return 'math';
  };
  for (let d = 0; d < 37; d++) {
    const date = addDays(start, d);
    const wd = weekday(date);
    const week = Math.floor(d / 7);
    const studyDay = wd >= 1 && wd <= 5;
    const p = studyDay ? 0.45 + week * 0.09 : 0.15;
    const forced = d >= 25; // streak
    if (!forced && r() > p) continue;
    const count = r() < 0.35 + week * 0.06 ? 2 : 1;
    const morning = r() < 0.18;
    let time = morning ? '07:20' : r() < 0.2 ? '20:00' : '17:00';
    for (let k = 0; k < count; k++) {
      const key = pickClass();
      const methods = METHOD_BY_WEEK[Math.min(week, METHOD_BY_WEEK.length - 1)];
      const method = methods[k % methods.length];
      const minutes = r() < 0.15 ? 15 : 25;
      const focus = morning ? 2 + Math.round(r() * 2) : time === '20:00' ? 3 + Math.round(r()) : 4 + Math.round(r());
      const at = isoAt(date, time);
      s.sessions.push({
        id: uid(),
        classId: ids[key],
        date,
        startTime: time,
        minutes,
        method,
        title: `${method === 'flashcards' ? 'Flashcards' : method === 'recall' ? 'Blank-page recall' : method === 'practice' ? 'Practice problems' : method === 'mistakes' ? 'Fix mistakes' : 'Review'}: ${CLASSES.find((c) => c.key === key).name}`,
        focus: Math.min(5, focus),
        source: 'plan',
        createdAt: at,
        updatedAt: at,
      });
      const [hh, mm] = time.split(':').map(Number);
      const next = hh * 60 + mm + minutes + 5;
      time = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    }
  }

  for (const [off, key, problem, hints, solved] of TUTOR) {
    const date = addDays(start, off);
    const at = isoAt(date, '17:40');
    const isMath = key === 'math' || /=/.test(problem);
    const kind = isMath ? 'problem' : 'concept';
    const msgs = [
      { role: 'user', text: problem, at },
      { role: 'tutor', text: 'Let\'s work through it together. What is the question asking you to find?', at, hintLevel: 1 },
    ];
    if (solved) msgs.push({ role: 'tutor', text: 'Yes! You solved it yourself. 🎉', at });
    s.tutor.push({
      id: uid(),
      classId: ids[key],
      kind: kind === 'problem' ? 'problem' : 'concept',
      title: problem,
      startedAt: at,
      hintsUsed: hints,
      solved,
      problems: kind === 'problem' ? 1 : 0,
      engine: 'built-in',
      messages: msgs,
      createdAt: at,
      updatedAt: at,
    });
  }

  for (const [off, week, mood, confidence, stress, note] of CHECKINS) {
    const date = addDays(start, off);
    const at = isoAt(date, '18:10');
    s.checkins.push({ id: uid(), week, date, mood, confidence, stress, sleep: 7, note, createdAt: at, updatedAt: at });
  }

  const now = Date.now();
  s.inbox = [
    {
      id: uid(),
      type: 'grades',
      title: 'History dropped to 79.5',
      body: 'Homework: Timeline of 1914 (64%) lowered your average by 1.5 points. Your plan gives History more time.',
      url: '#grades',
      at: now - 2 * 86400000 - 3 * 3600000,
      read: false,
    },
    {
      id: uid(),
      type: 'program',
      title: 'Week 6: Learn from mistakes',
      body: 'This week\'s habit: Error analysis. Open the 3-minute lesson.',
      url: '#program',
      at: now - (weekday(today) === 1 ? 2 : 1) * 3600000 * 6,
      read: true,
    },
    {
      id: uid(),
      type: 'streak',
      title: 'Keep your 11-day streak',
      body: 'One short session today keeps it going. Even 10 minutes counts.',
      url: '#plan',
      at: now - 86400000 + 3600000,
      read: true,
    },
  ];
  s.sync.dirty = {};
  return s;
}

export const SAMPLE_NOTE = 'Sample data: "Alex" is a made-up student in week 6. Nothing here is real.';

export { toISODate };
