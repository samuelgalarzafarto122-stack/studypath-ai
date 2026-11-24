// The built-in tutor. It works offline and never gives final answers:
// it gives one hint at a time, checks the student's own answers, teaches concepts step by step,
// and has guardrails for answer-seeking ("just tell me") and for students in distress.

import { analyzeProblem, revealsAnswer } from './problems.js';
import { findConcept, conceptById, conceptsFor, matches } from './concepts.js';

// ---------- guardrails & intents ----------
const SAFETY = /\b(kill(ing)? myself|suicid\w*|want(ing)? to die|wanna die|end (my life|it all)|hurt(ing)? myself|self[- ]?harm|cut(ting)? myself|no reason to live|better off dead|don'?t want to (be alive|live))\b/i;
const ABUSE = /\b(someone is hurting me|being abused|abus(e|ed|ing) me|unsafe at home|not safe at home|hits me|beats me|touch(ed|es|ing) me)\b/i;
const BULLY = /\b(bull(y|ied|ying)|harass(ed|ing)?)\b/i;
const STRESS = /\b(stress(ed)?|anxious|anxiety|overwhelm(ed|ing)?|panic(king)?|freaking out|burn(ed|t) out|hate school|want to give up|so tired of)\b/i;
const CHEAT = /\b(just|only)\s+(tell|give|show)\b|\b(give|tell|show|send)\s+me\s+(the\s+)?(final\s+)?(answer|solution|result)s?\b|\bwhat('?s| is| are)\s+the\s+(final\s+)?(answer|solution)s?\b|\b(solve|do|finish)\s+(it|this|that|these)\s+for\s+me\b|\bdo\s+my\s+(homework|assignment|worksheet)\b|\banswer\s+key\b/i;
const WRITE_FOR_ME = /\b(write|type|make)\s+(me\s+)?(my|the|an?|this)\s+(essay|paragraph|report|story|poem|conclusion|introduction|intro|thesis|summary|lab report)\b/i;
const HINT = /^\s*(hint|another hint|next hint|more help|help( me)?|i'?m stuck|stuck|i don'?t know|idk|no idea|i don'?t (get|understand) (it|this)|where do i (start|begin)|i don'?t know where to start|what do i do( next)?|next step|what'?s next)\b/i;
const QUIZ = /\b(quiz me|practice( problem)?s?|give me (a|another|one more) (problem|question|one)|test me|harder( one)?|another one|new problem|easier( one)?|one more)\b/i;
const GREET = /^\s*(hi|hello|hey|hola|yo|good (morning|afternoon|evening)|sup)\b/i;
const THANKS = /^\s*(thanks|thank you|thx|ty|ok(ay)? thanks|got it|cool)\b/i;
const CHECK_HOW = /\b(how (do|can|would) i check|check my (work|answer)|am i right)\b/i;
const ASKS_TOPIC = /\b(what (is|are)|explain|teach me|tell me about|how (does|do)|help (me )?(with|understand)|learn about|study)\b/i;
const ANSWERISH = /^\s*(i got|i get|my answer|the answer is|answer:|i think( it'?s)?|is it|it'?s|so it'?s|[a-z]\s*=)/i;

export const SAFETY_REPLY =
  'I\'m really glad you told me, and I\'m sorry you\'re feeling this way. You deserve support right now. ' +
  'Please talk to someone you trust today: a parent, a teacher or your school counselor. ' +
  'In the US you can call or text **988** (Suicide & Crisis Lifeline) any time, day or night. It\'s free and private. ' +
  'If you are in danger right now, call **911**. I\'m only a study app, but real people can help with this.';

export const ABUSE_REPLY =
  'Thank you for telling me. What\'s happening is not your fault, and you deserve to be safe. ' +
  'Please tell a trusted adult as soon as you can, like a teacher or your school counselor. ' +
  'In the US you can call or text the Childhelp hotline at **1-800-422-4453** any time. If you are in danger right now, call **911**.';

export const BULLY_REPLY =
  'I\'m sorry that\'s happening. Being bullied is never your fault. Tell a trusted adult (a teacher, counselor or parent) and keep screenshots if it\'s online. ' +
  'You don\'t have to handle it alone. When you\'re ready, I\'m here to help with schoolwork.';

const LAST_HINT =
  'That was my last hint for this one. Try the step now, then type your answer and I\'ll check it. If you\'re still stuck, show your work to your teacher: you\'re close.';

export const STARTER_CHIPS = ['Help me with a problem', 'Explain a concept', 'Quiz me', 'I made a mistake on a test'];

const MATHY = /math|algebra|geometry|calc|trig|stat|pre-?cal|arith|number/i;

function rand(rng = Math.random) {
  return rng;
}

// ---------- practice problems ----------
export function generatePractice(level = 1, rng = Math.random) {
  const R = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const nz = (a, b) => {
    let v = 0;
    while (v === 0) v = R(a, b);
    return v;
  };
  const sgn = (n) => (n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`);
  const coefX = (a) => (a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`);
  if (level <= 1) {
    const a = R(2, 9);
    const x = nz(-9, 9);
    const b = nz(-15, 15);
    return `${coefX(a)} ${sgn(b)} = ${a * x + b}`;
  }
  if (level === 2) {
    const a = R(4, 9);
    const c = R(1, a - 2);
    const x = nz(-8, 8);
    const b = nz(-12, 12);
    const d = a * x + b - c * x;
    return `${coefX(a)} ${sgn(b)} = ${coefX(c)} ${sgn(d)}`;
  }
  if (level === 3) {
    const r1 = nz(-9, 9);
    let r2 = nz(-9, 9);
    if (r2 === -r1) r2 = r1 === 9 ? 8 : r1 + 1;
    const b = -(r1 + r2);
    const c = r1 * r2;
    return `x^2 ${b === 0 ? '' : sgn(b) + 'x '}${sgn(c)} = 0`.replace(/\+ 1x/, '+ x').replace(/- 1x/, '- x');
  }
  if (level === 4) {
    const a = R(2, 3);
    const p = nz(-5, 5);
    const q = nz(-6, 6);
    // (a x - p)(x - q) = a x² - (a q + p) x + p q
    const b = -(a * q + p);
    const c = p * q;
    return `${a}x^2 ${b === 0 ? '' : sgn(b) + 'x '}${sgn(c)} = 0`.replace(/\+ 1x/, '+ x').replace(/- 1x/, '- x');
  }
  let a1, b1, a2, b2;
  do {
    a1 = nz(-5, 5);
    b1 = nz(-5, 5);
    a2 = nz(-5, 5);
    b2 = nz(-5, 5);
  } while (a1 * b2 - a2 * b1 === 0);
  const x = nz(-6, 6);
  const y = nz(-6, 6);
  const eq = (a, b) => `${coefX(a)} ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${a * x + b * y}`;
  return `${eq(a1, b1)} and ${eq(a2, b2)}`;
}

// ---------- session helpers ----------
export function newTutorRecord({ classId = null, engine = 'built-in' } = {}) {
  return {
    classId,
    kind: 'chat',
    title: 'New conversation',
    startedAt: new Date().toISOString(),
    messages: [],
    problem: null,
    concept: null,
    hintsUsed: 0,
    solved: false,
    problems: 0,
    attempts: 0,
    level: 1,
    engine,
  };
}

export function currentProblem(rec) {
  if (!rec?.problem?.text) return null;
  try {
    return analyzeProblem(rec.problem.text);
  } catch {
    return null;
  }
}

/** Does the message look like an answer to the active problem rather than a new problem? */
function answerLike(text, prob) {
  if (ANSWERISH.test(text)) return true;
  const t = text.trim();
  if (/^[-+]?\d+(\.\d+)?(\/\d+)?(\s*(,|and|or)\s*[-+]?\d+(\.\d+)?(\/\d+)?)*\s*%?$/.test(t)) return true;
  if (prob?.kind === 'factor' || prob?.kind === 'simplify' || prob?.kind === 'quadratic') return !t.includes('=') || /=\s*0\s*$/.test(t);
  return false;
}

/** Work out what the student wants. Does not change anything. */
export function classify(rec, text) {
  const t = String(text || '').trim();
  if (!t) return { intent: 'empty' };
  if (SAFETY.test(t)) return { intent: 'safety' };
  if (ABUSE.test(t)) return { intent: 'abuse' };
  if (BULLY.test(t) && /\b(me|i'?m|i am)\b/i.test(t)) return { intent: 'bully' };
  const prob = rec?.problem && !rec.problem.solved ? currentProblem(rec) : null;
  if (WRITE_FOR_ME.test(t)) return { intent: 'write-for-me' };
  if (CHEAT.test(t)) return { intent: 'cheat', prob };
  if (HINT.test(t)) return { intent: 'hint', prob };
  if (QUIZ.test(t) && !analyzeProblem(t)) return { intent: 'quiz', harder: /harder|one more|another/i.test(t), easier: /easier/i.test(t) };

  const conceptActive = rec?.concept && (rec.concept.mode === 'teach' || rec.concept.mode === 'quiz');
  if (conceptActive) {
    // Only switch topics on an explicit request; a one-word answer like "nucleus" is a reply.
    const other = findConcept(t);
    if (other && other.id !== rec.concept.id && ASKS_TOPIC.test(t)) return { intent: 'new-concept', concept: other };
    const p = analyzeProblem(t);
    if (p && t.includes('=')) return { intent: 'new-problem', problem: p };
    return { intent: 'concept-reply' };
  }

  if (prob) {
    const verdict = prob.check(t);
    const p = analyzeProblem(t);
    const isAnswer = answerLike(t, prob);
    if (p && p.display !== prob.display && !isAnswer) return { intent: 'new-problem', problem: p };
    if (verdict.verdict !== 'unclear') return { intent: 'answer', verdict, prob };
    if (CHECK_HOW.test(t)) return { intent: 'check-how', prob };
  }
  const p = analyzeProblem(t);
  if (p) return { intent: 'new-problem', problem: p };
  const c = findConcept(t);
  if (c) return { intent: 'new-concept', concept: c };
  if (GREET.test(t)) return { intent: 'greet' };
  if (THANKS.test(t)) return { intent: 'thanks' };
  if (STRESS.test(t)) return { intent: 'stress' };
  if (/\b(mistake|got (it|them) wrong|wrong on (my|the) (test|quiz))\b/i.test(t)) return { intent: 'mistake' };
  if (/\b(explain|concept|what is|what are|how does|how do|why)\b/i.test(t)) return { intent: 'explain-request' };
  if (/\b(help (me )?with a problem|problem)\b/i.test(t)) return { intent: 'problem-request' };
  return { intent: 'unknown', prob };
}

/** Should this message start a fresh conversation record (a new problem after a finished/other one)? */
export function startsNewRecord(rec, analysis) {
  if (!rec) return true;
  if (analysis.intent === 'new-problem') return Boolean(rec.problem) || Boolean(rec.concept);
  if (analysis.intent === 'new-concept') return Boolean(rec.problem) || Boolean(rec.concept);
  return false;
}

function nextHint(rec, prob) {
  const i = rec.problem.hintIndex ?? 1;
  if (i >= prob.hints.length) return { text: LAST_HINT, gave: false };
  rec.problem.hintIndex = i + 1;
  rec.hintsUsed = (rec.hintsUsed || 0) + 1;
  return { text: `**Hint ${i + 1} of ${prob.hints.length}:** ${prob.hints[i]}`, gave: true };
}

// How to write the answer, with a blank instead of a number: an example like "x = 5" could be the
// real answer (it was, for 3x + 7 = 22).
function answerFormat(p) {
  const v = p?.variable || 'x';
  if (p?.kind === 'system') return 'like `x = …, y = …`';
  if (['simplify', 'factor', 'polynomial'].includes(p?.kind)) return 'the simplified expression';
  if (['percent', 'slope', 'pythagorean', 'arithmetic'].includes(p?.kind) || !p?.variable) return 'just the number';
  return `like \`${v} = …\``;
}

function startProblem(rec, p, text) {
  rec.kind = 'problem';
  rec.title = p.display;
  rec.problem = { text: p.display.includes(' and ') && p.kind === 'system' ? p.display : text, kind: p.kind, hintIndex: 1, attempts: 0, solved: false };
  // Keep the exact original text so the problem can be re-read later.
  rec.problem.text = text;
  rec.problems = 1;
  rec.concept = null;
  let reply = `${p.intro}\n\n${p.hints[0]}\n\nType your next step or your answer (${answerFormat(p)}). Tap **Hint** if you get stuck.`;
  if (/\b(i got|i get|my answer|answer is|i think)\b/i.test(text)) {
    const tail = text.split(/\b(?:i got|i get|my answer is|answer is|i think)\b/i).pop();
    const v = p.check(tail);
    if (v.verdict === 'correct') {
      rec.problem.solved = true;
      rec.solved = true;
      reply = `Let's check your answer to **${p.display}**.\n\n${v.feedback}`;
      return { reply, events: { newProblem: true, solved: true } };
    }
    if (v.verdict !== 'unclear') {
      rec.problem.attempts = 1;
      reply = `Let's check your answer to **${p.display}**.\n\n${v.feedback}\n\nWant a hint? Tap **Hint**.`;
    }
  }
  return { reply, events: { newProblem: true } };
}

function startConcept(rec, c) {
  rec.kind = 'concept';
  rec.title = c.title;
  rec.concept = { id: c.id, step: -1, mode: 'teach', quizIndex: 0, correct: 0 };
  rec.problem = null;
  return `Let's learn **${c.title}** together. I'll explain one small piece at a time and check that it makes sense.\n\n${c.prime}`;
}

function startConceptQuiz(rec, c) {
  rec.kind = 'quiz';
  rec.title = `Quiz: ${c.title}`;
  rec.concept = { id: c.id, step: 99, mode: 'quiz', quizIndex: 0, correct: 0 };
  return `Quick quiz on **${c.title}** (${c.quiz.length} question${c.quiz.length > 1 ? 's' : ''}). Answer from memory, no notes!\n\n**Q1:** ${c.quiz[0].q}`;
}

function conceptReply(rec, text, { asHint = false } = {}) {
  const c = conceptById(rec.concept.id);
  if (!c) return 'Let\'s pick a topic. What are you studying?';
  const st = rec.concept;
  if (st.mode === 'quiz') {
    const item = c.quiz[st.quizIndex];
    const ok = matches(text, item.a);
    if (ok) st.correct++;
    let out = ok ? 'Correct! ✅' : `Not quite. The key word is **${item.a[0]}**.`;
    st.quizIndex++;
    if (st.quizIndex < c.quiz.length) out += `\n\n**Q${st.quizIndex + 1}:** ${c.quiz[st.quizIndex].q}`;
    else {
      st.mode = 'done';
      rec.solved = st.correct === c.quiz.length;
      out += `\n\nYou got **${st.correct} of ${c.quiz.length}**. ${st.correct === c.quiz.length ? 'Great memory! 🎉' : 'Review the ones you missed tomorrow: spacing it out helps it stick.'} Tap **Quiz me** for more.`;
    }
    return out;
  }
  // teaching mode
  if (st.step === -1) {
    st.step = 0;
    return `Thanks! Let's build on that.\n\n${c.steps[0].say}`;
  }
  const s = c.steps[st.step];
  let out;
  if (asHint) out = s.no || 'Here\'s the idea: read the question again and try in your own words.';
  else if (s.expect && s.expect.length) out = matches(text, s.expect) ? s.yes : `Good try. ${s.no}`;
  else out = 'Nice. Keep going like that.';
  st.step++;
  if (st.step < c.steps.length) out += `\n\n${c.steps[st.step].say}`;
  else {
    st.mode = 'done';
    rec.solved = true;
    out += `\n\nYou've got the big ideas of **${c.title}**. To make it stick, explain it out loud in your own words tonight, then tap **Quiz me** tomorrow.`;
  }
  return out;
}

/**
 * Reply to the student and update the conversation record.
 * ctx: { subject, nickname, rng }
 * Returns { reply, events: { hint, solved, newProblem, safety } }
 */
export function respond(rec, text, ctx = {}, analysis = classify(rec, text)) {
  const events = {};
  const t = String(text || '').trim();
  const name = ctx.nickname ? ` ${ctx.nickname}` : '';
  switch (analysis.intent) {
    case 'empty':
      return { reply: '', events };
    case 'safety':
      events.safety = true;
      return { reply: SAFETY_REPLY, events };
    case 'abuse':
      events.safety = true;
      return { reply: ABUSE_REPLY, events };
    case 'bully':
      events.safety = true;
      return { reply: BULLY_REPLY, events };
    case 'write-for-me': {
      const c = conceptById(/thesis/i.test(t) ? 'thesis' : 'essay');
      return {
        reply: `I can't write it for you. Your teacher wants your thinking, and writing it yourself is how you get better. But I'll coach you the whole way.\n\n${startConcept(rec, c).split('\n\n').slice(1).join('\n\n')}`,
        events,
      };
    }
    case 'cheat': {
      const prob = analysis.prob;
      if (prob) {
        const h = nextHint(rec, prob);
        if (h.gave) events.hint = true;
        return { reply: `I won't give you the answer. Working it out yourself is what makes it stick for the test. Here's a nudge instead:\n\n${h.text}`, events };
      }
      return { reply: 'I don\'t give answers, but I\'m really good at hints. Type the problem and we\'ll solve it together, one step at a time.', events };
    }
    case 'hint': {
      const prob = analysis.prob;
      if (prob) {
        const h = nextHint(rec, prob);
        if (h.gave) events.hint = true;
        return { reply: h.text, events };
      }
      if (rec.concept && rec.concept.mode === 'teach') return { reply: conceptReply(rec, '', { asHint: true }), events };
      return { reply: 'Type the problem you\'re stuck on, exactly as it\'s written (for example `2x + 5 = 17`), or name a topic (like photosynthesis). I\'ll give you a first hint.', events };
    }
    case 'answer': {
      const v = analysis.verdict;
      rec.problem.attempts = (rec.problem.attempts || 0) + 1;
      rec.attempts = (rec.attempts || 0) + 1;
      if (v.verdict === 'correct') {
        rec.problem.solved = true;
        rec.solved = true;
        events.solved = true;
        const used = rec.hintsUsed || 0;
        const note = used === 0 ? ' No hints needed. Impressive!' : used <= 2 ? ` You used ${used} hint${used > 1 ? 's' : ''}.` : '';
        return { reply: `${v.feedback}${note}\n\nTap **Quiz me** for a new one, or type another problem.`, events };
      }
      let extra = '';
      if (v.verdict === 'wrong' && rec.problem.attempts >= 3 && (rec.problem.hintIndex || 1) < 4) extra = '\n\nWant to go step by step? Tap **Hint**.';
      if (v.verdict === 'wrong' && rec.problem.attempts >= 5) extra = '\n\nThis one is tricky. Take a short break, then try again, or show your work to your teacher. Mistakes are how you learn it.';
      return { reply: v.feedback + extra, events };
    }
    case 'check-how':
      return { reply: 'Plug your answer back into the original problem. If both sides come out the same, it\'s right. Type your answer here and I\'ll check it too.', events };
    case 'new-problem': {
      const r = startProblem(rec, analysis.problem, t);
      return { reply: r.reply, events: { ...events, ...r.events } };
    }
    case 'new-concept':
      return { reply: startConcept(rec, analysis.concept), events };
    case 'concept-reply':
      return { reply: conceptReply(rec, t), events };
    case 'quiz': {
      const subject = ctx.subject || '';
      const concepts = conceptsFor(subject);
      const lastConcept = rec.concept ? conceptById(rec.concept.id) : null;
      if (lastConcept && !analysis.harder) return { reply: startConceptQuiz(rec, lastConcept), events };
      if (!MATHY.test(subject) && concepts.length) {
        const rng = ctx.rng || Math.random;
        const c = concepts[Math.floor(rng() * concepts.length)];
        return { reply: startConceptQuiz(rec, c), events };
      }
      const lvl = Math.max(1, Math.min(5, (rec.level || 1) + (analysis.harder ? 1 : 0) - (analysis.easier ? 1 : 0)));
      const problemText = generatePractice(lvl, ctx.rng || Math.random);
      const p = analyzeProblem(problemText);
      const r = startProblem(rec, p, problemText);
      rec.level = lvl;
      rec.kind = 'problem';
      return { reply: `Here's a practice problem (level ${lvl} of 5).\n\n${r.reply}`, events: { ...events, ...r.events, practice: true } };
    }
    case 'greet':
      return {
        reply: `Hi${name}! I'm your StudyPath tutor. I give hints, not answers, so you really learn it. Type a problem (like \`3x + 7 = 22\`), ask about a topic (like photosynthesis), or tap **Quiz me**.`,
        events,
      };
    case 'thanks':
      return { reply: 'Anytime! Tap **Quiz me** to practice, or type another problem.', events };
    case 'stress':
      return {
        reply: 'That sounds like a lot, and it\'s normal to feel stressed about school. Try this: breathe in for 4 seconds and out for 6, three times. Then pick ONE small task for the next 10 minutes. Want help breaking your work into steps? If the stress feels too big, a school counselor can really help.',
        events,
      };
    case 'mistake':
      return { reply: 'Mistakes are the best study material! Type one problem you got wrong, exactly as it was on the test, and we\'ll find where it went off track. Then try a similar one.', events };
    case 'explain-request': {
      const list = conceptsFor(ctx.subject).slice(0, 4).map((c) => c.title);
      return {
        reply: list.length
          ? `Sure! Which topic? In ${ctx.subject} I can teach: ${list.join(', ')}. Or type the topic name.`
          : 'Sure! Type the topic you want to understand, like "photosynthesis", "Newton\'s laws", "thesis statement" or "causes of World War I".',
        events,
      };
    }
    case 'problem-request':
      return { reply: 'Great. Type the problem exactly as it\'s written, for example `5x − 3 = 2x + 9` or `x^2 + 5x + 6 = 0`. I\'ll guide you with hints.', events };
    default: {
      if (analysis.prob) return { reply: `Show me your next step, or type your answer (${answerFormat(analysis.prob)}). Need a nudge? Tap **Hint**.`, events };
      const list = conceptsFor(ctx.subject).slice(0, 3).map((c) => c.title);
      return {
        reply:
          'I work best with a specific problem or topic. Type the exact problem (like `2x + 5 = 17` or `15% of 80`), or a topic like "photosynthesis".' +
          (list.length ? ` For ${ctx.subject}, try: ${list.join(', ')}.` : ''),
        events,
      };
    }
  }
}

export { revealsAnswer, rand };
