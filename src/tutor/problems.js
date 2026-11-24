// Recognizes a math problem in what the student typed and builds a hint ladder for it.
// Rules for every ladder: hint 1 orients, hints 2-4 get more specific, and NO hint ever states
// the final answer. check() tells the student whether their own answer is right and, if not,
// where to look — again without revealing the correct value.

import {
  parse,
  toPoly,
  toLinear,
  variables,
  hasGroup,
  extractMath,
  parseAnswerNumbers,
  close,
  isPerfectSquare,
  factorPairs,
  Frac,
  evaluate,
  normalize,
} from './math.js';

const fmt = (v) => {
  if (v instanceof Frac) return v.pretty();
  if (Number.isInteger(v)) return v < 0 ? '−' + Math.abs(v) : String(v);
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? '−' + Math.abs(r) : String(r);
};
const term = (coef, v) => {
  // "3x", "x", "−x", "−2x"
  const c = Frac.of(coef);
  if (c.eq(1)) return v;
  if (c.eq(-1)) return '−' + v;
  const p = c.pretty();
  return (p.includes('/') ? `(${p})` : p) + v;
};
const signed = (f) => (Frac.of(f).sign() < 0 ? ' − ' + Frac.of(f).abs().pretty() : ' + ' + Frac.of(f).pretty());
const lin = (a, b, v) => {
  // "3x + 7"
  const A = Frac.of(a);
  const B = Frac.of(b);
  if (A.isZero()) return B.pretty();
  return term(A, v) + (B.isZero() ? '' : signed(B));
};
const pretty = (s) => normalize(s).replace(/\*/g, '·').replace(/-/g, '−').replace(/\^2/g, '²').replace(/\^3/g, '³');

const SOLVED_PRAISE = [
  'Yes! That\'s right, and you did it yourself. 🎉',
  'Correct! Nice work figuring it out. 🎉',
  'That\'s it! You solved it on your own. 🙌',
];
const praise = () => SOLVED_PRAISE[Math.floor(Math.random() * SOLVED_PRAISE.length)];

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function analyzeProblem(text) {
  const lower = String(text).toLowerCase();
  return (
    percentProblem(lower) ||
    slopeProblem(lower) ||
    pythagoreanProblem(lower) ||
    systemProblem(text) ||
    algebraProblem(text, lower)
  );
}

