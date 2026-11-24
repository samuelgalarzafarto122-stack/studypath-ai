// The 10-week StudyPath program. Each week adds one study habit backed by learning research
// (retrieval practice, spacing, error analysis, the Feynman technique...). The weekly challenge
// is measured automatically from the student's own data.

import { addDays, daysBetween, todayISO, clamp } from '../util.js';
import { activeClasses } from './grades.js';
import { tutorDate } from './stats.js';

export const PROGRAM_WEEKS = 10;

export const PROGRAM = [
  {
    n: 1,
    title: 'Start strong',
    habit: 'Know where you stand',
    lesson: [
      'StudyPath runs for 10 weeks. Each week adds one study habit that research shows really helps students learn. This week is about seeing clearly where you are, so the app can plan the right things for you.',
      'Students who set specific goals ("raise Math from 68 to 78 by the end of the semester") improve more than students with vague goals ("do better").',
      'Make your goal a little hard but possible. A good rule is 5 to 10 points above your current average.',
    ],
    tips: [
      'Enter every grade you get back, even the bad ones. Bad grades are the most useful data.',
      'Add each test date as soon as you hear about it.',
      'Focus first on the class with the lowest grade or the closest test.',
    ],
    challenge: { text: 'Add your classes, a grade for each class, and your next test.', metric: 'setup', target: 3 },
    bias: [],
  },
  {
    n: 2,
    title: 'Own your time',
    habit: 'Short, focused sessions',
    lesson: [
      'Long study marathons feel productive, but focus drops after about 25 to 30 minutes. Short sessions with breaks (the Pomodoro technique) make it easier to start and to keep going.',
      'Your phone is the biggest focus killer. Even a phone face down on the desk lowers attention. Put it in another room or turn on focus mode.',
      'Studying at the same time every day turns it into a habit, so it takes less willpower.',
    ],
    tips: [
      'Start the session timer before you open your notes.',
      'On breaks, stand up and drink water. No scrolling.',
      'Can\'t get started? Promise yourself just 10 minutes.',
    ],
    challenge: { text: 'Finish 4 focus sessions this week.', metric: 'sessions', target: 4 },
    bias: [],
  },
  {
    n: 3,
    title: 'Test yourself',
    habit: 'Active recall',
    lesson: [
      'Re-reading notes feels easy, and that is the problem: it creates a feeling of knowing without real memory. Testing yourself is harder, and that effort is what makes memories last.',
      'Try the blank-page method: close your notes, write everything you remember about a topic, then open your notes and fill the gaps in another color.',
      'Getting answers wrong while practicing is good. Each mistake shows you exactly what to study.',
    ],
    tips: [
      'Turn headings into questions and answer them without looking.',
      'Do practice problems before re-reading the chapter.',
      'Use the tutor\'s "Quiz me" button.',
    ],
    challenge: { text: 'Do 3 recall or practice sessions.', metric: 'recall', target: 3 },
    bias: ['recall', 'practice'],
  },
  {
    n: 4,
    title: 'Space it out',
    habit: 'Spaced repetition',
    lesson: [
      'We forget most new information within a few days unless we review it. Reviewing a little on several days beats one long cram session the night before.',
      'A simple schedule: review new material 1 day later, then 3 days later, then 7 days later.',
      'Cramming can work for tomorrow, but you forget it fast, and the next unit builds on it.',
    ],
    tips: [
      'Make flashcards for key terms and formulas.',
      'Mix an older topic into today\'s practice.',
      'Start studying for a test at least 5 days before it.',
    ],
    challenge: { text: 'Study on 3 different days this week.', metric: 'days', target: 3 },
    bias: ['flashcards', 'recall'],
  },
  {
    n: 5,
    title: 'Midpoint check',
    habit: 'Reflect and adjust',
    lesson: [
      'You are halfway there. Good learners stop to check what is working, the way a coach watches game footage.',
      'Open Progress: which habits did you actually do, and which grades moved?',
      'Change one thing for the next weeks: a different study time, shorter sessions, more practice problems, or asking for help sooner.',
    ],
    tips: [
      'Be honest in your check-in. Nobody grades it.',
      'Compare your average now with week 1.',
      'If a class is not improving, talk to your teacher this week.',
    ],
    challenge: { text: 'Complete this week\'s check-in.', metric: 'checkin', target: 1 },
    bias: [],
  },
  {
    n: 6,
    title: 'Learn from mistakes',
    habit: 'Error analysis',
    lesson: [
      'When a test comes back, most students look at the score and put it away. The points you lost are a map of what to study next.',
      'Sort each mistake: you did not understand the idea (concept), you knew it but slipped (careless), or you ran out of time (time).',
      'Concept mistakes need re-learning and practice. Careless mistakes need a checking routine. Time mistakes need timed practice.',
    ],
    tips: [
      'Keep a mistake log: the problem, the mistake type, what to do next time.',
      'Redo the problems you missed without looking at the solution.',
      'Ask the tutor to help you find where you went wrong.',
    ],
    challenge: { text: 'Work through 3 problems with the tutor.', metric: 'tutor', target: 3 },
    bias: ['mistakes'],
  },
  {
    n: 7,
    title: 'Ask for help',
    habit: 'Get unstuck faster',
    lesson: [
      'Asking for help early is a skill, not a weakness. Students who ask questions learn faster.',
      'A good question says what you tried: "I got x = 7 but the key says 5. I think my mistake is in step 2."',
      'Use hints one at a time. After each hint, try for a few minutes before asking for the next one.',
    ],
    tips: [
      'Write down questions during class to ask later.',
      'Visit your teacher\'s help hours once this week.',
      'Try to solve a tutor problem with 2 hints or fewer.',
    ],
    challenge: { text: 'Solve 3 tutor problems with 2 hints or fewer.', metric: 'independent', target: 3 },
    bias: ['tutor'],
  },
  {
    n: 8,
    title: 'Teach it back',
    habit: 'The Feynman technique',
    lesson: [
      'If you can explain something in simple words, you really understand it. If you get stuck explaining, you just found a gap.',
      'Pick a topic and explain it out loud as if to a younger student. Then check your notes for what you missed.',
      'Teaching a friend or someone at home works even better.',
    ],
    tips: [
      'Explain it without using the textbook\'s words.',
      'Draw a diagram while you explain.',
      'Record a 2-minute voice note explaining one idea.',
    ],
    challenge: { text: 'Do 2 teach-back sessions.', metric: 'teach', target: 2 },
    bias: ['teach'],
  },
  {
    n: 9,
    title: 'Test-ready',
    habit: 'Practice like it\'s real',
    lesson: [
      'The best test prep is a practice test under real conditions: timed, no notes, no phone.',
      'Sleep matters. Your brain saves memories while you sleep, so an all-nighter usually lowers your score.',
      'Feeling nervous is normal. Slow breathing (in for 4 seconds, out for 6) calms your body. Start with the questions you know to build momentum.',
    ],
    tips: [
      'Take one timed practice test this week.',
      'Pack your materials the night before.',
      'Aim for 8 hours of sleep before a test.',
    ],
    challenge: { text: 'Take 1 timed practice test.', metric: 'practice', target: 1 },
    bias: ['practice'],
  },
  {
    n: 10,
    title: 'Keep it going',
    habit: 'Make it stick',
    lesson: [
      'In 10 weeks you built real study habits. Now the goal is to keep the ones that worked for you.',
      'Compare your grades, study time and confidence with week 1 on the Progress screen.',
      'Choose 2 or 3 habits to keep and set your goals for next semester.',
    ],
    tips: [
      'Keep your study time on your calendar.',
      'Keep using the tutor for hints, not answers.',
      'Tell a friend what worked for you.',
    ],
    challenge: { text: 'Complete your final check-in.', metric: 'checkin', target: 1 },
    bias: [],
  },
];

