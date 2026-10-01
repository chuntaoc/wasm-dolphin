/* =====================================================================
 * AEML Wii bridge -- (c) AEML, NTUST
 * Connects the AEML Blogger shell (parent page) to wasm-dolphin's host.
 * Messages in : hello, pick, load, input, saveState, loadState, diag, diagExport
 * Messages out: ready, ack, picked, progress, loaded, state, stateLoaded,
 *               needGesture, gestureDone, diagStat, diagLog, error
 * SPDX-License-Identifier: GPL-2.0-or-later (combined with Dolphin)
 * ===================================================================== */
import { inputStateFromPressed } from "./src/input.js";

/* Pages allowed to control this core. Replace the blogspot pattern with
   your own blog address to stop other sites from embedding it.
   www.blogger.com is Blogger's post preview. Add your custom domain here
   if your blog uses one (e.g. /^https:\/\/games\.example\.com$/). */
const ALLOWED_PARENTS = [
  /^https:\/\/[a-z0-9-]+\.blogspot\.com$/,
  /^https:\/\/(www\.)?blogger\.com$/,
  /^https?:\/\/([a-z0-9-]+\.)*concrete\.tw(:\d+)?$/, /* concrete.tw and every subdomain */
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "aeml" && window.parent !== window;
const SIG = "AEML, NTUST";
const BRIDGE_VER = "1.6";
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

/* ---- shell controller -> core ----
 * Sent both ways: as a GameCube pad (GameCube titles) and, on cores built
 * with the AEML Wii Remote hook, as an emulated Wii Remote (+ Nunchuk). */
const MAP = { A: "A", B: "B", ONE: "X", TWO: "Y", PLUS: "START", MINUS: "Z",
  C: "L", Z: "R", SHAKE: "R", UP: "D_UP", DOWN: "D_DOWN", LEFT: "D_LEFT", RIGHT: "D_RIGHT" };
/* Bit layout shared with SetWiimoteState() in the core (WiimoteEmu.cpp). */
const WII_BITS = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, ONE: 64, TWO: 128,
  PLUS: 256, MINUS: 512, HOME: 1024, C: 2048, Z: 4096, SHAKE: 8192 };
function toByte(v) { v = Math.max(-1, Math.min(1, +v || 0)); return Math.round(0x80 + v * 0x7f) & 0xff; }
let lastInput = null, lastInputSig = "";
function applyInput(s) {
  if (s) lastInput = s;
  if (diagOn && s) {
    const pressed = Object.keys(s.buttons || {}).filter((k) => s.buttons[k]).join("+") || "-";
    const st = s.stick || {}, ir = s.ir || {};
    const sig = pressed + "|" + (st.x || 0).toFixed(2) + "," + (st.y || 0).toFixed(2) + "|" + (s.ext || "") + "|" + (s.grip || "");
    if (sig !== lastInputSig) {
      lastInputSig = sig;
      diag("input", "buttons=" + pressed + " stick=" + (st.x || 0).toFixed(2) + "," + (st.y || 0).toFixed(2) +
        " ir=" + (+ir.x || 0).toFixed(2) + "," + (+ir.y || 0).toFixed(2) + " ext=" + (s.ext || "none") + " grip=" + (s.grip || "?"));
      setTimeout(() => diagProbe("after input"), 60);
    }
  }
  const host = window.__host; if (!host || !s) return;
  const pressed = new Set();
  const b = s.buttons || {};
  for (const k in MAP) if (b[k] === true) pressed.add(MAP[k]);
  const st = inputStateFromPressed(pressed);
  if (s.stick && (s.stick.x || s.stick.y)) { st.stickX = toByte(s.stick.x); st.stickY = toByte(-s.stick.y); }
  host.setInputState(st);
  /* Wii Remote (core builds with SetWiimoteState; older cores ignore this). */
  const a = host.adapter;
  if (a && typeof a.setWiimoteState === "function") {
    let bits = 0;
    for (const k in WII_BITS) if (b[k] === true) bits |= WII_BITS[k];
    const ir = s.ir || {}, acc = s.accel || {};
    a.setWiimoteState({
      buttons: bits,
      extension: s.ext === "nunchuk" ? 1 : 0,
      stickX: (s.stick && s.stick.x) || 0,
      stickY: -((s.stick && s.stick.y) || 0),
      irX: ir.x === undefined ? 0 : ir.x * 2 - 1,
      irY: ir.y === undefined ? 0 : 1 - ir.y * 2,
      irVisible: 1,
      accelX: +acc.x || 0, accelY: +acc.y || 0, accelZ: acc.z === undefined ? 1 : +acc.z
    });
  }
}

/* ---- diagnostics (AEML, NTUST) ----
 * Always kept (cheap): boot phases, errors, load/state events.
 * Only while diagnostic mode is on: every controller change together with
 * what the emulated Wii Remote reports back (core self-test), plus a
 * once-per-second performance sample. Ring buffer, exported as text. */