/** True when `text` states one of the problem's answers (used to guard AI replies and in tests). */
export function revealsAnswer(text, problem) {
  if (!problem || !problem.answerValues?.length) return false;
  const t = normalize(String(text)).replace(/\s+/g, ' ').toLowerCase();
  const v = problem.variable || 'x';
  for (const val of problem.answerValues) {
    const forms = new Set();
    const num = Number(val);
    if (Number.isInteger(num)) forms.add(String(num));
    else {
      forms.add(String(Math.round(num * 100) / 100));
      forms.add(String(Math.round(num * 1000) / 1000));
      if (val instanceof Frac) forms.add(`${val.n}/${val.d}`);
    }
    for (const f of forms) {
      const esc = f.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
      // the number must end there: "x = 5." and "x = 5," count, "x = 5.5" and "x = 5/2" do not
      const end = '(?!\\d|[./]\\d)';
      const patterns = [
        new RegExp(`\\b${v}\\s*=\\s*${esc}${end}`),
        new RegExp(`(answer|solution|result)s?\\s*(is|are|=|:)\\s*${esc}${end}`),
        new RegExp(`${v}\\s*(is|equals)\\s*${esc}${end}`),
      ];
      if (problem.kind === 'system') patterns.push(new RegExp(`\\(\\s*${esc}\\s*,`));
      if (patterns.some((re) => re.test(t))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Answer checking helpers
// ---------------------------------------------------------------------------

function checkSet(text, solutions, ctx) {
  const lower = String(text).toLowerCase();
  if (!solutions.length) {
    if (/no (real )?solution|no answer|none|∅/.test(lower))
      return { verdict: 'correct', feedback: `${praise()} There's no ${ctx.noneWhy || 'solution'}.` };
    return { verdict: 'wrong', feedback: ctx.noneHint || 'Look again: what happens when you try to solve it? Can anything make it true?' };
  }
  const nums = parseAnswerNumbers(text, ctx.variable || 'x');
  if (!nums.length) return { verdict: 'unclear' };
  const found = new Set();
  const wrong = [];
  for (const n of nums) {
    const i = solutions.findIndex((s) => close(n.value, Number(s), n.decimals));
    if (i >= 0) found.add(i);
    else wrong.push(n.value);
  }
  if (found.size === solutions.length && !wrong.length) return { verdict: 'correct', feedback: praise() + (ctx.afterCorrect ? ' ' + ctx.afterCorrect : '') };
  if (found.size > 0 && wrong.length)
    return { verdict: 'partial', feedback: `One of your answers works, but ${fmt(wrong[0])} doesn't. Plug it into the original problem to see why.` };
  if (found.size > 0)
    return {
      verdict: 'partial',
      feedback: `You found ${found.size === 1 ? 'one solution' : 'some solutions'}! ${ctx.missingHint || 'There\'s another one. Look again.'}`,
    };
  return { verdict: 'wrong', feedback: ctx.diagnose ? ctx.diagnose(wrong[0]) : 'Not quite. Check each step again.' };
}

// ---------------------------------------------------------------------------
// Algebra: one equation or expression
// ---------------------------------------------------------------------------

const FILLER = /\b(what('s| is)|how (do i|to|much is)|solve|calculate|compute|evaluate|simplify|factor|expand|find|work out|help( me)?( with)?|please|can you|the|answer|for)\b/gi;

function algebraProblem(text, lower) {
  const forVar = lower.match(/solve\s+for\s+([a-z])\b/);
  const math = extractMath(String(text).replace(/solve\s+for\s+[a-z]\b\s*:?/i, ' '));
  if (!math) return null;
  let ast;
  try {
    ast = parse(math);
  } catch {
    return null;
  }
  const vars = [...variables(ast)];
  if (ast.type === 'eq') {
    if (vars.length === 1) return oneVarEquation(ast, vars[0], math);
    if (vars.length === 2) {
      if (forVar && vars.includes(forVar[1])) return literalEquation(ast, forVar[1], vars.find((x) => x !== forVar[1]), math);
    }
    return null;
  }
  if (vars.length === 0) {
    // Only treat plain numbers as a problem when the message is mostly math ("3 + 4 * 2"),
    // so "my test is on 11/26" or "questions 1-5" are not mistaken for arithmetic.
    const rest = String(text).replace(FILLER, ' ').replace(/[?!.:,]/g, ' ').replace(/\s+/g, '');
    if (math.replace(/\s+/g, '').length < 0.7 * rest.length) return null;
    return arithmeticProblem(ast, math);
  }
  if (vars.length === 1) {
    if (/\bfactor/.test(lower)) return factorProblem(ast, vars[0], math);
    return simplifyProblem(ast, vars[0], math);
  }
  return null;
}

function oneVarEquation(ast, v, math) {
  let L;
  let R;
  try {
    L = toPoly(ast.a, v);
    R = toPoly(ast.b, v);
  } catch {
    return null;
  }
  const P = L.sub(R);
  const deg = P.degree();
  const bare = (side) => side.type === 'var' || (side.type === 'neg' && side.a.type === 'var');
  if (deg === 1 && ((bare(ast.a) && R.degree() === 0) || (bare(ast.b) && L.degree() === 0))) return null;
  if (deg === 1) return linearEquation(ast, v, L, R, P, math);
  if (deg === 2) return quadraticEquation(ast, v, L, R, P, math);
  if (deg === 0) return degenerateEquation(v, P, math);
  if (deg >= 3) return higherEquation(v, P, math);
  return null;
}

function linearEquation(ast, v, L, R, P, math) {
  const A = P.coef(1);
  const B = P.coef(0);
  const sol = B.neg().div(A);
  const aL = L.coef(1);
  const bL = L.coef(0);
  const aR = R.coef(1);
  const bR = R.coef(0);
  const display = pretty(math);
  const hints = [];
  const groups = hasGroup(ast);
  // Put the x side on the left in our explanations.
  const xLeft = !aL.isZero();
  const [ax, bx, bo] = xLeft ? [aL, bL, bR] : [aR, bR, bL];

  if (!aL.isZero() && !aR.isZero()) {
    const keep = aL.abs().valueOf() >= aR.abs().valueOf() ? 'right' : 'left';
    const moveCoef = keep === 'right' ? aR : aL;
    const newA = aL.sub(aR);
    hints.push(
      `There's ${v} on both sides. Your first goal is to get all the ${v} terms on one side. Which ${v} term could you move?`,
      `Try ${moveCoef.sign() > 0 ? 'subtracting' : 'adding'} ${term(moveCoef.abs(), v)} ${moveCoef.sign() > 0 ? 'from' : 'to'} both sides. Whatever you do to one side, do to the other.`,
    );
    if (keep === 'right') {
      hints.push(
        newA.abs().eq(1)
          ? `Now you have ${v} on just one side. Next, move the plain number away from the ${v} term the same way.`
          : `After that you get ${lin(newA, bL, v)} = ${bR.pretty()}. Next, move the plain number away from the ${v} term.`,
      );
      hints.push(`Last step: divide both sides by the number in front of ${v}. Then plug your answer into the ORIGINAL equation to check that both sides match.`);
    } else {
      const nA = aR.sub(aL);
      hints.push(
        nA.abs().eq(1)
          ? `Now ${v} is only on the right side. Move the plain number away from the ${v} term the same way.`
          : `After that you get ${bL.pretty()} = ${lin(nA, bR, v)}. Next, move the plain number away from the ${v} term.`,
      );
      hints.push(`Last step: divide both sides by the number in front of ${v}. Then check your answer in the ORIGINAL equation.`);
    }
  } else {
    if (groups) {
      hints.push(
        `There are parentheses. You can distribute first (multiply the outside number by each term inside), or undo the outside multiplication by dividing both sides. Which do you want to try?`,
        `If you distribute, the ${v} side becomes ${lin(ax, bx, v)}. What can you do to both sides to move the plain number?`,
      );
    } else {
      hints.push(
        `Your goal is to get ${v} by itself. What is happening to ${v} right now? Look for what it's multiplied by and what is added or subtracted.`,
        bx.isZero()
          ? `${v} is multiplied by ${ax.pretty()}. What's the opposite of multiplying?`
          : `Undo the operations in reverse order. Start with the ${bx.sign() > 0 ? '+ ' + bx.pretty() : '− ' + bx.abs().pretty()}: what can you do to both sides to cancel it?`,
      );
    }
    if (ax.abs().eq(1) || bx.isZero()) {
      hints.push(
        ax.abs().eq(1)
          ? `Do the same operation to both sides so only ${ax.sign() < 0 ? '−' : ''}${v} is left on its side.${ax.sign() < 0 ? ` Then remember −${v} means −1 × ${v}.` : ''}`
          : `Divide both sides by ${ax.pretty()}. Fractions are OK as answers.`,
      );
    } else {
      hints.push(
        `${bx.sign() > 0 ? 'Subtracting ' + bx.pretty() + ' from' : 'Adding ' + bx.abs().pretty() + ' to'} both sides gives ${term(ax, v)} = ${bo.sub(bx).pretty()}. What's the next step?`,
      );
    }
    hints.push(`Get ${v} completely alone, then check: plug your answer into the original equation. Both sides should give the same number.`);
  }

  const diagnose = (val) => {
    const left = safeEval(ast.a, { [v]: val });
    const right = safeEval(ast.b, { [v]: val });
    if (close(val, -Number(sol))) return `Close, but check your signs. When you move a term to the other side, its sign flips. With ${v} = ${fmt(val)} the left side is ${fmt(left)} and the right side is ${fmt(right)}.`;
    if (!ax.isZero() && close(val, Number(bo.sub(bx)))) return `It looks like you forgot the last step: dividing by the number in front of ${v}.`;
    return `Not quite. Plug ${v} = ${fmt(val)} into the equation: the left side is ${fmt(left)} and the right side is ${fmt(right)}. They should be equal. Which step could have gone wrong?`;
  };
  return {
    kind: 'linear',
    variable: v,
    display,
    intro: `Let's solve **${display}** together. I'll give hints, not answers.`,
    hints,
    answerValues: [sol],
    check: (t) => checkSet(t, [sol], { variable: v, diagnose, afterCorrect: 'How did you check it? Want a harder one?' }),
  };
}

function quadraticEquation(ast, v, L, R, P, math) {
  let a = P.coef(2);
  let b = P.coef(1);
  let c = P.coef(0);
  if (a.sign() < 0) {
    a = a.neg();
    b = b.neg();
    c = c.neg();
  }
  // Clear fractions for nicer integer hints.
  const lcm = [a, b, c].reduce((m, f) => (m * f.d) / gcdInt(m, f.d), 1);
  const ai = a.mul(lcm).valueOf();
  const bi = b.mul(lcm).valueOf();
  const ci = c.mul(lcm).valueOf();
  const D = bi * bi - 4 * ai * ci;
  const display = pretty(math);
  const standard = !R.isZero() || L.coef(2).sign() < 0 ? `${polyStd(ai, bi, ci, v)} = 0` : null;
  const sols = [];
  if (D > 0) {
    const r = Math.sqrt(D);
    sols.push((-bi + r) / (2 * ai), (-bi - r) / (2 * ai));
  } else if (D === 0) sols.push(-bi / (2 * ai));
  const exact = isPerfectSquare(D) ? sols.map((s) => Frac.of(Math.round(s * 1e6) / 1e6)) : sols;
  const hints = [];
  hints.push(
    standard
      ? `First move everything to one side so it equals 0. You should get the form a${v}² + b${v} + c = 0. What are a, b and c?`
      : `This is a quadratic: a${v}² + b${v} + c = 0. What are a, b and c here?`,
  );
  if (ci === 0) {
    hints.push(`Every term has an ${v}. Factor out ${v} first: ${v}(…) = 0.`);
    hints.push(`Now use the zero product rule: if two things multiply to 0, one of them must be 0. So ${v} = 0 is one answer. What makes the other factor 0?`);
    hints.push('Solve that small equation for the second answer. A quadratic like this has two answers.');
  } else if (bi === 0 && ci < 0 && D > 0) {
    hints.push(`There's no middle term. Move the number to the other side, so ${ai === 1 ? '' : ai}${v}² equals a positive number.`);
    hints.push(`Now take the square root of both sides. Don't forget there are two square roots: a positive one and a negative one (±).`);
    hints.push(`Check both answers by plugging them in. Squaring a negative number gives a positive number too.`);
  } else if (bi === 0 && ci > 0) {
    hints.push(`There's no middle term. What do you get if you move the number to the other side? Can a square be negative?`);
    hints.push(`If ${v}² has to equal a negative number, think about whether any real number works.`);
    hints.push('Write your conclusion: is there a real solution or not?');
  } else if (isPerfectSquare(D)) {
    if (ai === 1) {
      const pairs = factorPairs(ci)
        .map(([p, q]) => `${p} × ${q}`)
        .join(', ');
      hints.push(`Look for two numbers that multiply to ${fmt(ci)} (that's c) and add to ${fmt(bi)} (that's b).`);
      hints.push(`Factor pairs of ${Math.abs(ci)}: ${pairs}. Think about signs too: ${ci < 0 ? 'one number is negative and one is positive' : bi < 0 ? 'both numbers are negative' : 'both numbers are positive'}. Which pair adds to ${fmt(bi)}?`);
      hints.push(`Write it as (${v} + p)(${v} + q) = 0 with your two numbers. Then set each factor equal to 0 and solve both. A quadratic usually has two answers.`);
    } else {
      hints.push(`Try the AC method: multiply a × c = ${fmt(ai * ci)}. Find two numbers that multiply to ${fmt(ai * ci)} and add to ${fmt(bi)}.`);
      hints.push(`Use those two numbers to split the middle term ${term(bi, v)} into two terms. Then factor by grouping.`);
      hints.push(`When you have two factors, set each one equal to 0 and solve. Check both answers in the original equation.`);
    }
  } else {
    hints.push(`This one doesn't factor nicely. Use the quadratic formula: ${v} = (−b ± √(b² − 4ac)) / 2a.`);
    hints.push(
      D < 0
        ? 'Start with the part under the square root: b² − 4ac. What sign does it have? What does that tell you?'
        : `Start with the part under the square root: b² − 4ac, with a = ${fmt(ai)}, b = ${fmt(bi)}, c = ${fmt(ci)}. What do you get?`,
    );
    hints.push(
      D < 0
        ? 'When b² − 4ac is negative, there are no real solutions (you can\'t take the square root of a negative number with real numbers).'
        : 'Now put that into the formula and simplify. You get two answers: one with + and one with −. Decimals rounded to 2 places are fine.',
    );
  }
  const diagnose = (val) => {
    const left = safeEval(ast.a, { [v]: val });
    const right = safeEval(ast.b, { [v]: val });
    if (sols.some((s) => close(val, -s))) return `Check your signs. If a factor is (${v} + 3), the answer from it is ${v} = −3, not 3. With ${v} = ${fmt(val)} the two sides are ${fmt(left)} and ${fmt(right)}.`;
    return `Not quite. With ${v} = ${fmt(val)}, the left side is ${fmt(left)} and the right side is ${fmt(right)}. They should be equal. Want the next hint?`;
  };
  return {
    kind: 'quadratic',
    variable: v,
    display,
    intro: `Let's solve **${display}** step by step. I'll give hints, not answers.`,
    hints,
    answerValues: exact,
    check: (t) => {
      const progress = factoredProgress(t, P, v);
      if (progress) return progress;
      return checkSet(t, sols, {
        variable: v,
        diagnose,
        noneWhy: 'real solution, because a square can\'t be negative',
        missingHint: 'A quadratic usually has two answers. What about the other factor (or the other sign)?',
        afterCorrect: 'Ready for a harder one?',
      });
    },
  };
}

/** The student wrote a factored form like (x+2)(x+3): tell them if the factoring is right. */
function factoredProgress(t, P, v) {
  const m = extractMath(t);
  if (!m || !/\(/.test(m)) return null;
  try {
    const ast = parse(m.replace(/=\s*0\s*$/, ''));
    if (ast.type === 'eq' || !hasGroup(ast)) return null;
    const Q = toPoly(ast, v);
    if (Q.degree() !== 2) return null;
    const ratio = Q.coef(2).div(P.coef(2));
    if (Q.eq(P.scale(ratio))) {
      return { verdict: 'progress', feedback: `That factoring is right! Now use the zero product rule: set each factor equal to 0. What values of ${v} make each one 0?` };
    }
    return { verdict: 'progress-wrong', feedback: `Multiply your factors back out. Do you get the original? Check the numbers and their signs.` };
  } catch {
    return null;
  }
}

function degenerateEquation(v, P, math) {
  const all = P.isZero();
  const display = pretty(math);
  return {
    kind: 'special',
    variable: v,
    display,
    intro: `Let's look at **${display}** together.`,
    hints: [
      `Simplify both sides first. What happens to the ${v} terms?`,
      `If the ${v} terms cancel out, look at what's left. Is it always true (like 3 = 3) or never true (like 3 = 5)?`,
      'Always true means every number works. Never true means no number works.',
      'Write your conclusion in words: "all real numbers" or "no solution".',
    ],
    answerValues: [],
    check: (t) => {
      const lower = String(t).toLowerCase();
      if (all && /all|every|infinite|any number/.test(lower)) return { verdict: 'correct', feedback: `${praise()} Every number works, because both sides are the same.` };
      if (!all && /no solution|none|no answer|never/.test(lower)) return { verdict: 'correct', feedback: `${praise()} No number can make it true.` };
      return { verdict: 'wrong', feedback: `Not quite. Simplify both sides and see what's left when the ${v} terms cancel.` };
    },
  };
}

function higherEquation(v, P, math) {
  const display = pretty(math);
  const roots = [];
  for (let i = -30; i <= 30; i++) if (Math.abs(P.at(i)) < 1e-9) roots.push(i);
  const hasZero = P.coef(0).isZero();
  return {
    kind: 'polynomial',
    variable: v,
    display,
    intro: `Let's work on **${display}**. I'll give hints, not answers.`,
    hints: [
      'Move everything to one side so it equals 0. Then look for a common factor in every term.',
      hasZero ? `Every term has an ${v}. Factor it out first. That gives you one answer right away.` : 'Try small whole numbers (±1, ±2, ±3...) to find one value that makes it 0. That gives you a factor.',
      'Keep factoring what is left until every factor is linear or a quadratic you can solve.',
      'Set each factor equal to 0 and solve. Check each answer by plugging it in.',
    ],
    answerValues: roots,
    check: (t) => {
      const nums = parseAnswerNumbers(t, v);
      if (!nums.length) return { verdict: 'unclear' };
      const bad = nums.filter((n) => Math.abs(P.at(n.value)) > 1e-6 * Math.max(1, Math.abs(n.value) ** P.degree()) && !(n.decimals && Math.abs(P.at(n.value)) < 0.05));
      if (bad.length) return { verdict: 'wrong', feedback: `${v} = ${fmt(bad[0].value)} doesn't work: it doesn't make the equation true. Check that step.` };
      if (roots.length && nums.length < roots.length) return { verdict: 'partial', feedback: `Those work! But there are more answers. Keep factoring.` };
      return { verdict: 'correct', feedback: praise() };
    },
  };
}

function literalEquation(ast, v, other, math) {
  let F;
  try {
    F = toLinear({ type: 'sub', a: ast.a, b: ast.b });
  } catch {
    return null;
  }
  const cv = F.coefs.get(v);
  if (!cv || cv.isZero()) return null;
  const display = pretty(math);
  const solveFor = (o) => {
    // F: cv*v + co*o + k = 0  ->  v = -(co*o + k)/cv
    const co = F.coefs.get(other) || new Frac(0);
    return -(co.valueOf() * o + F.k.valueOf()) / cv.valueOf();
  };
  return {
    kind: 'literal',
    variable: v,
    display,
    intro: `Let's solve **${display}** for ${v}. I'll give hints, not answers.`,
    hints: [
      `"Solve for ${v}" means get ${v} alone on one side. Treat ${other} like it's just a number.`,
      `Move every term without ${v} to the other side.`,
      `Then divide both sides by the number in front of ${v}.`,
      `Check: pick a number for ${other}, find ${v} with your formula, and plug both into the original equation.`,
    ],
    answerValues: [],
    check: (t) => {
      const m = normalize(t).match(new RegExp(`${v}\\s*=\\s*(.+)$`, 'i'));
      if (!m) return { verdict: 'unclear' };
      try {
        const expr = parse(m[1]);
        for (const o of [1, 2.5, -3]) {
          if (!close(evaluate(expr, { [other]: o }), solveFor(o))) return { verdict: 'wrong', feedback: `Not quite. Pick ${other} = 1, put it in your formula and in the original equation. Do they agree?` };
        }
        return { verdict: 'correct', feedback: praise() };
      } catch {
        return { verdict: 'unclear' };
      }
    },
  };
}

function arithmeticProblem(ast, math) {
  let value;
  try {
    value = evaluate(ast);
  } catch {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  const display = pretty(math);
  const isFracSum =
    (ast.type === 'add' || ast.type === 'sub') && ast.a.type === 'div' && ast.b.type === 'div' && ast.a.b.type === 'num' && ast.b.b.type === 'num';
  const hasPow = /\^/.test(math);
  const hasMulDiv = /[*/]|\d\s*\(|\)\s*\(/.test(math);
  const hints = [];
  if (isFracSum) {
    const d1 = ast.a.b.v.valueOf();
    const d2 = ast.b.b.v.valueOf();
    hints.push(`To ${ast.type === 'add' ? 'add' : 'subtract'} fractions, the bottoms (denominators) must match. Are ${d1} and ${d2} the same?`);
    hints.push(`Find a common denominator: a number both ${d1} and ${d2} divide into. The smallest one is the least common multiple.`);
    hints.push('Rewrite each fraction with that denominator (multiply top and bottom by the same number), then combine the tops.');
    hints.push('Simplify your answer if the top and bottom share a factor.');
  } else {
    hints.push('Use the order of operations: Parentheses, Exponents, Multiplication and Division (left to right), then Addition and Subtraction (left to right). What comes first here?');
    hints.push(
      hasGroup(ast)
        ? 'Start inside the parentheses.'
        : hasPow
          ? 'Start with the exponent.'
          : hasMulDiv
            ? 'Do the multiplication and division first, before any adding or subtracting.'
            : 'It\'s only adding and subtracting, so go left to right.',
    );
    hints.push('Do one step at a time and rewrite the whole expression after each step. It stops mistakes.');
    hints.push('Check by estimating: round the numbers and see if your answer is close.');
  }
  return {
    kind: 'arithmetic',
    variable: null,
    display,
    intro: `Let's work out **${display}** together. I'll give hints, not answers.`,
    hints,
    answerValues: [value],
    check: (t) => {
      const nums = parseAnswerNumbers(t);
      if (!nums.length) return { verdict: 'unclear' };
      const n = nums[nums.length - 1];
      if (close(n.value, value, n.decimals)) return { verdict: 'correct', feedback: praise() };
      return { verdict: 'wrong', feedback: 'Not quite. Go one step at a time in order of operations and rewrite the expression after each step. Which step do you want to check?' };
    },
  };
}

function simplifyProblem(ast, v, math) {
  let P;
  try {
    P = toPoly(ast, v);
  } catch {
    return null;
  }
  const display = pretty(math);
  const groups = hasGroup(ast);
  return {
    kind: 'simplify',
    variable: v,
    display,
    intro: `Let's simplify **${display}**. I'll give hints, not answers.`,
    hints: [
      `Like terms have the same variable and power (like 3${v} and 5${v}). Which terms here are alike?`,
      groups ? 'First remove the parentheses by distributing: multiply the outside number by each term inside.' : `Group the ${v} terms together and the plain numbers together.`,
      groups ? 'Watch the signs: a minus in front of parentheses changes the sign of every term inside.' : `Add the numbers in front of like terms. The ${v} part stays the same.`,
      `Check: plug a number like ${v} = 2 into the original and into your answer. Both should give the same value.`,
    ],
    answerValues: [],
    check: (t) => {
      const m = extractMath(t) || t;
      try {
        const s = parse(m.replace(/^.*=/, ''));
        const Q = toPoly(s, v);
        if (!Q.eq(P)) return { verdict: 'wrong', feedback: `Not quite. Try ${v} = 2 in the original and in your answer: they give ${fmt(P.at(2))} and ${fmt(Q.at(2))}.` };
        if (hasGroup(s) || Q.terms() < countTerms(s)) return { verdict: 'partial', feedback: 'That\'s equal to it, but it can be simplified more. Combine all the like terms.' };
        return { verdict: 'correct', feedback: praise() };
      } catch {
        return { verdict: 'unclear' };
      }
    },
  };
}

function factorProblem(ast, v, math) {
  let P;
  try {
    P = toPoly(ast, v);
  } catch {
    return null;
  }
  const display = pretty(math);
  const a = P.coef(2).valueOf();
  const b = P.coef(1).valueOf();
  const c = P.coef(0).valueOf();
  const quad = P.degree() === 2 && [a, b, c].every(Number.isInteger);
  return {
    kind: 'factor',
    variable: v,
    display,
    intro: `Let's factor **${display}**. I'll give hints, not answers.`,
    hints: [
      'Factoring is the reverse of multiplying out. First: is there a factor every term shares?',
      quad && a === 1 ? `Look for two numbers that multiply to ${fmt(c)} and add to ${fmt(b)}.` : 'Take out the greatest common factor, then look at what\'s left.',
      quad && a === 1 ? `Factor pairs of ${Math.abs(c)}: ${factorPairs(c).map(([p, q]) => `${p} × ${q}`).join(', ')}. Mind the signs.` : 'If what\'s left is a quadratic, try the AC method or look for a difference of squares.',
      'Check by multiplying your factors back out. You should get the original expression.',
    ],
    answerValues: [],
    check: (t) => {
      const m = extractMath(t) || t;
      try {
        const s = parse(m.replace(/^.*=/, ''));
        const Q = toPoly(s, v);
        if (!Q.eq(P)) return { verdict: 'wrong', feedback: 'Multiply your factors back out. Do you get the original expression? Check the signs and the middle term.' };
        if (!hasGroup(s)) return { verdict: 'partial', feedback: 'That\'s equal, but it isn\'t factored yet. Write it as a product, like (x + p)(x + q).' };
        return { verdict: 'correct', feedback: praise() };
      } catch {
        return { verdict: 'unclear' };
      }
    },
  };
}

function countTerms(ast) {
  if (ast.type === 'add' || ast.type === 'sub') return countTerms(ast.a) + countTerms(ast.b);
  return 1;
}

// ---------------------------------------------------------------------------
// Systems of two linear equations
// ---------------------------------------------------------------------------

function systemProblem(text) {
  const t = normalize(text);
  const parts = t
    .split(/\n|;|,(?![^(]*\))|\band\b/)
    .map((s) => extractMath(s))
    .filter((s) => s && s.includes('='));
  if (parts.length !== 2) return null;
  let e1;
  let e2;
  try {
    const p1 = parse(parts[0]);
    const p2 = parse(parts[1]);
    e1 = toLinear({ type: 'sub', a: p1.a, b: p1.b });
    e2 = toLinear({ type: 'sub', a: p2.a, b: p2.b });
  } catch {
    return null;
  }
  const vars = [...new Set([...e1.coefs.keys(), ...e2.coefs.keys()])].filter(
    (v) => !(e1.coefs.get(v)?.isZero?.() ?? true) || !(e2.coefs.get(v)?.isZero?.() ?? true),
  );
  if (vars.length !== 2) return null;
  vars.sort();
  const [x, y] = vars;
  const g = (e, v) => e.coefs.get(v) || new Frac(0);
  const a1 = g(e1, x), b1 = g(e1, y), c1 = e1.k.neg();
  const a2 = g(e2, x), b2 = g(e2, y), c2 = e2.k.neg();
  const det = a1.mul(b2).sub(a2.mul(b1));
  const display = `${pretty(parts[0])} and ${pretty(parts[1])}`;
  if (det.isZero()) {
    return {
      kind: 'system',
      variable: x,
      display,
      intro: `Let's look at the system **${display}**.`,
      hints: [
        'Try to eliminate one variable. What happens?',
        'If both variables disappear, look at what\'s left: always true or never true?',
        'Always true: infinitely many solutions (same line). Never true: no solution (parallel lines).',
        'Write your conclusion in words.',
      ],
      answerValues: [],
      check: (t2) =>
        /no solution|parallel|infinite|many|same line/i.test(t2)
          ? { verdict: 'correct', feedback: praise() }
          : { verdict: 'wrong', feedback: 'Try eliminating a variable and see what\'s left.' },
    };
  }
  const X = c1.mul(b2).sub(c2.mul(b1)).div(det);
  const Y = a1.mul(c2).sub(a2.mul(c1)).div(det);
  let elimHint;
  if (b1.abs().eq(b2.abs()) && !b1.isZero())
    elimHint = `Look at the ${y} terms: ${term(b1, y)} and ${term(b2, y)}. If you ${b1.eq(b2) ? 'subtract' : 'add'} the two equations, ${y} cancels out. Try it.`;
  else if (a1.abs().eq(a2.abs()) && !a1.isZero())
    elimHint = `Look at the ${x} terms: ${term(a1, x)} and ${term(a2, x)}. If you ${a1.eq(a2) ? 'subtract' : 'add'} the two equations, ${x} cancels out. Try it.`;
  else if ([a1, b1, a2, b2].some((c) => c.abs().eq(1)))
    elimHint = 'One variable has a 1 in front of it. Solve that equation for that variable, then substitute it into the other equation.';
  else elimHint = `Multiply one or both equations so the ${x} terms (or the ${y} terms) have the same number in front. Then subtract to eliminate it.`;
  return {
    kind: 'system',
    variable: x,
    display,
    intro: `Let's solve the system **${display}**. I'll give hints, not answers.`,
    hints: [
      'Two equations, two unknowns. You can use substitution or elimination. Is one variable easy to get by itself, or do two terms already match?',
      elimHint,
      `Once one variable is gone, you have a simple equation with only one letter. Solve it.`,
      `Plug that value into either original equation to find the other variable. Then check BOTH equations with your two values.`,
    ],
    answerValues: [X, Y],
    check: (t2) => {
      const lower = normalize(t2).toLowerCase();
      const vals = {};
      for (const m of lower.matchAll(/([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)/g)) vals[m[1]] = m[2];
      let vx = vals[x];
      let vy = vals[y];
      if (vx == null || vy == null) {
        const nums = parseAnswerNumbers(lower.replace(/[a-z]\s*=/g, ','));
        if (nums.length >= 2) {
          vx = nums[0].value;
          vy = nums[1].value;
        }
      }
      if (vx == null || vy == null) return { verdict: 'unclear' };
      const nx = Number(evaluateSafe(vx));
      const ny = Number(evaluateSafe(vy));
      const okx = close(nx, Number(X), String(vx).includes('.') ? 2 : 0);
      const oky = close(ny, Number(Y), String(vy).includes('.') ? 2 : 0);
      if (okx && oky) return { verdict: 'correct', feedback: `${praise()} Both equations check out.` };
      if (okx || oky) return { verdict: 'partial', feedback: `One of your values is right. Plug ${okx ? x : y} back into an original equation to find the other one again.` };
      return { verdict: 'wrong', feedback: `Not quite. Plug your values into the first equation: does the left side equal the right side? Then check the second one.` };
    },
  };
}

// ---------------------------------------------------------------------------
// Word-problem shapes: percent, slope, Pythagorean theorem
// ---------------------------------------------------------------------------

const NUM = '(-?\\d+(?:\\.\\d+)?)';

function numericProblem({ kind, display, intro, hints, value, unitless = true }) {
  return {
    kind,
    variable: null,
    display,
    intro,
    hints,
    answerValues: [value],
    check: (t) => {
      const nums = parseAnswerNumbers(String(t).replace(/%/g, ''));
      if (!nums.length) return { verdict: 'unclear' };
      const n = nums[nums.length - 1];
      if (close(n.value, value, Math.max(n.decimals, Number.isInteger(value) ? 0 : 1))) return { verdict: 'correct', feedback: praise() };
      return { verdict: 'wrong', feedback: 'Not quite. Go back to the last hint and redo that step slowly.' + (unitless ? '' : '') };
    },
  };
}

function percentProblem(lower) {
  let m = lower.match(new RegExp(`${NUM}\\s*%\\s*of\\s*\\$?${NUM}`));
  if (m && !/what percent/.test(lower)) {
    const p = Number(m[1]);
    const n = Number(m[2]);
    return numericProblem({
      kind: 'percent',
      display: `${p}% of ${n}`,
      intro: `Let's find **${p}% of ${n}**. I'll give hints, not answers.`,
      hints: [
        `Percent means "out of 100". How could you write ${p}% as a decimal or a fraction?`,
        `${p}% = ${p}/100 = ${p / 100}. In math, "of" usually means multiply. What do you multiply?`,
        `Another way: find 10% of ${n} first (divide by 10), then build up to ${p}%.`,
        `Check: ${p < 100 ? `your answer should be smaller than ${n}` : `your answer should be bigger than ${n}`}. Does it make sense?`,
      ],
      value: (p / 100) * n,
    });
  }
  m = lower.match(new RegExp(`${NUM}\\s*is\\s*what\\s*(?:percent|%)\\s*of\\s*${NUM}`));
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return numericProblem({
      kind: 'percent',
      display: `${a} is what percent of ${b}?`,
      intro: `Let's figure out **what percent ${a} is of ${b}**. I'll give hints, not answers.`,
      hints: [
        `You're comparing a part to a whole. Which number is the part and which is the whole?`,
        'Write it as a fraction: part over whole.',
        'Divide the top by the bottom, then multiply by 100 to turn it into a percent.',
        `Check: ${a < b ? `${a} is less than ${b}, so your answer should be under 100%` : `${a} is more than ${b}, so your answer should be over 100%`}.`,
      ],
      value: (a / b) * 100,
    });
  }
  m = lower.match(new RegExp(`(increase|decrease|raise|lower|discount)\\D*?${NUM}\\D*?by\\s*${NUM}\\s*%`));
  if (m) {
    const up = /increase|raise/.test(m[1]);
    const n = Number(m[2]);
    const p = Number(m[3]);
    return numericProblem({
      kind: 'percent',
      display: `${up ? 'Increase' : 'Decrease'} ${n} by ${p}%`,
      intro: `Let's ${up ? 'increase' : 'decrease'} **${n} by ${p}%**. I'll give hints, not answers.`,
      hints: [
        `First find ${p}% of ${n}. That's how much it ${up ? 'goes up' : 'goes down'}.`,
        `${p}% = ${p / 100} as a decimal. Multiply it by ${n}.`,
        `Then ${up ? 'add that amount to' : 'subtract that amount from'} ${n}.`,
        `Shortcut to check: multiply ${n} by ${up ? 1 + p / 100 : 1 - p / 100}.`,
      ],
      value: n * (up ? 1 + p / 100 : 1 - p / 100),
    });
  }
  return null;
}

function slopeProblem(lower) {
  if (!/slope|rate of change|gradient/.test(lower)) return null;
  const re = new RegExp(`\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)[^()]*\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)`);
  const m = normalize(lower).match(re);
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
  const display = `the slope through (${x1}, ${y1}) and (${x2}, ${y2})`;
  if (x1 === x2) {
    return {
      kind: 'slope',
      display,
      intro: `Let's find **${display}**.`,
      hints: ['Compare the x values of the two points. What do you notice?', 'If the run (change in x) is 0, what happens when you divide by it?', 'A vertical line has an undefined slope.', 'Write your answer in words.'],
      answerValues: [],
      check: (t) => (/undefined|no slope|vertical/i.test(t) ? { verdict: 'correct', feedback: praise() } : { verdict: 'wrong', feedback: 'Look at the run: x₂ − x₁. What is it?' }),
    };
  }
  return numericProblem({
    kind: 'slope',
    display,
    intro: `Let's find **${display}**. I'll give hints, not answers.`,
    hints: [
      'Slope is how steep a line is: rise over run. Rise is the change in y, run is the change in x.',
      `Use m = (y₂ − y₁) / (x₂ − x₁). Label the points: (x₁, y₁) = (${x1}, ${y1}) and (x₂, y₂) = (${x2}, ${y2}).`,
      `The rise is ${y2} − ${y1 < 0 ? `(${y1})` : y1}. What's the run?`,
      'Divide the rise by the run and simplify. Check the sign: does the line go up (positive) or down (negative) from left to right?',
    ],
    value: (y2 - y1) / (x2 - x1),
  });
}

function pythagoreanProblem(lower) {
  if (!/right triangle|hypotenuse|pythag/.test(lower)) return null;
  const nums = [...lower.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (nums.length < 2) return null;
  const hm = lower.match(/hypotenuse\s*(?:is|of|=|:)?\s*(\d+(?:\.\d+)?)/);
  let value;
  let display;
  let hints;
  if (hm) {
    const c = Number(hm[1]);
    const a = nums.find((n) => n !== c);
    if (a == null || a >= c) return null;
    value = Math.sqrt(c * c - a * a);
    display = `a leg, when the hypotenuse is ${c} and the other leg is ${a}`;
    hints = [
      'In a right triangle, a² + b² = c². c is the hypotenuse: the longest side, across from the right angle. Which sides do you know?',
      `Plug in what you know: ${a}² + b² = ${c}².`,
      'Square the numbers, then move the known leg to the other side by subtracting.',
      'Take the square root to get b. Check: a leg must be shorter than the hypotenuse.',
    ];
  } else {
    const [a, b] = nums;
    value = Math.sqrt(a * a + b * b);
    display = `the hypotenuse, when the legs are ${a} and ${b}`;
    hints = [
      'In a right triangle, a² + b² = c². c is the hypotenuse: the longest side, across from the right angle. Which sides do you know?',
      `Plug in the legs: ${a}² + ${b}² = c².`,
      'Square each leg and add them. That gives you c², not c yet.',
      'Take the square root of c² to get c. Check: c should be the longest side.',
    ];
  }
  return numericProblem({ kind: 'pythagorean', display, intro: `Let's find **${display}**. I'll give hints, not answers.`, hints, value });
}

// ---------------------------------------------------------------------------

function polyStd(a, b, c, v) {
  let s = term(a, v + '²');
  if (b) s += (b < 0 ? ' − ' : ' + ') + term(Math.abs(b), v);
  if (c) s += (c < 0 ? ' − ' : ' + ') + Math.abs(c);
  return s;
}

function gcdInt(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function safeEval(ast, env) {
  try {
    return evaluate(ast, env);
  } catch {
    return NaN;
  }
}

function evaluateSafe(s) {
  try {
    return evaluate(parse(String(s)));
  } catch {
    return NaN;
  }
}