export function programDay(state, today = todayISO()) {
  return daysBetween(state.program.startDate, today);
}

/** 1..10 (stays at 10 after the program ends). */
export function currentWeek(state, today = todayISO()) {
  return clamp(Math.floor(programDay(state, today) / 7) + 1, 1, PROGRAM_WEEKS);
}

export function programFinished(state, today = todayISO()) {
  return programDay(state, today) >= PROGRAM_WEEKS * 7;
}

export function weekRange(state, n) {
  const start = addDays(state.program.startDate, (n - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function weekInfo(n) {
  return PROGRAM[clamp(n, 1, PROGRAM_WEEKS) - 1];
}

const inRange = (date, r) => date >= r.start && date <= r.end;

/** How far the student is with a week's challenge, measured from their data. */
export function challengeProgress(state, n) {
  const w = weekInfo(n);
  const r = weekRange(state, n);
  const target = w.challenge.target;
  const sessions = state.sessions.filter((s) => !s.deleted && s.date && inRange(s.date, r));
  const tutor = state.tutor.filter((t) => !t.deleted && tutorDate(t) && inRange(tutorDate(t), r));
  let done = 0;
  switch (w.challenge.metric) {
    case 'setup': {
      const classes = activeClasses(state);
      const withGrade = classes.filter((c) => state.grades.some((g) => !g.deleted && g.classId === c.id));
      done =
        (classes.length > 0 ? 1 : 0) +
        (classes.length > 0 && withGrade.length === classes.length ? 1 : 0) +
        (state.tests.some((t) => !t.deleted) ? 1 : 0);
      break;
    }
    case 'sessions':
      done = sessions.length;
      break;
    case 'recall':
      done = sessions.filter((s) => s.method === 'recall' || s.method === 'practice').length;
      break;
    case 'days':
      done = new Set(sessions.map((s) => s.date)).size;
      break;
    case 'checkin':
      done = state.checkins.some((c) => !c.deleted && c.week === n) ? 1 : 0;
      break;
    case 'tutor':
      done = tutor.filter((t) => t.kind === 'problem' || (t.problems || 0) > 0).length;
      break;
    case 'independent':
      done = tutor.filter((t) => t.solved && (t.hintsUsed ?? 99) <= 2).length;
      break;
    case 'teach':
      done = sessions.filter((s) => s.method === 'teach').length;
      break;
    case 'practice':
      done = sessions.filter((s) => s.method === 'practice').length;
      break;
    default:
      done = 0;
  }
  return { done: Math.min(done, target), target, complete: done >= target, text: w.challenge.text };
}

export function lessonDone(state, n) {
  return Boolean(state.program.lessonsDone?.[n]);
}
