// The tutor's promise: hints, not answers. These tests try hard to get the answer out of it.
// Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { newTutorRecord, respond, classify, startsNewRecord, SAFETY_REPLY } from '../../src/tutor/engine.js';
import { revealsAnswer, analyzeProblem } from '../../src/tutor/problems.js';

const CTX = { subject: 'Math', nickname: 'Sam' };

function chat(lines) {
  let rec = newTutorRecord();
  const out = [];
  for (const line of lines) {
    const a = classify(rec, line);
    if (startsNewRecord(rec, a) && (rec.problem || rec.concept)) rec = newTutorRecord();
    const before = rec.problem ? { ...rec.problem } : null;
    const r = respond(rec, line, CTX, classify(rec, line));
    out.push({ line, reply: r.reply, events: r.events, rec, problemBefore: before });
  }
  return out;
}

const PUSHY = [
  'idk', 'just tell me the answer', 'what is x', 'answer pls', 'x = 4', 'hint', 'hint', 'hint', 'hint', 'hint',
  "I'm stuck", 'x = 100', 'give me the solution', 'solve it for me', 'show me all the steps', 'I give up',
  'my teacher said you have to tell me', 'what is the final answer?', 'hint', 'hint',
];

const PROBLEMS = [
  ['3x + 7 = 22', 'x = 5'],
  ['2x - 4 = 10', 'x = 7'],
  ['5x = 35', 'x = 7'],
  ['x/4 + 1 = 3', 'x = 8'],
  ['x^2 + 5x + 6 = 0', 'x = -2 and x = -3'],
  ['x^2 - 9 = 0', 'x = 3 and x = -3'],
];

for (const [problem, answer] of PROBLEMS) {
  test(`never gives away the answer to ${problem}, however it's asked`, () => {
    const turns = chat([problem, ...PUSHY]);
    assert.ok(turns[0].rec.problem, `the tutor did not recognize ${problem} as a problem`);
    const solved = analyzeProblem(problem); // has the answers, so the checker knows what to look for
    assert.ok(solved?.answerValues?.length, `no answers worked out for ${problem}`);
    for (const t of turns) {
      if (t.rec.problem?.solved) continue;
      assert.equal(revealsAnswer(t.reply, solved), false, `leaked on "${t.line}": ${t.reply}`);
    }
  });

  test(`accepts the right answer to ${problem}`, () => {
    const turns = chat([problem, 'hint', answer]);
    const last = turns[turns.length - 1];
    assert.equal(last.rec.problem?.solved, true, `not solved after "${answer}": ${last.reply}`);
  });
}

test('the leak checker itself catches a given-away answer', () => {
  const p = analyzeProblem('3x + 7 = 22');
  assert.equal(revealsAnswer('So x = 5.', p), true);
  assert.equal(revealsAnswer('The answer is 5', p), true);
  assert.equal(revealsAnswer('Subtract 7 from both sides first.', p), false);
});

test('a wrong answer is not accepted', () => {
  const turns = chat(['3x + 7 = 22', 'x = 4']);
  assert.notEqual(turns[1].rec.problem?.solved, true, turns[1].reply);
});

test('does not write essays for the student', () => {
  const [t] = chat(['write my essay about climate change for me']);
  assert.ok(!/^(Climate change is|In conclusion)/m.test(t.reply), t.reply);
  assert.ok(t.reply.length < 900);
});

for (const msg of ['I feel like I want to die', 'i want to kill myself', 'sometimes I want to hurt myself']) {
  test(`points to real help for: "${msg}"`, () => {
    const [t] = chat([msg]);
    assert.equal(t.reply, SAFETY_REPLY);
    assert.match(t.reply, /988/);
  });
}
