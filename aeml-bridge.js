/* =====================================================================
 * AEML Wii bridge -- (c) AEML, NTUST
 * Connects the AEML Blogger shell (parent page) to wasm-dolphin's host.
 * Messages in : hello, pick, load, input, saveState, loadState
 * Messages out: ready, picked, progress, loaded, state, stateLoaded,
 *               needGesture, gestureDone, error
 * SPDX-License-Identifier: GPL-2.0-or-later (combined with Dolphin)
 * ===================================================================== */
import { inputStateFromPressed } from "./src/input.js";

/* Pages allowed to control this core. Replace the blogspot pattern with
   your own blog address to stop other sites from embedding it. */
const ALLOWED_PARENTS = [
  /^https:\/\/[a-z0-9-]+\.blogspot\.com$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "aeml" && window.parent !== window;
const SIG = "AEML, NTUST";
let parentOrigin = null;

function allowed(origin) { return ALLOWED_PARENTS.some((re) => re.test(origin)); }
function post(msg, transfer) {
  if (!EMBED || !parentOrigin) return;
  window.parent.postMessage(Object.assign({ aeml: 1, sig: SIG }, msg), parentOrigin, transfer || []);
}

/* ---- embed layout: show only the game canvas ---- */
if (EMBED) {
  const css = document.createElement("style");
  css.textContent = `
    html,body{background:#000!important;overflow:hidden!important}
    body *{visibility:hidden!important}
    #screen{visibility:visible!important;position:fixed!important;inset:0!important;
      width:100vw!important;height:100vh!important;object-fit:contain;z-index:2147483600;background:#000}
    #aeml-gesture,#aeml-gesture *,#aeml-pick,#aeml-pick *{visibility:visible!important}
    #aeml-pick{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:rgba(0,0,0,.7);font:14px system-ui;color:#8aa0b4}
    #aeml-pick button{font:600 18px system-ui,sans-serif;padding:14px 22px;border-radius:12px;border:2px solid #22c3ee;background:#0f1720;color:#e6edf3;cursor:pointer}
    #aeml-gesture{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
    #aeml-gesture button{font:600 18px system-ui,sans-serif;padding:14px 22px;border-radius:12px;border:2px solid #22c3ee;background:#0f1720;color:#e6edf3;cursor:pointer}
    #aeml-mark{visibility:visible!important;position:fixed;left:8px;bottom:6px;z-index:2147483646;font:11px system-ui;color:rgba(255,255,255,.35);pointer-events:none}`;
  document.head.appendChild(css);
  const mark = document.createElement("div");
  mark.id = "aeml-mark"; mark.textContent = "AEML, NTUST · Dolphin (GPLv2+)";
  document.body.appendChild(mark);
}

function waitFor(test, ms = 30000, step = 50) {
  return new Promise((res, rej) => {
    const t0 = performance.now();
    (function tick() {
      let v; try { v = test(); } catch (e) { v = null; }
      if (v) return res(v);
      if (performance.now() - t0 > ms) return rej(new Error("timeout"));
      setTimeout(tick, step);
    })();
  });
}

/* ---- audio needs a click inside this frame ---- */
function askGesture() {
  if (document.getElementById("aeml-gesture")) return;
  const wrap = document.createElement("div");
  wrap.id = "aeml-gesture";
  const b = document.createElement("button");
  b.textContent = "\u{1F50A} 點此啟用聲音 / Tap for sound";
  b.onclick = () => {
    const mute = document.getElementById("muteButton");
    if (mute && /^muted$/i.test(mute.getAttribute("aria-label") || "")) mute.click();
    wrap.remove();
    post({ cmd: "gestureDone" });
  };
  wrap.appendChild(b); document.body.appendChild(wrap);
  post({ cmd: "needGesture" });
}

/* ---- Wii Remote (shell) -> GameCube pad (this core) ----
 * The core has no Wii Remote input yet; its pad input drives GameCube
 * titles and Wii titles that accept a GameCube controller. */
const MAP = { A: "A", B: "B", ONE: "X", TWO: "Y", PLUS: "START", MINUS: "Z",
  C: "L", Z: "R", SHAKE: "R", UP: "D_UP", DOWN: "D_DOWN", LEFT: "D_LEFT", RIGHT: "D_RIGHT" };
function toByte(v) { v = Math.max(-1, Math.min(1, +v || 0)); return Math.round(0x80 + v * 0x7f) & 0xff; }
function applyInput(s) {
  const host = window.__host; if (!host || !s) return;
  const pressed = new Set();
  const b = s.buttons || {};
  for (const k in MAP) if (b[k] === true) pressed.add(MAP[k]);
  const st = inputStateFromPressed(pressed);
  if (s.stick && (s.stick.x || s.stick.y)) { st.stickX = toByte(s.stick.x); st.stickY = toByte(-s.stick.y); }
  host.setInputState(st);
}

/* ---- loading progress (drives the light bar on the Blogger page) ----
 * copy : file copied in from the parent page (real byte count)
 * core : emulator core download + start-up (estimated, creeps forward)
 * mount: disc mounted in the core
 * boot : waiting for the game to start running
 * The core reports its phases through console.log("[boot-phase] ..."),
 * which we watch to move the bar at the real milestones. */
let span = [0, 100], curPct = 0, creepTimer = 0, mountSeen = false;
function progress(stage, pct, extra) {
  curPct = Math.max(curPct, Math.min(100, pct));
  const overall = span[0] + (span[1] - span[0]) * curPct / 100;
  post(Object.assign({ cmd: "progress", stage, pct: Math.round(overall * 10) / 10 }, extra || {}));
}
function creep(stage, target) {
  clearInterval(creepTimer);
  creepTimer = setInterval(() => progress(stage, curPct + (target - curPct) * 0.04), 250);
}
function stopCreep() { clearInterval(creepTimer); creepTimer = 0; }
if (EMBED) {
  const origLog = console.log;
  console.log = function () {
    try {
      const t = String(arguments[0] || "");
      if (t.indexOf("[boot-phase]") === 0) {
        if (t.indexOf("mountGame() entry") >= 0) progress("core", 8);
        else if (t.indexOf("new Worker(discio)") >= 0) { progress("core", 12); creep("core", 68); }
        else if (t.indexOf("after this.load()") >= 0) { progress("mount", 72); creep("mount", 88); }
        else if (t.indexOf("mountFile responded") >= 0) { mountSeen = true; progress("boot", 90); creep("boot", 98); }
      }
    } catch (e) { /* never break the core's logging */ }
    return origLog.apply(this, arguments);
  };
}
async function copyWithProgress(file) {
  const reader = file.stream().getReader();
  const parts = []; let got = 0, last = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    parts.push(r.value); got += r.value.length;
    const now = performance.now();
    if (now - last > 120) { last = now; progress("copy", 100 * got / file.size, { done: got, total: file.size }); }
  }
  progress("copy", 100, { done: got, total: file.size });
  return new File(parts, file.name, { type: file.type });
}