const DIAG_MAX = 4000;
const diagLines = [];
const diagT0 = performance.now();
let diagOn = false, diagTimer = 0, diagProbeBusy = false, diagProbeAgain = false;
function diag(kind, text) {
  const t = ((performance.now() - diagT0) / 1000).toFixed(3).padStart(9);
  diagLines.push(t + "  " + kind.padEnd(6) + " " + text);
  if (diagLines.length > DIAG_MAX) diagLines.splice(0, diagLines.length - DIAG_MAX);
}
function diagStat() {
  const h = window.__host;
  if (!h) return null;
  return { mode: h.mode, running: !!h.running, coreFps: h.coreFps | 0, gameSpeed: h.gameSpeed | 0,
    presentFps: h.presentationFps | 0, game: (h.game && (h.game.gameId || h.game.name)) || "" };
}
async function diagProbe(label) {
  if (!diagOn) return;
  const a = window.__host && window.__host.adapter;
  if (!a || typeof a.wiimoteSelfTest !== "function") return;
  if (diagProbeBusy) { diagProbeAgain = true; return; }
  diagProbeBusy = true;
  try { diag("wii", label + " -> " + await a.wiimoteSelfTest()); }
  catch (e) { diag("wii", label + " -> probe failed: " + e); }
  diagProbeBusy = false;
  if (diagProbeAgain) { diagProbeAgain = false; diagProbe("(latest)"); }
}
function setDiag(on) {
  diagOn = !!on;
  clearInterval(diagTimer);
  diag("diag", diagOn ? "diagnostic mode ON" : "diagnostic mode OFF");
  if (!diagOn) return;
  const a = window.__host && window.__host.adapter;
  diag("diag", "core wiimote hook: " + (a && typeof a.setWiimoteState === "function" ? "yes" : "NO (old core)"));
  if (window.__host && window.__host.running && window.__host.mode === "dolphin") diagProbe("start");
  diagTimer = setInterval(() => {
    const st = diagStat();
    if (!st) return;
    diag("perf", "mode=" + st.mode + " running=" + st.running + " coreFps=" + st.coreFps +
      " speed=" + st.gameSpeed + "% presentFps=" + st.presentFps);
    post({ cmd: "diagStat", stat: st });
  }, 1000);
}
if (EMBED) {
  const origErr = console.error, origWarn = console.warn;
  console.error = function () { try { diag("ERROR", Array.from(arguments).map(String).join(" ").slice(0, 400)); } catch (e) {} return origErr.apply(this, arguments); };
  console.warn = function () { try { diag("warn", Array.from(arguments).map(String).join(" ").slice(0, 300)); } catch (e) {} return origWarn.apply(this, arguments); };
  window.addEventListener("error", (e) => diag("ERROR", "uncaught: " + (e.message || e)));
  window.addEventListener("unhandledrejection", (e) => diag("ERROR", "unhandled promise: " + ((e.reason && e.reason.message) || e.reason)));
  diag("env", "bridge " + BRIDGE_VER + " | isolated=" + window.crossOriginIsolated + " | " + navigator.userAgent);
  diag("env", "core settings " + (location.search || "(defaults)"));
  diag("env", "cpu threads=" + (navigator.hardwareConcurrency || "?") + " memory=" + (navigator.deviceMemory || "?") + "GB webgpu=" + !!navigator.gpu);
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
        diag("boot", t.slice(13, 200));
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
  diag("game", "load start: " + file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)" + (copied ? " [copied from page]" : " [picked in frame]"));
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
  diag("game", "loaded id=" + (host.game.gameId || "?") + " platform=" + (host.game.platform || "?") +
    " title=" + (host.game.name || file.name) + " size=" + file.size);
  /* give the new game the current controller state (Nunchuk, pointer, tilt) */
  applyInput(lastInput || { buttons: {}, stick: { x: 0, y: 0 }, ir: { x: 0.5, y: 0.5 }, accel: { x: 0, y: 0, z: 1 }, ext: "none" });
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
    if (e.source !== window.parent) return;
    const d = e.data || {};
    if (d.aeml !== 1) return;
    if (!allowed(e.origin)) {
      /* Say why we are ignoring this page, so the shell can show it. */
      if (d.cmd === "hello") window.parent.postMessage({ aeml: 1, cmd: "error", message: "origin-not-allowed", origin: e.origin }, e.origin);
      return;
    }
    parentOrigin = e.origin;
    const fail = (err) => { diag("ERROR", (d.cmd || "?") + ": " + String((err && err.message) || err)); post({ cmd: "error", id: d.id, message: String((err && err.message) || err) }); };
    switch (d.cmd) {
      case "hello": announce(); break;
      case "input": applyInput(d.state); break;
      case "pick": showPicker(); break;
      case "load":
        post({ cmd: "ack", size: d.file && d.file.size });
        if (d.file instanceof Blob) adoptParentFile(d.file).catch(fail); else fail("no file");
        break;
      case "diag": setDiag(d.on); break;
      case "diagExport":
        diag("diag", "export requested; stat=" + JSON.stringify(diagStat()));
        post({ cmd: "diagLog", id: d.id, text: diagLines.join("\n") });
        break;
      case "saveState": diag("state", "save requested"); saveState(d.id).catch(fail); break;
      case "loadState": diag("state", "load requested"); loadState(d.id, d.data).catch(fail); break;
    }
  });

  /* Tell the parent we exist. The parent origin is learned from the
     referrer, then confirmed by the first message it sends back. */
  function announce() {
    if (window.__aemlNotIsolated || !window.crossOriginIsolated) {
      post({ cmd: "error", message: "not-isolated" }); return;
    }
    waitFor(() => window.__host).then(() => post({ cmd: "ready", ver: BRIDGE_VER }));
  }
  let ref = "";
  try { ref = new URL(document.referrer).origin; } catch (e) {}
  if (allowed(ref)) { parentOrigin = ref; announce(); }
}
