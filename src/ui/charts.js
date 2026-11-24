// Accessible SVG charts: line and bar. Views describe a chart; after the screen is on the page,
// hydrateCharts() draws it at the real width (crisp text on phones and computers), adds a
// crosshair/tooltip on hover or keyboard arrows, and every chart has a "Show as table" view.
// Rules: one y-axis, thin 2px lines, ≥8px end dots with a surface ring, bars ≤24px wide with
// 4px rounded tops, recessive grid, a legend for 2+ series, text in text colors (never series colors).

import { html, raw, esc, fmtNum, uid } from '../util.js';

const specs = new Map();
const observers = new Map();
const NS = 'http://www.w3.org/2000/svg';

export function resetCharts() {
  specs.clear();
  for (const ro of observers.values()) ro.disconnect();
  observers.clear();
}

function niceStep(range, ticks) {
  const raw0 = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(raw0));
  const n = raw0 / mag;
  // 2.5 only as 25, 250… (0, 25, 50, 75, 100); 2.5 or 0.25 make awkward labels
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && mag >= 10 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function domain(spec) {
  const vals = [];
  for (const s of spec.series) for (const v of s.values) if (v != null && Number.isFinite(v)) vals.push(v);
  if (spec.goal?.value != null) vals.push(spec.goal.value);
  let lo = spec.yMin ?? (vals.length ? Math.min(...vals) : 0);
  let hi = spec.yMax ?? (vals.length ? Math.max(...vals) : 1);
  if (spec.type === 'bar') {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  // keep small changes from looking huge (e.g. grades 72–74 on a 72–74 axis)
  if (spec.minSpan && hi - lo < spec.minSpan) {
    const mid = (hi + lo) / 2;
    lo = spec.yMin ?? mid - spec.minSpan / 2;
    hi = spec.yMax ?? lo + spec.minSpan;
    if (spec.yMin == null && spec.yMax != null) lo = Math.min(lo, hi - spec.minSpan);
    if (spec.ceil != null && hi > spec.ceil) {
      hi = spec.ceil;
      lo = Math.min(lo, hi - spec.minSpan);
    }
  }
  if (hi === lo) hi = lo + 1;
  let step = spec.unitStep ? niceStep((hi - lo) / spec.unitStep, spec.ticks || 4) * spec.unitStep : niceStep(hi - lo, spec.ticks || 4);
  if (spec.minStep) step = Math.max(step, spec.minStep);
  if (spec.yMin == null) lo = Math.floor(lo / step + 1e-9) * step;
  if (spec.yMax == null) hi = Math.ceil(hi / step - 1e-9) * step;
  if (spec.ceil != null && hi > spec.ceil) hi = spec.ceil;
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

const fmtY = (spec, v) => (spec.yFormat ? spec.yFormat(v) : fmtNum(v, 1));
const fmtTip = (spec, v) => (spec.tipFormat ? spec.tipFormat(v) : `${fmtY(spec, v)}${spec.unit || ''}`);

/** Placeholder markup for a chart; drawn by hydrateCharts after mount. */
export function chart(spec) {
  const id = `c${uid()}`;
  const s = { height: 220, ...spec, id };
  s.hidden = new Set(spec.hiddenSeries || []);
  specs.set(id, s);
  const hasData = s.series.some((x) => x.values.some((v) => v != null));
  if (!hasData) return html`<div class="chart-empty">${spec.empty || 'No data yet.'}</div>`;
  const multi = s.series.length > 1;
  return html`
    <div class="chart-block">
      <div class="chart" data-chart="${id}" style="height:${s.height}px" tabindex="0" role="img" aria-label="${s.label || 'Chart'}. Use left and right arrow keys to read values."></div>
      ${multi
        ? html`<div class="legend" aria-label="Legend">
            ${s.series.map(
              (x) => html`<button type="button" class="${x.cls || ''}" data-legend="${id}" data-series="${x.id}" aria-pressed="${s.hidden.has(x.id) ? 'false' : 'true'}">
                <span class="${s.type === 'bar' ? 'swatch' : 'ln'}"></span>${x.name}</button>`,
            )}
          </div>`
        : ''}
      <details class="more mt">
        <summary>Show as table</summary>
        <div class="table-wrap mt">${table(s)}</div>
      </details>
    </div>`;
}

function table(s) {
  return html`<table class="data-table">
    <thead><tr><th>${s.xTitle || ''}</th>${s.series.map((x) => html`<th class="n">${x.name}</th>`)}</tr></thead>
    <tbody>
      ${s.x.map(
        (xx, i) => html`<tr><td>${xx.full || xx.label}</td>${s.series.map((x) => html`<td class="n">${x.values[i] == null ? '–' : fmtTip(s, x.values[i])}</td>`)}</tr>`,
      )}
    </tbody>
  </table>`;
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function draw(container, s) {
  const width = Math.max(240, Math.floor(container.clientWidth));
  const height = s.height;
  container.innerHTML = '';
  const visible = s.series.filter((x) => !s.hidden.has(x.id));
  const multi = s.series.length > 1;
  const endLabels = s.type === 'line' && s.endLabels !== false && visible.length <= 4 && width >= 300;
  const { lo, hi, ticks } = domain({ ...s, series: visible.length ? visible : s.series });
  const yLabelW = Math.max(...ticks.map((t) => String(fmtY(s, t)).length)) * 7.2 + 10;
  // a single series is named by the chart title, so its end label is its latest value
  const lastOf = (ser) => {
    for (let i = ser.values.length - 1; i >= 0; i--) if (ser.values[i] != null) return ser.values[i];
    return null;
  };
  const labelOf = (ser) => {
    if (s.series.length === 1) {
      const v = lastOf(ser);
      return v == null ? '' : fmtTip(s, v);
    }
    const name = ser.short || ser.name;
    return name.length > 13 ? `${name.slice(0, 12)}…` : name;
  };
  const labelW = endLabels ? Math.max(0, ...visible.map((ser) => labelOf(ser).length)) * 7.4 + 20 : 0;
  const m = { l: Math.max(28, yLabelW), r: endLabels ? Math.max(30, labelW) : 14, t: 14, b: 26 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;
  const n = s.x.length;
  const step = s.type === 'bar' ? W / Math.max(1, n) : n > 1 ? W / (n - 1) : 0;
  const xAt = (i) => (s.type === 'bar' ? m.l + step * (i + 0.5) : n > 1 ? m.l + step * i : m.l + W / 2);
  const yAt = (v) => m.t + H - ((v - lo) / (hi - lo)) * H;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' });
  const grid = el('g', { class: 'grid' }, svg);
  const axis = el('g', { class: 'axis' }, svg);
  for (const t of ticks) {
    const y = Math.round(yAt(t)) + 0.5;
    if (t !== lo) el('line', { x1: m.l, x2: m.l + W, y1: y, y2: y }, grid);
    const tx = el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' }, axis);
    tx.textContent = fmtY(s, t);
  }
  const zero = lo < 0 && hi > 0 ? 0 : lo;
  el('line', { class: 'baseline', x1: m.l, x2: m.l + W, y1: Math.round(yAt(zero)) + 0.5, y2: Math.round(yAt(zero)) + 0.5 }, svg);
  // x labels: skip some when crowded
  const maxLabels = Math.max(2, Math.floor(W / 46));
  const every = Math.ceil(n / maxLabels);
  s.x.forEach((xx, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every && i % every === 0 && n > maxLabels) return;
    const tx = el('text', { x: xAt(i), y: height - 6, 'text-anchor': n === 1 ? 'middle' : i === 0 && s.type !== 'bar' ? 'start' : i === n - 1 && s.type !== 'bar' ? 'end' : 'middle' }, axis);
    tx.textContent = xx.label;
  });

  if (s.goal?.value != null && s.goal.value >= lo && s.goal.value <= hi) {
    const gy = yAt(s.goal.value);
    el('line', { class: 'goal-line', x1: m.l, x2: m.l + W, y1: gy, y2: gy }, svg);
    const gl = el('text', { class: 'goal-label', x: m.l + 4, y: gy - 5 }, svg);
    gl.textContent = s.goal.label || `Goal ${fmtY(s, s.goal.value)}`;
  }

  const plot = el('g', {}, svg);
  if (s.type === 'line') {
    for (const ser of visible) {
      let d = '';
      let pen = false;
      ser.values.forEach((v, i) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
        pen = true;
      });
      el('path', { class: 'series', d, stroke: ser.color, 'stroke-dasharray': ser.dash ? '5 4' : null }, plot);
      // single points need a dot to be visible
      ser.values.forEach((v, i) => {
        if (v == null) return;
        const prev = ser.values[i - 1];
        const next = ser.values[i + 1];
        if (prev == null && next == null) el('circle', { cx: xAt(i), cy: yAt(v), r: 3, fill: ser.color }, plot);
      });
    }
    // end dots + direct labels
    const ends = [];
    for (const ser of visible) {
      let li = -1;
      ser.values.forEach((v, i) => {
        if (v != null) li = i;
      });
      if (li < 0) continue;
      el('circle', { class: 'end-dot', cx: xAt(li), cy: yAt(ser.values[li]), r: 5, fill: ser.color }, plot);
      ends.push({ ser, x: xAt(li), y: yAt(ser.values[li]) });
    }
    if (endLabels) {
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
      const over = ends.length ? ends[ends.length - 1].y - (m.t + H) : 0;
      if (over > 0) for (const e of ends) e.y -= over;
      for (const e of ends) {
        const t = el('text', { class: 'end-label', x: m.l + W + 10, y: e.y + 4 }, plot);
        t.textContent = labelOf(e.ser);
      }
    }
  } else {
    const ser = visible[0] || s.series[0];
    const bw = Math.min(24, step * 0.62);
    ser.values.forEach((v, i) => {
      if (v == null) return;
      const x = xAt(i) - bw / 2;
      const y0 = yAt(zero);
      const y1 = yAt(v);
      const h = Math.abs(y0 - y1);
      const r = Math.min(4, h, bw / 2);
      let d = '';
      if (h > 0.5 && v >= zero) d = `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 + r}V${y0}Z`;
      else if (h > 0.5) d = `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 - r}V${y0}Z`;
      if (d) el('path', { class: 'bar-rect', d, fill: ser.color, 'fill-opacity': s.partialLast && i === n - 1 ? 0.55 : null, 'data-i': i }, plot);
    });
  }

  // interaction layer
  const xhair = el('line', { class: 'xhair', y1: m.t, y2: m.t + H, visibility: 'hidden' }, svg);
  const dots = el('g', { visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l - 10, y: 0, width: W + 20, height, fill: 'transparent' }, svg);
  container.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.appendChild(tip);

  let current = -1;
  function show(i, px) {
    if (i < 0 || i >= n) return hide();
    current = i;
    const x = xAt(i);
    dots.innerHTML = '';
    if (s.type === 'line') {
      xhair.setAttribute('x1', x);
      xhair.setAttribute('x2', x);
      xhair.setAttribute('visibility', 'visible');
      for (const ser of visible) {
        const v = ser.values[i];
        if (v == null) continue;
        el('circle', { class: 'hover-dot', cx: x, cy: yAt(v), r: 5, fill: ser.color }, dots);
      }
      dots.setAttribute('visibility', 'visible');
    } else {
      for (const r of svg.querySelectorAll('.bar-rect')) r.classList.toggle('dim', Number(r.dataset.i) !== i);
    }
    const rows = (s.type === 'line' ? visible : [visible[0] || s.series[0]])
      .map((ser) => {
        const v = ser.values[i];
        return `<div class="r"><span>${multi ? `<i class="${s.type === 'bar' ? 'swatch' : 'dot'} ${esc(ser.cls || '')}"></i>` : ''}${esc(ser.name)}</span><b>${v == null ? '–' : esc(fmtTip(s, v))}</b></div>`;
      })
      .join('');
    const extra = s.tipExtra ? s.tipExtra(i) : '';
    tip.innerHTML = `<div class="t">${esc(s.x[i].full || s.x[i].label)}</div>${rows}${extra ? `<div class="tiny muted mt">${esc(extra)}</div>` : ''}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = (px ?? x) + 12;
    if (left + tw > width) left = (px ?? x) - tw - 12;
    left = Math.max(0, Math.min(width - tw, left));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, Math.min(height - th, m.t))}px`;
  }
  function hide() {
    current = -1;
    tip.hidden = true;
    xhair.setAttribute('visibility', 'hidden');
    dots.setAttribute('visibility', 'hidden');
    for (const r of svg.querySelectorAll('.bar-rect')) r.classList.remove('dim');
  }
  function indexAt(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    let i;
    if (s.type === 'bar') i = Math.floor((px - m.l) / step);
    else i = n > 1 ? Math.round((px - m.l) / step) : 0;
    return { i: Math.max(0, Math.min(n - 1, i)), px };
  }
  hit.addEventListener('pointermove', (e) => {
    const { i, px } = indexAt(e.clientX);
    show(i, px);
  });
  hit.addEventListener('pointerdown', (e) => {
    const { i, px } = indexAt(e.clientX);
    show(i, px);
  });
  hit.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  container.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = current < 0 ? (e.key === 'ArrowRight' ? 0 : n - 1) : current + (e.key === 'ArrowRight' ? 1 : -1);
      show(Math.max(0, Math.min(n - 1, next)));
    } else if (e.key === 'Escape') hide();
  };
  container.onblur = hide;
}