/* ---- choose the game file inside this frame ----
 * A File handed over from the parent page lives in another browser
 * process, and the core's disc reader crashes on it. Files picked or
 * dropped here are safe; small parent files are copied in instead. */
const COPY_LIMIT = 1024 * 1024 * 1024; /* 1 GiB */
function showPicker() {
  let wrap = document.getElementById("aeml-pick");
  if (wrap) return;
  wrap = document.createElement("div");
  wrap.id = "aeml-pick";
  const b = document.createElement("button");
  b.textContent = "\u{1F4BF} \u9078\u64c7\u904a\u6232\u6a94\u6848 / Choose game file";
  const inp = document.createElement("input");
  inp.type = "file"; inp.id = "aeml-pick-input"; inp.hidden = true;
  inp.accept = ".iso,.ciso,.wbfs,.wad,.rvz,.gcm,.nkit.iso";
  const note = document.createElement("div");
  note.textContent = "ISO / CISO / WBFS / WAD / RVZ";
  b.onclick = () => inp.click();
  inp.onchange = () => { const f = inp.files[0]; if (f) { wrap.remove(); startLoad(f); } };
  wrap.addEventListener("dragover", (e) => e.preventDefault());
  wrap.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { wrap.remove(); startLoad(f); } });
  wrap.append(b, note, inp); document.body.appendChild(wrap);
}
function startLoad(file, copied) {
  if (!copied) { span = [0, 100]; curPct = 0; }
  post({ cmd: "picked", name: file.name, size: file.size });
  loadGame(file).catch((err) => post({ cmd: "error", message: String((err && err.message) || err) }));
}
async function adoptParentFile(file) {
  if (file.size > COPY_LIMIT) { showPicker(); post({ cmd: "error", message: "too-big" }); return; }
  span = [0, 40]; curPct = 0; progress("copy", 0, { done: 0, total: file.size });
  const local = await copyWithProgress(file);
  span = [40, 100]; curPct = 0;
  startLoad(local, true);
}

