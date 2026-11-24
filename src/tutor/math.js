// Math toolkit for the built-in tutor: exact fractions, a small expression parser,
// polynomials in one variable, linear forms in several variables, and numeric evaluation.
// The tutor uses it to understand a problem and to CHECK a student's answer without ever showing it.

const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export class Frac {
  constructor(n, d = 1) {
    if (!Number.isFinite(n) || !Number.isFinite(d)) throw new MathError('number too large');
    if (d === 0) throw new MathError('division by zero');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
    if (Math.abs(this.n) > 1e12 || this.d > 1e12) throw new MathError('number too large');
  }
  static of(v) {
    if (v instanceof Frac) return v;
    if (Number.isInteger(v)) return new Frac(v, 1);
    const s = String(v);
    if (/e/i.test(s)) throw new MathError('number format');
    const [i, f = ''] = s.split('.');
    const d = 10 ** f.length;
    return new Frac(Math.round(Number(i + f)), d);
  }
  static parse(str) {
    const [i, f = ''] = String(str).split('.');
    const d = 10 ** f.length;
    return new Frac(Number((i || '0') + f), d);
  }
  add(o) {
    o = Frac.of(o);
    return new Frac(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o) {
    o = Frac.of(o);
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o) {
    o = Frac.of(o);
    return new Frac(this.n * o.n, this.d * o.d);
  }
  div(o) {
    o = Frac.of(o);
    if (o.n === 0) throw new MathError('division by zero');
    return new Frac(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Frac(-this.n, this.d);
  }
  abs() {
    return new Frac(Math.abs(this.n), this.d);
  }
  isZero() {
    return this.n === 0;
  }
  isInt() {
    return this.d === 1;
  }
  eq(o) {
    o = Frac.of(o);
    return this.n === o.n && this.d === o.d;
  }
  sign() {
    return Math.sign(this.n);
  }
  valueOf() {
    return this.n / this.d;
  }
  toString() {
    return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`;
  }
  /** Pretty form for messages: "−3", "0.25", "1/3" (short terminating decimals are shown as decimals). */
  pretty() {
    let s;
    if (this.d === 1) s = String(Math.abs(this.n));
    else {
      let d = this.d;
      while (d % 2 === 0) d /= 2;
      while (d % 5 === 0) d /= 5;
      const dec = Math.abs(this.n) / this.d;
      s = d === 1 && String(dec).length <= 6 ? String(dec) : `${Math.abs(this.n)}/${this.d}`;
    }
    return this.n < 0 ? '−' + s : s;
  }
}

export class MathError extends Error {}

// ---------- tokenizer & parser ----------

const SUP = { '²': '^2', '³': '^3', '⁴': '^4' };

export function normalize(text) {
  return String(text)
    .replace(/[²³⁴]/g, (c) => SUP[c])
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/,(?=\d{3}\b)/g, '');
}

function tokenize(src) {
  const s = normalize(src);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if ((raw.match(/\./g) || []).length > 1 || raw === '.') throw new MathError('bad number');
      out.push({ t: 'num', v: Frac.parse(raw.startsWith('.') ? '0' + raw : raw) });
      i = j;
      continue;
    }
    if (s.startsWith('sqrt', i)) {
      out.push({ t: 'fn', v: 'sqrt' });
      i += 4;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      out.push({ t: 'var', v: c.toLowerCase() });
      i++;
      continue;
    }
    if ('+-*/^()='.includes(c)) {
      out.push({ t: c });
      i++;
      continue;
    }
    if (c === '[' || c === '{') {
      out.push({ t: '(' });
      i++;
      continue;
    }
    if (c === ']' || c === '}') {
      out.push({ t: ')' });
      i++;
      continue;
    }
    throw new MathError(`unexpected "${c}"`);
  }
  return out;
}

/** Parse "expr" or "expr = expr" into an AST: {type:'num'|'var'|'add'|'sub'|'mul'|'div'|'pow'|'neg'|'fn'} */
export function parse(text) {
  const toks = tokenize(text);
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => {
    if (toks[p]?.t !== t) throw new MathError(`expected ${t}`);
    return toks[p++];
  };
  function expr() {
    let left = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[p++].t;
      const right = term();
      left = { type: op === '+' ? 'add' : 'sub', a: left, b: right };
    }
    return left;
  }
  function term() {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.t === '*' || t.t === '/') {
        p++;
        const right = unary();
        left = { type: t.t === '*' ? 'mul' : 'div', a: left, b: right };
      } else if (t.t === 'num' || t.t === 'var' || t.t === '(' || t.t === 'fn') {
        const right = power();
        left = { type: 'mul', a: left, b: right, implicit: true };
      } else break;
    }
    return left;
  }
  function unary() {
    const t = peek();
    if (t && t.t === '-') {
      p++;
      return { type: 'neg', a: unary() };
    }
    if (t && t.t === '+') {
      p++;
      return unary();
    }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === '^') {
      p++;
      const exp = unary();
      return { type: 'pow', a: base, b: exp };
    }
    return base;
  }
  function primary() {
    const t = peek();
    if (!t) throw new MathError('unexpected end');
    if (t.t === 'num') {
      p++;
      return { type: 'num', v: t.v };
    }
    if (t.t === 'var') {
      p++;
      return { type: 'var', v: t.v };
    }
    if (t.t === 'fn') {
      p++;
      take('(');
      const a = expr();
      take(')');
      return { type: 'fn', fn: t.v, a };
    }
    if (t.t === '(') {
      p++;
      const e = expr();
      take(')');
      return { type: 'group', a: e };
    }
    throw new MathError(`unexpected ${t.t}`);
  }
  const left = expr();
  if (peek() && peek().t === '=') {
    p++;
    const right = expr();
    if (p !== toks.length) throw new MathError('extra input');
    return { type: 'eq', a: left, b: right };
  }
  if (p !== toks.length) throw new MathError('extra input');
  return left;
}

export function variables(ast, set = new Set()) {
  if (!ast) return set;
  if (ast.type === 'var') set.add(ast.v);
  variables(ast.a, set);
  variables(ast.b, set);
  return set;
}

export function hasGroup(ast) {
  if (!ast) return false;
  if (ast.type === 'group') return true;
  return hasGroup(ast.a) || hasGroup(ast.b);
}

// ---------- numeric evaluation ----------

export function evaluate(ast, env = {}) {
  switch (ast.type) {
    case 'num':
      return ast.v.valueOf();
    case 'var':
      if (!(ast.v in env)) throw new MathError(`unknown ${ast.v}`);
      return env[ast.v];
    case 'group':
      return evaluate(ast.a, env);
    case 'neg':
      return -evaluate(ast.a, env);
    case 'add':
      return evaluate(ast.a, env) + evaluate(ast.b, env);
    case 'sub':
      return evaluate(ast.a, env) - evaluate(ast.b, env);
    case 'mul':
      return evaluate(ast.a, env) * evaluate(ast.b, env);
    case 'div':
      return evaluate(ast.a, env) / evaluate(ast.b, env);
    case 'pow':
      return evaluate(ast.a, env) ** evaluate(ast.b, env);
    case 'fn':
      if (ast.fn === 'sqrt') return Math.sqrt(evaluate(ast.a, env));
      throw new MathError('unknown function');
    default:
      throw new MathError('cannot evaluate');
  }
}

/** Exact value of an expression with no variables (null if it needs roots or is not rational). */
export function exactValue(ast) {
  try {
    const poly = toPoly(ast, '_');
    return poly.degree() <= 0 ? poly.coef(0) : null;
  } catch {
    return null;
  }
}

// ---------- polynomials in one variable ----------

export class Poly {
  constructor(map = new Map()) {
    this.c = new Map();
    for (const [k, v] of map) if (!v.isZero()) this.c.set(k, v);
  }
  static const(v) {
    return new Poly(new Map([[0, Frac.of(v)]]));
  }
  static x() {
    return new Poly(new Map([[1, new Frac(1)]]));
  }
  coef(k) {
    return this.c.get(k) || new Frac(0);
  }
  degree() {
    let d = -Infinity;
    for (const k of this.c.keys()) d = Math.max(d, k);
    return d === -Infinity ? 0 : d;
  }
  isZero() {
    return this.c.size === 0;
  }
  add(o) {
    const m = new Map(this.c);
    for (const [k, v] of o.c) m.set(k, (m.get(k) || new Frac(0)).add(v));
    return new Poly(m);
  }
  neg() {
    const m = new Map();
    for (const [k, v] of this.c) m.set(k, v.neg());
    return new Poly(m);
  }
  sub(o) {
    return this.add(o.neg());
  }
  mul(o) {
    const m = new Map();
    for (const [a, va] of this.c)
      for (const [b, vb] of o.c) m.set(a + b, (m.get(a + b) || new Frac(0)).add(va.mul(vb)));
    return new Poly(m);
  }
  scale(f) {
    const m = new Map();
    for (const [k, v] of this.c) m.set(k, v.mul(f));
    return new Poly(m);
  }
  eq(o) {
    return this.sub(o).isZero();
  }
  at(x) {
    let s = 0;
    for (const [k, v] of this.c) s += v.valueOf() * x ** k;
    return s;
  }
  terms() {
    return this.c.size;
  }
  /** "2x² − 3x + 1" */
  pretty(v = 'x') {
    const keys = [...this.c.keys()].sort((a, b) => b - a);
    if (!keys.length) return '0';
    const sup = { 2: '²', 3: '³', 4: '⁴' };
    let out = '';
    keys.forEach((k, i) => {
      const c = this.c.get(k);
      const neg = c.sign() < 0;
      const a = c.abs();
      let body;
      if (k === 0) body = a.pretty();
      else {
        const coef = a.eq(1) ? '' : a.pretty();
        body = coef + v + (k === 1 ? '' : sup[k] || `^${k}`);
      }
      if (i === 0) out += (neg ? '−' : '') + body;
      else out += (neg ? ' − ' : ' + ') + body;
    });
    return out;
  }
}

export function toPoly(ast, v) {
  switch (ast.type) {
    case 'num':
      return Poly.const(ast.v);
    case 'var':
      if (ast.v !== v) throw new MathError('second variable');
      return Poly.x();
    case 'group':
      return toPoly(ast.a, v);
    case 'neg':
      return toPoly(ast.a, v).neg();
    case 'add':
      return toPoly(ast.a, v).add(toPoly(ast.b, v));
    case 'sub':
      return toPoly(ast.a, v).sub(toPoly(ast.b, v));
    case 'mul':
      return toPoly(ast.a, v).mul(toPoly(ast.b, v));
    case 'div': {
      const d = toPoly(ast.b, v);
      if (d.degree() > 0) throw new MathError('variable in denominator');
      return toPoly(ast.a, v).scale(new Frac(1).div(d.coef(0)));
    }
    case 'pow': {
      const e = toPoly(ast.b, v);
      if (e.degree() > 0 || !e.coef(0).isInt() || e.coef(0) < 0 || e.coef(0) > 8) throw new MathError('exponent');
      let r = Poly.const(1);
      const base = toPoly(ast.a, v);
      for (let i = 0; i < e.coef(0).valueOf(); i++) r = r.mul(base);
      return r;
    }
    default:
      throw new MathError('not a polynomial');
  }
}

// ---------- linear forms in several variables (for systems) ----------

export function toLinear(ast) {
  // returns { coefs: Map(var -> Frac), k: Frac }
  const L = (coefs, k) => ({ coefs, k });
  const add = (a, b, s = 1) => {
    const m = new Map(a.coefs);
    for (const [v, c] of b.coefs) m.set(v, (m.get(v) || new Frac(0)).add(s === 1 ? c : c.neg()));
    return L(m, s === 1 ? a.k.add(b.k) : a.k.sub(b.k));
  };
  const scale = (a, f) => {
    const m = new Map();
    for (const [v, c] of a.coefs) m.set(v, c.mul(f));
    return L(m, a.k.mul(f));
  };
  const isConst = (a) => [...a.coefs.values()].every((c) => c.isZero());
  switch (ast.type) {
    case 'num':
      return L(new Map(), ast.v);
    case 'var':
      return L(new Map([[ast.v, new Frac(1)]]), new Frac(0));
    case 'group':
      return toLinear(ast.a);
    case 'neg':
      return scale(toLinear(ast.a), new Frac(-1));
    case 'add':
      return add(toLinear(ast.a), toLinear(ast.b));
    case 'sub':
      return add(toLinear(ast.a), toLinear(ast.b), -1);
    case 'mul': {
      const a = toLinear(ast.a);
      const b = toLinear(ast.b);
      if (isConst(a)) return scale(b, a.k);
      if (isConst(b)) return scale(a, b.k);
      throw new MathError('not linear');
    }
    case 'div': {
      const b = toLinear(ast.b);
      if (!isConst(b)) throw new MathError('not linear');
      return scale(toLinear(ast.a), new Frac(1).div(b.k));
    }
    default:
      throw new MathError('not linear');
  }
}

// ---------- helpers for the tutor ----------

/** Pull the most math-looking piece out of a sentence ("how do I solve 3x+7=22?" -> "3x+7=22"). */
export function extractMath(text) {
  const t = normalize(text).replace(/[?!]+/g, ' ').replace(/[;:]\s/g, ' ');
  // Runs of characters that can appear in math. Letters only count when they stand alone (variables).
  const re = /[0-9a-zA-Z+\-*/^().=\s√[\]{}]+/g;
  const candidates = [];
  for (const m of t.matchAll(re)) {
    const words = m[0].trim().split(/\s+/);
    // split the run at real words (2+ letters, except "sqrt")
    let cur = [];
    const flush = () => {
      const s = cur.join(' ').trim();
      if (s) candidates.push(s);
      cur = [];
    };
    for (const w of words) {
      const letters = w.replace(/sqrt/g, '').match(/[a-zA-Z]{2,}/);
      if (letters && !/[0-9=+\-*/^()]/.test(w)) flush();
      else if (letters) {
        // a word glued to math like "is(x+2)": keep only the math part
        const cleaned = w.replace(/^[a-zA-Z]{2,}/, '').replace(/[a-zA-Z]{2,}$/, '');
        if (cleaned) cur.push(cleaned);
        else flush();
      } else cur.push(w);
    }
    flush();
  }
  const score = (s) => (s.includes('=') ? 100 : 0) + (s.match(/[+\-*/^=]/g) || []).length * 3 + (s.match(/\d/g) || []).length;
  const good = candidates
    .map((s) => s.replace(/^[^0-9a-zA-Z(\-√]+/, '').replace(/[^0-9a-zA-Z)]+$/, ''))
    .filter((s) => /\d/.test(s) && (/[+\-*/^=]/.test(s) || /^[a-z]\s*=/.test(s)));
  good.sort((a, b) => score(b) - score(a));
  return good[0] || null;
}

/** All numbers a student wrote in an answer, as {value, decimals}. Supports a/b, decimals, √, ±. */
export function parseAnswerNumbers(text, varName = 'x') {
  const t = normalize(String(text).toLowerCase())
    .replace(/\band\b|\bor\b|;/g, ',')
    .replace(new RegExp(`\\b${varName}\\s*=`, 'g'), ',');
  const out = [];
  for (const raw of t.split(',')) {
    let part = raw.trim().replace(/^[^0-9\-+.(s]+/, '').replace(/[^0-9).]+$/, '');
    const opens = (part.match(/\(/g) || []).length;
    const closes = (part.match(/\)/g) || []).length;
    if (opens !== closes) part = part.replace(/[()]/g, '');
    if (!part) continue;
    const variants = part.includes('±') || part.includes('+-') ? [part.replace(/±|\+-/, '+'), part.replace(/±|\+-/, '-')] : [part];
    for (const v of variants) {
      try {
        const ast = parse(v);
        if (variables(ast).size) continue;
        const value = evaluate(ast);
        if (!Number.isFinite(value)) continue;
        const dec = (v.match(/\.(\d+)/) || [null, ''])[1].length;
        out.push({ value, decimals: v.includes('sqrt') ? 2 : dec });
      } catch {
        /* not a number */
      }
    }
  }
  return out;
}

export function close(a, b, decimals = 0) {
  const tol = decimals > 0 ? 0.6 * 10 ** -decimals + 1e-9 : 1e-7 * Math.max(1, Math.abs(b));
  return Math.abs(a - b) <= tol;
}

export function isPerfectSquare(n) {
  if (n < 0 || !Number.isInteger(n)) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/** Positive factor pairs of n, e.g. 12 -> [[1,12],[2,6],[3,4]] */
export function factorPairs(n) {
  n = Math.abs(n);
  const out = [];
  for (let i = 1; i * i <= n; i++) if (n % i === 0) out.push([i, n / i]);
  return out;
}
