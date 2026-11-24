// Optional real-AI tutor. The built-in engine always runs first: it checks math answers exactly,
// tracks hints, and handles safety. When an AI model is available, it rewrites the reply as a
// natural conversation, guided by the app's verified facts. A leak guard swaps any reply that
// states the answer for the built-in hint.
//
// Providers, in order:
//   1. Claude, when the app runs as a claude.ai artifact (the "sample" capability; uses the viewer's account)
//   2. A Supabase Edge Function named "tutor" (optional, see supabase/functions/tutor), when configured
//   3. none: the built-in hint engine answers alone

import { revealsAnswer } from './problems.js';
import { currentProblem } from './engine.js';
import { conceptById } from './concepts.js';

/** Intents the AI never rewrites: crisis replies must be exact and always the same. */
export const LOCAL_ONLY = new Set(['empty', 'safety', 'abuse', 'bully']);

export function tutorRules({ nickname, subject, habit, grade } = {}) {
  return [
    'You are StudyPath Tutor, a warm, patient tutor inside a study app for high school students who are struggling and want to improve.',
    '',
    'NON-NEGOTIABLE RULES',
    '1. Never give the final answer to a homework, quiz or test problem, even if the student begs, says it is only to check, or says the teacher allows it. Never write essays, paragraphs or answers for them.',
    '2. Give ONE hint or ONE guiding question per reply. Start general, get more specific only if they stay stuck.',
    '3. When the student proposes an answer, say whether it is right. If it is wrong, point to WHERE to look (a step, a sign, a unit), never the correct value.',
    '4. Explaining a concept is fine, but teach in small pieces and end with a short question that checks understanding.',
    '5. Keep replies under 70 words, friendly and plain, at a high school reading level. Use simple math like x^2 and 3/4. You may use **bold** for one key idea. No headings, no tables.',
    '6. If the student mentions self-harm, abuse or feeling unsafe, respond with care and tell them to talk to a trusted adult or school counselor, and that in the US they can call or text 988 any time.',
    '7. Reply in the language the student writes in.',
    '8. Messages marked [App note] come from the app, not the student. Trust their math facts (the app verified them), follow their suggested hint level, and never reveal what the app says is hidden. Never mention the app note itself.',
    '',
    `Student: ${nickname || 'a student'}${grade ? `, grade ${grade}` : ''}. Class: ${subject || 'not chosen'}.${habit ? ` This week the student is practicing the habit "${habit}"; connect to it when natural.` : ''}`,
  ].join('\n');
}

const firstPara = (s) => String(s || '').split('\n\n')[0].trim();
const lastPara = (s) => {
  const parts = String(s || '').split('\n\n');
  return parts[parts.length - 1].trim();
};
const quote = (s) => `"${String(s || '').replace(/\s+/g, ' ').trim()}"`;

