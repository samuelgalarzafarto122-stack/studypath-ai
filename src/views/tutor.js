// AI Tutor chat. Hints, not answers: the built-in engine checks math exactly and decides the hint
// level; when a real AI is available it rewrites replies in natural language under the same rules.

import { html, richText, prettyMath, fmtAgo, fmtDate, todayISO, nowISO } from '../util.js';
import { activeClasses, classById, classAverage } from '../logic/grades.js';
import { STARTER_CHIPS, currentProblem } from '../tutor/engine.js';
import { detectProvider } from '../tutor/ai.js';
import { icon } from '../ui/icons.js';
import { classDot } from '../ui/parts.js';
import { openSheet, toast, confirmSheet } from '../ui/dom.js';
import * as A from '../actions.js';
import { store } from '../state.js';

let activeChat = read('sp:tutor-chat');
let selectedClass = null;
let pending = null; // { text, partial, startedAt }
let controller = null;
let engineInfo = { checked: false, name: 'built-in', label: 'Built-in tutor' };

function read(k) {
  try {
    return sessionStorage.getItem(k) || null;
  } catch {
    return null;
  }
}
function write(k, v) {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {}
}

function chatRecords(s, chatId) {
  if (!chatId) return [];
  return s.tutor.filter((r) => !r.deleted && (r.chatId || r.id) === chatId).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

function defaultClass(s) {
  const classes = activeClasses(s);
  if (!classes.length) return null;
  let best = classes[0];
  let bestAvg = Infinity;
  for (const c of classes) {
    const a = classAverage(s, c.id);
    if (a != null && a < bestAvg) {
      bestAvg = a;
      best = c;
    }
  }
  return best.id;
}

function dividerFor(rec) {
  if (rec.kind === 'problem') return `New problem: ${prettyMath(rec.title)}`;
  if (rec.kind === 'quiz') return rec.title;
  if (rec.kind === 'concept') return `New topic: ${rec.title}`;
  return 'New question';
}

function msgHTML(m) {
  if (m.role === 'user') return html`<div class="msg user">${richText(m.text)}</div>`;
  const meta = [];
  if (m.hintLevel) meta.push(html`<span class="pill accent" style="padding:1px 8px">${icon('bulb')}Hint ${m.hintLevel} of 4</span>`);
  if (m.solved) meta.push(html`<span class="pill good" style="padding:1px 8px">${icon('check')}Solved</span>`);
  if (m.engine && m.engine !== 'built-in') meta.push(html`<span>Claude</span>`);
  return html`<div class="msg tutor ${m.safety ? 'safety' : ''}">${richText(m.text)}${meta.length ? html`<div class="meta">${meta}</div>` : ''}</div>`;
}

function chipsFor(s, recs) {
  const rec = recs[recs.length - 1];
  if (!rec) return [...STARTER_CHIPS];
  if (rec.problem && !rec.problem.solved) return ['Hint', "I'm stuck", 'How do I check my answer?', 'Quiz me'];
  if (rec.concept && (rec.concept.mode === 'teach')) return ['Hint', "I don't know", 'Quiz me'];
  if (rec.concept && rec.concept.mode === 'quiz') return ["I don't know"];
  if (rec.problem?.solved) return ['Quiz me', 'Harder one', 'Easier one', 'Explain a concept'];
  return [...STARTER_CHIPS];
}

function welcome(s) {
  const cls = classById(s, selectedClass);
  const name = s.profile.nickname ? ` ${s.profile.nickname}` : '';
  return html`<div class="msg tutor">${richText(
    `Hi${name}! I'm your StudyPath tutor${cls ? ` for **${cls.name}**` : ''}. I give **hints, not answers**, so you really learn it.\n\nType a problem exactly as it's written (like \`3x + 7 = 22\`), ask about a topic (like photosynthesis), or tap **Quiz me**.`,
  )}</div>`;
}

function historyList(s, { limit = 50 } = {}) {
  const chats = A.tutorChats(s).slice(0, limit);
  if (!chats.length) return html`<p class="small muted">No conversations yet.</p>`;
  return html`<div class="list">${chats.map((c) => {
    const cls = classById(s, c.classId);
    return html`<div class="list-item">
      <button class="li-main" type="button" data-action="open-chat" data-chat="${c.chatId}" style="background:none;border:0;padding:0;text-align:left;color:inherit">
        <div class="li-title">${prettyMath(c.title)}</div>
        <div class="li-sub">${cls ? `${cls.name} · ` : ''}${c.problems ? `${c.solved}/${c.problems} solved · ` : ''}${fmtAgo(Date.parse(c.lastAt))}</div>
      </button>
      ${c.chatId === activeChat ? html`<span class="pill accent">Open</span>` : ''}
    </div>`;
  })}</div>`;
}

async function send(text, ctx) {
  const t = String(text || '').trim();
  if (!t || pending) return;
  const s = store.state;
  if (!selectedClass) selectedClass = defaultClass(s);
  pending = { text: t, partial: '', startedAt: nowISO() };
  controller = new AbortController();
  const input = document.getElementById('tutor-input');
  if (input) {
    input.value = '';
    input.dataset.fresh = '';
  }
  ctx.render();
  try {
    const res = await A.sendTutorMessage({
      chatId: activeChat,
      text: t,
      classId: selectedClass === 'none' ? null : selectedClass,
      signal: controller.signal,
      onPartial: (p) => {
        if (!pending) return;
        pending.partial = p;
        const el = document.getElementById('pending-bubble');
        if (el) {
          el.innerHTML = String(richText(p));
          el.classList.remove('typing');
          scrollDown();
        }
      },
    });
    if (res) {
      activeChat = res.chatId;
      write('sp:tutor-chat', activeChat);
      if (res.engine !== 'built-in') engineInfo = { checked: true, name: res.engine, label: 'Claude AI' };
      if (res.note) toast(res.note, { iconName: 'info' });
    }
  } catch (e) {
    console.error(e);
    toast('Something went wrong. Please try again.', { iconName: 'alert' });
    const el = document.getElementById('tutor-input');
    if (el && !el.value) el.value = t;
  } finally {
    pending = null;
    controller = null;
    ctx.render();
    requestAnimationFrame(() => document.getElementById('tutor-input')?.focus({ preventScroll: true }));
  }
}

// Size the chat to the space left on screen (under the header, above the phone tab bar),
// so the message box is always visible without scrolling the page.
function fitChat() {
  const card = document.querySelector('.chat-card');
  if (!card) return;
  const top = card.getBoundingClientRect().top + window.scrollY;
  const tab = document.querySelector('.tabbar');
  const tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0;
  const h = Math.max(300, Math.floor(window.innerHeight - top - tabH - 16));
  card.style.height = `${h}px`;
}
let fitTimer = 0;
function onResize() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitChat, 80);
}

function scrollDown() {
  const log = document.getElementById('chat-log');
  if (log) log.scrollTop = log.scrollHeight;
}

function newChat(ctx) {
  if (pending) return;
  activeChat = null;
  write('sp:tutor-chat', null);
  ctx.render();
  document.getElementById('tutor-input')?.focus();
}

export default {
  title: 'AI Tutor',
  render(s) {
    const classes = activeClasses(s);
    const handoff = read('sp:tutor-class');
    if (handoff != null) {
      write('sp:tutor-class', null);
      if (handoff && handoff !== selectedClass) {
        selectedClass = handoff;
        activeChat = null;
        write('sp:tutor-chat', null);
      }
    }
    if (selectedClass !== 'none' && (!selectedClass || !classById(s, selectedClass) || classById(s, selectedClass).deleted)) selectedClass = defaultClass(s);
    let recs = chatRecords(s, activeChat);
    if (activeChat && !recs.length) {
      activeChat = null;
      write('sp:tutor-chat', null);
    }
    if (recs.length && recs[0].classId && recs[0].classId !== selectedClass && classById(s, recs[0].classId)) selectedClass = recs[0].classId;
    const resolved = pending && recs.some((r) => (r.messages || []).some((m) => m.role === 'user' && m.at >= pending.startedAt));
    const showPending = pending && !resolved;
    const chips = chipsFor(s, recs);
    const ai = engineInfo.name !== 'built-in' && s.settings.tutorEngine !== 'built-in';
    return html`
      <div class="page-head compact-m">
        <div><h1>AI Tutor</h1><p>Hints, not answers. You do the thinking; the tutor keeps you moving.</p></div>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="tutor-history">${icon('history')}History</button>
          <button class="btn" type="button" data-action="new-chat">${icon('plus')}New chat</button>
        </div>
      </div>
      <div class="tutor-layout">
        <section class="card chat-card" aria-label="Tutor conversation">
          <div class="chat-head">
            <label class="sr-only" for="tutor-class">Class</label>
            ${classes.length
              ? html`<select class="input" id="tutor-class" data-change="tutor-class">${classes.map((c) => html`<option value="${c.id}" ${c.id === selectedClass ? 'selected' : ''}>${c.name}</option>`)}<option value="none" ${selectedClass === 'none' ? 'selected' : ''}>Other subject</option></select>`
              : ''}
            <span class="engine ${ai ? 'ai' : ''}" title="${ai ? 'Replies are written by Claude, checked by the app' : 'Works offline, no account needed'}"><i></i>${ai ? 'Claude AI + app checks' : 'Built-in tutor'}</span>
            <span class="head-actions mobile-only">
              <button class="icon-btn" type="button" data-action="tutor-history" aria-label="Chat history">${icon('history')}</button>
              <button class="icon-btn" type="button" data-action="new-chat" aria-label="New chat">${icon('plus')}</button>
            </span>
          </div>
          <div class="chat-log" id="chat-log" data-keep-scroll aria-live="polite" aria-relevant="additions">
            ${welcome(s)}
            ${recs.map((r, i) => html`${i > 0 ? html`<div class="divider">${dividerFor(r)}</div>` : ''}${(r.messages || []).map(msgHTML)}`)}
            ${showPending
              ? html`<div class="msg user">${richText(pending.text)}</div>
                  ${pending.partial ? html`<div class="msg tutor" id="pending-bubble">${richText(pending.partial)}</div>` : html`<div class="msg tutor typing" id="pending-bubble" aria-label="Tutor is typing"><i></i><i></i><i></i></div>`}`
              : ''}
          </div>
          <div class="chips" role="group" aria-label="Quick replies">
            ${chips.map((c, i) => html`<button class="chip ${i === 0 ? 'primary' : ''}" type="button" data-action="tutor-chip" data-text="${c}" ${pending ? 'disabled' : ''}>${c}</button>`)}
          </div>
          <form class="composer" data-form="tutor-send" autocomplete="off">
            <label class="sr-only" for="tutor-input">Message the tutor</label>
            <textarea class="input" id="tutor-input" name="text" rows="1" maxlength="1000" placeholder="Type a problem or a question…" data-keydown="tutor-key" data-input="tutor-grow" enterkeyhint="send"></textarea>
            <button class="btn" type="submit" aria-label="Send" ${pending ? 'disabled' : ''}>${pending ? html`<span class="spinner" aria-hidden="true"></span>` : icon('send')}</button>
          </form>
        </section>
        <aside class="stack loose desktop-only">
          <section class="card">
            <div class="card-head"><h3>How the tutor works</h3></div>
            <div class="rules"><ul>
              <li>${icon('check')}<span>Gives <b>one hint at a time</b>, never the final answer.</span></li>
              <li>${icon('check')}<span>Checks your answer and shows <b>where to look</b> when it's off.</span></li>
              <li>${icon('check')}<span>Explains concepts in small steps, then quizzes you.</span></li>
              <li>${icon('heart')}<span>If you're going through something hard, it points you to people who can help.</span></li>
            </ul></div>
          </section>
          <section class="card">
            <div class="card-head"><h3>Recent</h3><button class="link-btn" type="button" data-action="tutor-history">All</button></div>
            ${historyList(s, { limit: 5 })}
          </section>
          <p class="small muted">${icon('lock', { size: 14, cls: 'inline' })} Chats are saved on this device${s.consent.cloud ? ' and in your private backup' : ''}. Teachers never see them, and the research project never uses what you type.</p>
        </aside>
      </div>`;
  },
  mounted(root, s, route, ctx, { routeChanged }) {
    fitChat();
    window.removeEventListener('resize', onResize);
    window.addEventListener('resize', onResize, { passive: true });
    scrollDown();
    if (!engineInfo.checked && s.settings.tutorEngine !== 'built-in') {
      engineInfo.checked = true;
      detectProvider(A.hooks.cloudTutor ? A.hooks.cloudTutor() : null).then((p) => {
        if (p) {
          engineInfo = { checked: true, name: p.name, label: p.label };
          ctx.render();
        }
      });
    }
    if (routeChanged && matchMedia('(pointer: fine)').matches) document.getElementById('tutor-input')?.focus({ preventScroll: true });
  },
  leave() {
    controller?.abort();
    window.removeEventListener('resize', onResize);
  },
  actions: {
    'tutor-chip': (el, e, ctx) => {
      const t = el.dataset.text;
      if (t === 'Explain a concept') return send('Explain a concept', ctx);
      if (t === 'Help me with a problem') return send('Help me with a problem', ctx);
      send(t, ctx);
    },
    'new-chat': (el, e, ctx) => newChat(ctx),
    'open-chat': (el, e, ctx) => {
      activeChat = el.dataset.chat;
      write('sp:tutor-chat', activeChat);
      document.querySelector('.scrim [data-close]')?.click();
      ctx.render();
    },
    'tutor-history': (el, e, ctx) => {
      openSheet({
        title: 'Conversations',
        body: html`<div class="stack">${historyList(store.state)}
          ${A.tutorChats(store.state).length ? html`<button class="btn small danger-ghost" type="button" data-sheet-action="delete-current" ${activeChat ? '' : 'disabled'}>${icon('trash')}Delete the open conversation</button>` : ''}</div>`,
        actions: {
          'delete-current': async (b, close) => {
            close();
            if (!activeChat) return;
            if (await confirmSheet({ title: 'Delete this conversation?', body: 'It will be removed from this device and your cloud backup.', confirm: 'Delete', danger: true })) {
              A.deleteChat(activeChat);
              newChat(ctx);
            }
          },
        },
        onOpen(root) {
          root.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-action="open-chat"]');
            if (!b) return;
            activeChat = b.dataset.chat;
            write('sp:tutor-chat', activeChat);
            root.closest('.scrim')?.querySelector('[data-close]')?.click();
            ctx.render();
          });
        },
      });
    },
  },
  forms: {
    'tutor-send': (data, form, e, ctx) => send(data.text, ctx),
  },
  keys: {
    'tutor-key': (el, e, ctx) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        send(el.value, ctx);
      }
    },
  },
  inputs: {
    'tutor-grow': (el) => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(140, el.scrollHeight)}px`;
    },
  },
  changes: {
    'tutor-class': (el, e, ctx) => {
      selectedClass = el.value || 'none';
      if (activeChat) {
        activeChat = null;
        write('sp:tutor-chat', null);
      }
      ctx.render();
    },
  },
};