/** Draw every chart placeholder inside root, and redraw when its width changes. */
export function hydrateCharts(root) {
  for (const c of root.querySelectorAll('[data-chart]')) {
    const s = specs.get(c.dataset.chart);
    if (!s) continue;
    draw(c, s);
    if (typeof ResizeObserver !== 'undefined' && !observers.has(c.dataset.chart)) {
      let w = c.clientWidth;
      let t = null;
      const ro = new ResizeObserver(() => {
        if (Math.abs(c.clientWidth - w) < 2) return;
        w = c.clientWidth;
        clearTimeout(t);
        t = setTimeout(() => c.isConnected && draw(c, s), 60);
      });
      ro.observe(c);
      observers.set(c.dataset.chart, ro);
    }
  }
}

/** Legend buttons turn series on and off (colors never move: they follow the class). */
export function toggleSeries(btn) {
  const s = specs.get(btn.dataset.legend);
  if (!s) return;
  const id = btn.dataset.series;
  if (s.hidden.has(id)) s.hidden.delete(id);
  else if (s.hidden.size < s.series.length - 1) s.hidden.add(id);
  btn.setAttribute('aria-pressed', s.hidden.has(id) ? 'false' : 'true');
  const c = document.querySelector(`[data-chart="${CSS.escape(s.id)}"]`);
  if (c) draw(c, s);
}

export { raw };
