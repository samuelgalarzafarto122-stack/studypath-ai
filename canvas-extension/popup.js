/* StudyPath for Canvas: toolbar popup. Shows whether this tab is Canvas, turns demo mode on or off,
   and lets the student turn StudyPath on for a school Canvas that uses its own web address
   (for example canvas.myschool.org instead of myschool.instructure.com). */
"use strict";
const statusEl = document.getElementById("status");
const demoEl = document.getElementById("demo");
const SCRIPTS = ["logic.js", "canvas-api.js", "panel.js"];

chrome.storage.local.get({ demo: false }).then(({ demo }) => { demoEl.checked = demo; });
demoEl.addEventListener("change", () => chrome.storage.local.set({ demo: demoEl.checked }));
document.getElementById("open-demo").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("demo.html") }));

function show(text, buttonText, onClick) {
  statusEl.replaceChildren();
  const p = document.createElement("p");
  p.textContent = text;
  statusEl.append(p);
  if (buttonText) {
    const b = document.createElement("button");
    b.textContent = buttonText;
    b.addEventListener("click", onClick);
    statusEl.append(b);
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url;
  try { url = new URL(tab.url); } catch { url = null; }
  if (!url || url.protocol !== "https:") { show("Open your school's Canvas to see your StudyPath panel."); return; }
  if (url.hostname.endsWith(".instructure.com")) { show("✓ StudyPath is on for this Canvas. Look for the blue StudyPath button at the bottom right."); return; }

  const origin = `${url.origin}/*`;
  const id = `studypath-${url.hostname}`;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length > 0;
  if (granted && registered) { show(`✓ StudyPath is on for ${url.hostname}.`); return; }

  show(`Is ${url.hostname} your school's Canvas? Turn StudyPath on here.`, "Use StudyPath on this site", async () => {
    // Must run straight from the click: Chrome asks the student to allow this one site.
    const ok = await chrome.permissions.request({ origins: [origin] });
    if (!ok) { show("Not turned on. You can try again any time."); return; }
    await chrome.scripting.registerContentScripts([{ id, matches: [origin], js: SCRIPTS, runAt: "document_idle" }]).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: SCRIPTS });
    show(`✓ StudyPath is on for ${url.hostname}. If you don't see the button, this may not be a Canvas page.`);
  });
}
init();