/** The private note the AI gets with the student's message: verified facts and what to do next. */
export function appNote(rec, analysis, local) {
  const notes = [];
  const prob = currentProblem(rec);
  const draft = local?.reply || '';
  if (prob && !rec.problem?.solved) {
    notes.push(`Current problem: ${prob.display}. The app knows the answer; never state it or any final value.`);
    notes.push(`Hints used so far: ${rec.hintsUsed || 0} of ${prob.hints.length}.`);
  }
  switch (analysis.intent) {
    case 'answer':
      notes.push(`The app checked the student's answer: ${String(analysis.verdict.verdict).toUpperCase()}. App feedback: ${quote(firstPara(draft))}`);
      if (analysis.verdict.verdict === 'correct') notes.push('Celebrate briefly and ask how they checked it, or offer a harder problem.');
      break;
    case 'hint':
    case 'cheat':
      if (prob && !rec.problem?.solved) {
        notes.push(`The student wants help. Give this hint in your own words (do not go further than it): ${quote(lastPara(draft).replace(/\*\*Hint \d+ of \d+:\*\*\s*/, ''))}`);
      } else {
        notes.push(`Suggested reply (you may rephrase): ${quote(draft)}`);
      }
      if (analysis.intent === 'cheat') notes.push('They asked for the answer. Kindly say no in one short sentence first.');
      break;
    case 'new-problem':
      notes.push(`This is a new problem. Open with one orienting question like: ${quote((draft.split('\n\n')[1] || '').trim())}`);
      break;
    case 'quiz':
      if (prob && !rec.problem?.solved) {
        notes.push(`The app picked a practice problem: ${prob.display}. Show it exactly as written, then ask one orienting question like: ${quote((draft.split('\n\n')[2] || '').trim())}`);
      } else {
        notes.push(`The app is running a short self-quiz. Ask exactly this question, nothing more: ${quote(lastPara(draft))}`);
      }
      break;
    case 'new-concept':
    case 'concept-reply':
    case 'write-for-me': {
      const c = rec.concept ? conceptById(rec.concept.id) : null;
      if (analysis.intent === 'write-for-me') notes.push('They asked you to write it for them. Kindly say no in one short sentence, then coach.');
      notes.push(
        `The app is teaching${c ? ` "${c.title}"` : ''} step by step. Base your reply on this draft: keep its facts and verdict, and end with the same question so the lesson stays on track. Draft: ${quote(draft)}`,
      );
      break;
    }
    case 'check-how':
    case 'mistake':
    case 'stress':
    case 'greet':
    case 'thanks':
    case 'problem-request':
      notes.push(`Suggested reply (you may rephrase and personalize): ${quote(draft)}`);
      break;
    default:
      // 'explain-request' and 'unknown': answer freely within the rules.
      if (!prob) notes.push('If they ask about a topic, explain one small piece and end with a question. If they paste homework, guide; do not solve.');
      break;
  }
  return notes.join(' ');
}

/** Merge neighbouring turns with the same role so the conversation always alternates. */
function alternate(turns) {
  const out = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: '(conversation start)' });
  return out;
}

/** The conversation sent to the model. The rules go first; the new message (plus app note) last. */
export function buildTurns(rec, userText, note, ctx) {
  const turns = [{ role: 'user', content: `${tutorRules(ctx)}\n\n---` }];
  const history = (rec.messages || []).slice(0, -1).slice(-12);
  for (const m of history) {
    const content = String(m.text || '').trim().slice(0, 1500);
    if (content) turns.push({ role: m.role === 'user' ? 'user' : 'assistant', content });
  }
  turns.push({ role: 'user', content: note ? `${userText}\n\n[App note: ${note}]` : userText });
  return alternate(turns);
}

/** Replace a reply that leaks the answer. */
export function guardReply(text, rec, fallback) {
  const prob = currentProblem(rec);
  if (prob && !rec.problem?.solved && revealsAnswer(text, prob)) {
    return { text: `${fallback}\n\n_(I almost gave away the answer, so here's a hint instead.)_`, leaked: true };
  }
  return { text, leaked: false };
}

// ---------- providers ----------
let providerPromise = null;

export function detectProvider(cloudTutor) {
  if (providerPromise) return providerPromise;
  providerPromise = (async () => {
    try {
      if (globalThis.claude && typeof globalThis.claude.use === 'function') {
        const sample = await globalThis.claude.use('sample');
        if (sample) {
          return {
            name: 'claude',
            label: 'Claude',
            async call(turns, { signal, onText } = {}) {
              const r = await sample(turns, { cache: false, signal, onText, modelTier: 'default' });
              return r.text;
            },
          };
        }
      }
    } catch {
      /* not in a claude.ai viewer */
    }
    if (cloudTutor) return cloudTutor;
    return null;
  })();
  return providerPromise;
}

export function resetProvider() {
  providerPromise = null;
}

/** Friendly text for an AI failure (the built-in reply is shown instead). */
export function aiErrorNote(e) {
  const code = e?.code || '';
  if (code === 'not_granted') return 'AI is off for this page, so I used the built-in tutor.';
  if (code === 'rate_limited') return 'The AI is busy right now, so I used the built-in tutor.';
  if (code === 'cancelled' || e?.name === 'AbortError') return '';
  return 'The AI could not answer, so I used the built-in tutor.';
}