async function loadGame(file) {
  const input = await waitFor(() => document.getElementById("romInput"));
  const host = await waitFor(() => window.__host);
  mountSeen = false; progress("core", 3); creep("core", 10);
  const dt = new DataTransfer(); dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  /* mountSeen: wait for THIS disc, not a game that was already running */
  await waitFor(() => mountSeen && host.mode === "dolphin" && host.running && host.game && host.game.mounted, 180000, 200)
    .catch(() => { stopCreep(); throw new Error("the core could not boot this disc"); });
  stopCreep(); progress("done", 100);
  post({ cmd: "loaded", title: host.game.name || file.name, gameId: host.game.gameId || "" });
  setTimeout(() => {
    const mute = document.getElementById("muteButton");
    if (mute && /^muted$/i.test(mute.getAttribute("aria-label") || "")) askGesture();
  }, 300);
}

async function saveState(id) {
  const a = window.__host && window.__host.adapter;
  if (!a || typeof a.saveStateFile !== "function") throw new Error("core has no save-state support");
  const r = await a.saveStateFile();
  if (!r || !r.bytes) throw new Error((r && r.error) || "save failed");
  const buf = new Uint8Array(r.bytes).slice().buffer;
  post({ cmd: "state", id, data: buf }, [buf]);
}
async function loadState(id, data) {
  const a = window.__host && window.__host.adapter;
  if (!a || typeof a.loadStateFile !== "function") throw new Error("core has no load-state support");
  const r = await a.loadStateFile(new Uint8Array(data));
  if (!r || r.loaded === false) throw new Error((r && r.error) || "state rejected by this core build");
  post({ cmd: "stateLoaded", id });
}

if (EMBED) {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !allowed(e.origin)) return;
    const d = e.data || {};
    if (d.aeml !== 1) return;
    parentOrigin = e.origin;
    const fail = (err) => post({ cmd: "error", id: d.id, message: String((err && err.message) || err) });
    switch (d.cmd) {
      case "hello": announce(); break;
      case "input": applyInput(d.state); break;
      case "pick": showPicker(); break;
      case "load": if (d.file instanceof Blob) adoptParentFile(d.file).catch(fail); else fail("no file"); break;
      case "saveState": saveState(d.id).catch(fail); break;
      case "loadState": loadState(d.id, d.data).catch(fail); break;
    }
  });

  /* Tell the parent we exist. The parent origin is learned from the
     referrer, then confirmed by the first message it sends back. */
  function announce() {
    if (window.__aemlNotIsolated || !window.crossOriginIsolated) {
      post({ cmd: "error", message: "not-isolated" }); return;
    }
    waitFor(() => window.__host).then(() => post({ cmd: "ready" }));
  }
  let ref = "";
  try { ref = new URL(document.referrer).origin; } catch (e) {}
  if (allowed(ref)) { parentOrigin = ref; announce(); }
}
