/* ==========================================================================
   NO LIMIT — Gym Tracker  (offline, on-device PWA)
   ========================================================================== */
import { signOut, cachedUser } from "./auth/auth.js";
import { pushWorkout, pushBodyweight, pushMacros, deleteAllHistory } from "./data/cloudStore.js";
import { getActiveProgramme, exMeta as resolveExercise } from "./data/programme.js";
import { esc } from "./ui/safeRender.js";
import * as H from "./core/history.js";
import { weekdayPos, isSessionReferenced, weeklyGoal, comboParts, comboKey } from "./core/programme.js";
import { getActiveTargets, saveTargets, setActiveTargets } from "./data/targets.js";
import { saveProgramme, defaultProgrammeData } from "./data/programmeStore.js";
import { getMySquad, getMembers, createSquad, joinSquad, leaveSquad } from "./data/squad.js";
import { getProfile, updateProfileBasics } from "./auth/profile.js";
import { uploadAvatar } from "./data/storage.js";
import { uploadPhoto, listMyPhotos, listSquadPhotos, setPhotoVisibility, deletePhoto, purgeExpiredPhotos, daysLeft, PHOTO_DAYS } from "./data/photos.js";
import { libExercise, EXERCISE_LIBRARY, MUSCLE_GROUPS } from "./data/exerciseLibrary.js";
import { getCustomExercises, addCustomExercise } from "./data/customExercises.js";
import { getCurrentSquad, setCurrentSquad, postActivity, getFeed, getWorkoutPosts, toggleReaction, REACTIONS,
  getChallenges, createChallenge, deleteChallenge } from "./data/social.js";
import { getPrivacy, setPrivacy, applyCloudPrivacy } from "./data/privacy.js";
import { getMyCommitment, setCommitment, getSquadCommitmentsAll, weekStartISO, prevWeekISO } from "./data/commitments.js";
import { getMusic, setMusic, safeMusicUrl } from "./data/music.js";
import { spotifyConfigured, connectSpotify, isSpotifyConnected, disconnectSpotify, getSpotifyPlaylists, getNowPlaying, canControlPlayback, playPlaylist, spotifyPlaylistUri } from "./data/spotify.js";

let _booted = false;
export function initTracker() {
  if (_booted) return;
  _booted = true;
  const KEY = "gymtracker.v1:" + (cachedUser()?.id || "local");  // per-user local cache
  const P = getActiveProgramme();                                 // this user's programme
  const SESSION_IDS = Object.keys(P.sessions);
  const isCardio = id => !!exMeta(id).cardio;

  /* ---------- storage ---------- */
  const blank = () => ({ logs: [], body: [], macros: [], names: {}, settings: {} });
  function load() {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return blank(); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }
  let DB = load();

  /* ---------- date helpers (local, tz-safe) ---------- */
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  const todayStr = () => ymd(new Date());
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function dayDiff(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function prettyDate(s) {
    return parseYmd(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }
  function shortDate(s) {
    return parseYmd(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  /* ---------- schedule ---------- */
  // the Monday on or before a given date (weeks start Monday)
  function mondayOnOrBefore(d) {
    const x = new Date(d);
    const g = x.getDay();               // 0 Sun … 6 Sat
    x.setDate(x.getDate() + (g === 0 ? -6 : 1 - g));
    return ymd(x);
  }
  // The 7-day cycle is authored Mon→Sun, so a day's slot is simply its weekday
  // (core/programme.js). The programme is sanitised on load, so every training
  // slot points at a session that exists; sess() still guards every lookup.
  const posForDate = weekdayPos;
  function cycleFor(s) { return P.cycle[posForDate(s)] || { type: "rest" }; }
  const sess = (id) => P.sessions[id] || null;
  const oneName = (k) => MUSCLE_GROUPS.find(g => g.toLowerCase() === k) || sess(k)?.full || sess(k)?.name || (DB.names && DB.names["@" + k]) || k;
  const sessName = (id) => (id === "quick" ? "Quick session"
    : (!comboParts(id).every(k => sess(k)) && DB.names && DB.names["@" + id]) || comboParts(id).map(oneName).join(" + "));
  // the programme as stored (sessions + optional schedule + weekly goal)
  const progData = (over = {}) => ({ sessions: P.sessions, cycle: P.cycle, ...(P.goal ? { goal: P.goal } : {}), ...over });
  const hasSchedule = () => P.cycle.some(c => c.type === "train");
  const goalNow = () => weeklyGoal(P, Array.isArray(PROFILE?.training_days) ? PROFILE.training_days.length : undefined);
  // first upcoming calendar date (incl. today) whose cycle position == p
  function nextDateForPos(p) {
    const t = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(t); d.setDate(t.getDate() + i);
      if (posForDate(ymd(d)) === p) return d;
    }
    return t;
  }

  /* ---------- log lookups ---------- */
  function getLog(date, session) {
    return DB.logs.find(l => l.date === date && l.session === session);
  }
  // every write marks the record unsynced until the cloud confirms it (core/sync.js)
  function upsertLog(date, session, entries) {
    let l = getLog(date, session);
    if (!l) { l = { date, session, entries: {}, ts: Date.now() }; DB.logs.push(l); }
    l.entries = entries; l.ts = Date.now();
    markDirty(l);
    return l;
  }

  /* ---------- cloud sync ----------
     A record is `synced:false` from the moment it's edited until the cloud
     confirms THAT revision (rev guards against an edit landing mid-push). Failed
     pushes stay queued and retry on reconnect / next launch — nothing is dropped,
     and the user is told honestly whether it reached the cloud (AUDIT C1/C2). */
  function markDirty(rec) { rec.rev = (rec.rev || 0) + 1; rec.synced = false; save(); }
  async function pushRecord(kind, rec) {
    const u = cachedUser(); if (!u) return false;
    const rev = rec.rev;
    try {
      if (kind === "log") await pushWorkout(u.id, rec);
      else if (kind === "body") await pushBodyweight(u.id, rec);
      else await pushMacros(u.id, rec);
      if (rec.rev === rev) { rec.synced = true; save(); }
      return true;
    } catch (e) {
      console.warn("[NO LIMIT] kept on device, will retry sync:", kind, rec.date, e?.message || e);
      return false;
    }
  }
  let SYNCING = false;
  async function syncPending() {
    if (SYNCING || !cachedUser()) return;
    SYNCING = true;
    try {
      for (const [kind, list] of [["log", DB.logs], ["body", DB.body], ["macro", DB.macros]]) {
        for (const rec of list.filter(r => r.synced === false)) {
          if (!(await pushRecord(kind, rec))) return;          // offline — stop, retry later
        }
      }
    } finally { SYNCING = false; }
  }
  async function saveAndSync(kind, rec, okMsg) {
    markDirty(rec);
    const ok = await pushRecord(kind, rec);
    toast(ok ? okMsg : "Saved on this device — it'll sync when you're back online");
  }
  window.addEventListener("online", () => syncPending());
  // photos live 4 weeks: quietly delete this user's expired files a few seconds after launch
  setTimeout(() => purgeExpiredPhotos(cachedUser()?.id), 5000);
  // history queries — pure + unit-tested, keyed by stable exercise key (core/history.js)
  const lastSetsFor = (exId, beforeDate) => H.lastSetsFor(DB.logs, exId, beforeDate);
  const allSetsFor = (exId) => H.allSetsFor(DB.logs, exId);
  const prFor = (exId, beforeDate) => H.prFor(DB.logs, exId, beforeDate);
  const isBodyweight = (exId) => H.isBodyweightHistory(DB.logs, exId);
  const fmtSet = (s) => (Number(s.w) > 0 ? `${s.w}kg × ${s.r}` : `${s.r} reps`);
  // single exercise resolver (programme → library → custom); falls back to the
  // cloud name snapshot so deleted/renamed exercises still show their name
  function exMeta(exId) {
    return resolveExercise(exId) || { name: (DB.names && DB.names[exId]) || exId, reps: "" };
  }

  /* ---------- tiny DOM helpers ---------- */
  const view = () => document.getElementById("view");
  // avatar: profile photo if set, else the name's initial, in a circle of class `cls`
  function avatarMarkup(name, url, cls) {
    const init = (String(name || "?").trim()[0] || "?").toUpperCase();
    return url
      ? `<span class="${cls} hasimg"><img src="${esc(url)}" alt="" loading="lazy"></span>`
      : `<span class="${cls}">${esc(init)}</span>`;
  }
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1900);
  }

  /* ---------- navigation ---------- */
  let TAB = "today", ACTIVE = null;
  function go(tab, opts) {
    if (typeof clearNP === "function") clearNP();   // stop any now-playing ticker
    if (typeof flushAutosave === "function") flushAutosave();   // never lose typed sets on navigation
    TAB = tab; ACTIVE = (opts && opts.session) || ACTIVE;
    document.querySelectorAll(".tabbar button").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    ({ today: renderToday, train: renderTrain, progress: renderProgress, log: renderLog, plan: renderPlan, squad: renderSquad, profile: renderProfile, settings: renderSettings }[tab])();
    const v = view(); v.classList.remove("viewin"); void v.offsetWidth; v.classList.add("viewin"); // restart fade-in
    window.scrollTo(0, 0);
  }

  /* ---------- header ---------- */
  function renderHeader() {
    document.getElementById("hdate").innerHTML =
      "<b>" + prettyDate(todayStr()).split(",")[0] + "</b>" +
      parseYmd(todayStr()).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const av = document.getElementById("hdr-av");
    if (av) {
      if (PROFILE?.avatar_url) { av.classList.add("hasimg"); av.innerHTML = `<img src="${esc(PROFILE.avatar_url)}" alt="">`; }
      else { av.classList.remove("hasimg"); av.textContent = (PROFILE?.name || PROFILE?.username || cachedUser()?.email || "?").trim()[0].toUpperCase(); }
    }
  }
  let PROFILE = null;  // cached profile (name/username/goal) for header + profile screen

  /* ============================ TODAY ============================ */
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function greetWord() {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }
  /* ---- Home (direction A + glass): one loud element — the weekly ring ---- */
  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 5.5v13l10-6.5z"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  };
  function homeMusicCard() {
    const mus = getMusic();
    const url = mus.url ? (safeMusicUrl(mus.url) || "#") : null;
    const inner = `<span class="hm2-art">${ICON.note}</span>
      <span class="hm2-meta"><small>${url ? "Soundtrack" : "Music"}</small><b>${esc(url ? (mus.label || "Training playlist") : "Set your training soundtrack")}</b></span>
      <span class="hm2-go">${url ? ICON.play : ICON.chev}</span>`;
    return url
      ? `<a class="h2-music glass" id="home-music" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<button class="h2-music glass" data-act="goplan">${inner}</button>`;
  }
  function spark(values) {
    if (values.length < 2) return "";
    const W = 96, Hh = 32, mn = Math.min(...values), mx = Math.max(...values), rng = (mx - mn) || 1;
    const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (W - 6), Hh - 4 - ((v - mn) / rng) * (Hh - 8)]);
    const [lx, ly] = pts[pts.length - 1];
    return `<svg class="h2-spark" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" aria-hidden="true">
      <polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="#F2F3EF"/></svg>`;
  }
  function homeProgress() {
    // the lift you train most — its trend is the clearest picture of progress
    const ids = [...new Set(DB.logs.flatMap(l => Object.keys(l.entries)))].filter(id => !isCardio(id));
    if (!ids.length) {
      return `<button class="h2-prog glass" data-act="goprogress"><span class="h2-prog-l"><b>Your progress</b>
        <small>Log a workout and your strength trend starts here.</small></span><span class="hm2-go">${ICON.chev}</span></button>`;
    }
    // show the lift that's moved most (relative gain over its last 8 sessions); else the most-trained one
    const cand = ids.map(id => {
      const series = allSetsFor(id).slice(-8), bw = isBodyweight(id);
      const vals = series.map(h => bw ? Number(h.top.r) : Number(h.top.w));
      const d = vals.length > 1 ? +(vals[vals.length - 1] - vals[0]).toFixed(1) : null;
      return { id, series, bw, vals, d, gain: d > 0 && vals[0] > 0 ? d / vals[0] : 0, n: allSetsFor(id).length };
    }).sort((a, b) => (b.gain - a.gain) || (b.n - a.n));
    const { id: best, series, bw, vals, d } = cand[0];
    const label = d > 0 ? "Biggest gain" : "Strength trend";
    const deltaTxt = d == null ? "First session logged" : d > 0 ? `+${d} ${bw ? "reps" : "kg"}` : d < 0 ? `${d} ${bw ? "reps" : "kg"}` : "Holding steady";
    return `<button class="h2-prog glass" data-act="exhist" data-ex="${best}">
      <span class="h2-prog-l"><small>${label}</small><b>${esc(exMeta(best).name)}</b>
        <span class="h2-prog-v">${esc(fmtSet(series[series.length - 1].top))} <em>${esc(deltaTxt)}</em></span></span>
      ${spark(vals) || `<span class="hm2-go">${ICON.chev}</span>`}</button>`;
  }
  function fmtMs(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  let NP_TIMER = null;
  function clearNP() { if (NP_TIMER) { clearInterval(NP_TIMER); NP_TIMER = null; } }
  function enhanceNowPlaying() {
    getNowPlaying().then(np => {
      const host = document.getElementById("home-music");
      if (!np || !np.name || !host) return;
      const card = document.createElement(np.url ? "a" : "div");
      card.id = "home-music"; card.className = "np-card glass";
      if (np.url) { card.href = np.url; card.target = "_blank"; card.rel = "noopener noreferrer"; }
      card.innerHTML = `${np.art ? `<img class="np-art" src="${esc(np.art)}" alt="">` : `<span class="np-art ph">${ICON.note}</span>`}
        <div class="np-body">
          <div class="np-label">${np.playing ? "Now playing · Spotify" : "Last played · Spotify"}</div>
          <div class="np-track">${esc(np.name)}</div>
          <div class="np-artist">${esc(np.artist || "")}</div>
          <div class="np-bar"><i></i></div>
          <div class="np-time"><span class="np-cur">0:00</span><span class="np-dur">${fmtMs(np.duration_ms)}</span></div>
        </div>
        <span class="np-cta">${ICON.chev}</span>`;
      host.replaceWith(card);

      const bar = card.querySelector(".np-bar i");
      const cur = card.querySelector(".np-cur");
      const dur = np.duration_ms || 1;
      let pos = np.progress_ms || 0;
      const paint = () => {
        bar.style.width = Math.min(100, (pos / dur) * 100) + "%";
        cur.textContent = fmtMs(pos);
      };
      paint();
      clearNP();
      if (np.playing) NP_TIMER = setInterval(() => { pos += 1000; if (pos > dur) pos = dur; paint(); if (pos >= dur) clearNP(); }, 1000);
    }).catch(() => {});
  }
  function renderToday() {
    const today = todayStr();
    const c = cycleFor(today);
    const name = (PROFILE?.name || (cachedUser()?.email || "Athlete").split("@")[0] || "Athlete").split(" ")[0];
    const dateTxt = parseYmd(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    let html = "";

    if (!isStandalone() && !DB.settings.hideInstall) {
      html += `<div class="install-hint"><span class="x" data-act="hideinstall">✕</span>
        <b>Install me:</b> tap Share in Safari, then <b>Add to Home Screen</b> — it runs full-screen and works offline in the gym.</div>`;
    }

    html += `<div class="h2-greet"><small>${esc(dateTxt)}</small><h1>${greetWord()}, ${esc(name)}</h1></div>`;

    // hero — the week's progress ring is the ONE volt element on this screen
    const days = weekBounds();
    const goal = goalNow();
    const done = days.filter(d => DB.logs.some(l => l.date === d)).length;
    const pct = Math.min(1, done / goal);
    const R = 52, C = 2 * Math.PI * R;
    const streak = myWeekStreak();
    const prCount = [...new Set(DB.logs.flatMap(l => Object.keys(l.entries)))].filter(id => !isCardio(id) && prFor(id)).length;
    const toGo = Math.max(0, goal - done);
    html += `<div class="h2-hero glass">
      <svg class="h2-ring" viewBox="0 0 128 128" aria-label="${done} of ${goal} sessions this week">
        <circle cx="64" cy="64" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="11"/>
        <circle class="h2-arc" cx="64" cy="64" r="${R}" fill="none" stroke="var(--volt)" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" style="--c:${C.toFixed(1)}" transform="rotate(-90 64 64)"/>
        <text x="64" y="66" text-anchor="middle" class="h2-ring-n">${done}/${goal}</text>
        <text x="64" y="86" text-anchor="middle" class="h2-ring-l">this week</text>
      </svg>
      <div class="h2-stats">
        <div><b>${streak}</b><span>week streak</span></div>
        <div><b>${prCount}</b><span>personal records</span></div>
        <div><b>${toGo === 0 ? "Done" : toGo}</b><span>${toGo === 0 ? "goal hit this week" : `to hit your goal of ${goal}`}</span></div>
      </div></div>`;

    // today's workout — white (not volt) action: the ring keeps the spotlight
    const todays = DB.logs.filter(l => l.date === today);
    const open = todays.find(l => l.done === false);          // started, not finished
    if (open) {
      const n = Object.keys(open.entries).length;
      html += `<div class="h2-today glass"><small>Today · in progress</small><h2>${esc(sessName(open.session))}</h2>
        <p>${n} exercise${n === 1 ? "" : "s"} so far — everything's saved.</p>
        <button class="h2-cta" data-act="pick" data-s="${esc(open.session)}">Continue workout ${ICON.arrow}</button></div>`;
    } else if (todays.length) {
      const n = new Set(todays.flatMap(l => Object.keys(l.entries))).size;
      const sets = todays.reduce((t, l) => t + Object.values(l.entries).reduce((a, x) => a + x.length, 0), 0);
      html += `<div class="h2-today glass done"><small>Today · done</small><h2>${esc(todays.map(l => sessName(l.session)).join(" + "))}</h2>
        <p>${n} exercise${n === 1 ? "" : "s"} · ${sets} sets. Good work — recover well.</p>
        <button class="h2-cta ghost" data-act="gotrain">Train something else</button></div>`;
    } else if (c.type === "train" && sess(c.session)) {
      const s = sess(c.session);
      const n = s.exercises.length;
      html += `<div class="h2-today glass"><small>Today · your schedule</small><h2>${esc(s.name)}</h2>
        <p>${n} exercise${n === 1 ? "" : "s"}${s.sub ? " · " + esc(s.sub) : ""}</p>
        <button class="h2-cta" data-act="start" data-s="${esc(c.session)}">Start workout ${ICON.arrow}</button>
        <button class="h2-cta ghost" data-act="gotrain" style="margin-top:10px">Train something else</button></div>`;
    } else {
      html += `<div class="h2-today glass"><small>Today</small><h2>What are you training?</h2>
        <p>${done >= goal ? "Goal's hit — anything extra is a bonus. Or rest and recover." : "Pick your muscle groups and today's exercises."}</p>
        <button class="h2-cta" data-act="gotrain">Choose workout ${ICON.arrow}</button></div>`;
    }

    html += homeProgress();
    html += homeMusicCard();

    // the week at a glance — what you actually trained, plus anything scheduled
    html += `<div class="h2-weekhd"><span>Your week</span><button data-act="weekedit">Schedule</button></div><div class="h2-week glass">`;
    days.forEach(d => {
      const ce = cycleFor(d);
      const logs = DB.logs.filter(l => l.date === d);
      const first = (k) => (oneName(comboParts(k)[0]) || "").split(" ")[0];
      const nm = logs.length ? first(logs[0].session) + (logs.length > 1 || comboParts(logs[0].session).length > 1 ? "+" : "")
        : ce.type === "train" && sess(ce.session) ? (sess(ce.session).name || "").split(" ")[0] : "";
      const cls = [d === today ? "today" : "", logs.length ? "done" : "", !logs.length && ce.type !== "train" ? "rest" : ""].join(" ");
      html += `<div class="h2-day ${cls}"><span>${parseYmd(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span><i></i><b>${esc(nm) || "&nbsp;"}</b></div>`;
    });
    html += `</div>`;

    view().innerHTML = html;
    if (isSpotifyConnected()) enhanceNowPlaying();   // swap in live Spotify track
  }

  /* ============================ TRAIN ============================ */
  function renderTrain() {
    const today = todayStr();
    if (!ACTIVE) return renderPicker();
    const s = daySession(ACTIVE);
    const existing = getLog(today, ACTIVE);
    const finished = existing && existing.done !== false;
    let html = `<div class="tr-top"><div class="section-label">${finished ? "Finished" : "Training"} · ${esc(shortDate(today))}</div>
        <button class="tr-switch" data-act="picker">Switch</button></div>
      <h1 class="h-title">${esc(sessName(ACTIVE))}</h1>
      ${finished ? `<p class="h-sub">Workout finished — any change you make still saves.</p>` : ""}
      <div class="tp glass" id="tprog"><div class="tp-row"><span><b id="tp-n">0</b> of <span id="tp-of">${s.exercises.length}</span> exercises</span>
        <span id="tp-s">0 sets logged</span></div><div class="tp-bar"><i id="tp-bar"></i></div>
        <div class="tp-save" id="tp-save">${existing ? "Saved" : "Saves as you type"}</div></div>`;
    html += `<div id="tr-list">${s.exercises.map(ex => exCardHtml(ex, existing, today)).join("")}</div>`;
    html += `<div class="ax glass" id="ax">
        <div class="ax-in"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
          <input id="ax-q" placeholder="${s.exercises.length ? "Add another exercise…" : "Search the exercise you're doing…"}" autocapitalize="none" autocomplete="off" enterkeyhint="search"></div>
        <div class="ax-res" id="ax-res"></div></div>`;
    html += `<div style="height:70px"></div>
      <div class="savebar">
        <button class="btn" data-act="finish">${finished ? "Done — back to Home" : "Finish workout"}</button>
      </div>`;
    view().innerHTML = html;
    paintTrainProgress();
    if (!s.exercises.length) axShow("");
  }

  function exCardHtml(ex, existing, today) {
    if (ex.cardio) return cardioCardHtml(ex, existing);
    const last = lastSetsFor(ex.id, today);
    // Values only when continuing a workout already saved today;
    // otherwise last session's numbers appear as ghost placeholders to beat.
    const saved = existing ? existing.entries[ex.id] : null;
    const ghost = !existing && last ? last.sets : null;
    const nRows = Math.max(ex.sets || 3, saved ? saved.length : 0, ghost ? ghost.length : 0);
    let rows = "";
    for (let i = 0; i < nRows; i++) {
      rows += setRowHtml(ex.id, i, saved && saved[i] ? saved[i] : null, ghost && ghost[i] ? ghost[i] : null);
    }
    const lastTxt = last
      ? `Last time · ${esc(shortDate(last.date))} <b>${last.sets.map(x => `${x.w}×${x.r}`).join("  ")}</b>`
      : `No history yet — set your baseline.`;
    return `<div class="ex" data-ex="${esc(ex.id)}">
      <div class="ex-h">
        <div class="info"><b class="ex-link" data-act="exhist" data-ex="${esc(ex.id)}">${esc(ex.name)}${ex.isNew ? '<span class="tag-new">NEW</span>' : ""}</b>
          <div class="meta">${esc(ex.target || "")}</div></div>
        <div class="tgt">${esc(ex.reps || "")} reps<small>${esc(ex.sets || 3)} sets</small></div>
        <button class="ex-rm" data-act="exrm" data-ex="${esc(ex.id)}" aria-label="Remove from today">${XMARK}</button>
      </div>
      <div class="last">${lastTxt}</div>
      <div class="sets">
        <div class="set-head"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span></span></div>
        <div class="rows">${rows}</div>
      </div>
      <div class="addset" data-act="addset" data-ex="${esc(ex.id)}">+ Add set</div>
    </div>`;
  }
  const XMARK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* Live workout progress: a set counts once its reps (cardio: minutes or rounds)
     are entered. Logged sets dim and swap their number for a tick. */
  const TICK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function paintTrainProgress() {
    const bar = document.getElementById("tp-bar");
    if (!bar) return;
    const hdr = document.querySelector(".app-header");
    if (hdr) document.documentElement.style.setProperty("--hdrh", hdr.offsetHeight + "px");
    let rowsTotal = 0, rowsDone = 0, exTouched = 0;
    document.querySelectorAll("#view .ex").forEach(card => {
      const cardio = card.classList.contains("cardio");
      const rows = [...card.querySelectorAll(".set-row")];
      let done = 0;
      rows.forEach((row, i) => {
        const w = row.querySelector(".w"), r = row.querySelector(".r");
        const filled = cardio ? !!(w.value || r.value) : !!r.value;
        row.classList.toggle("filled", filled);
        const sn = row.querySelector(".sn");
        if (sn) sn.innerHTML = filled ? TICK : (cardio ? "·" : String(i + 1));
        if (filled) done++;
      });
      rowsTotal += rows.length; rowsDone += done;
      if (done) exTouched++;
      card.classList.toggle("complete", rows.length > 0 && done === rows.length);
    });
    document.getElementById("tp-n").textContent = exTouched;
    document.getElementById("tp-s").textContent = `${rowsDone} set${rowsDone === 1 ? "" : "s"} logged`;
    bar.style.width = (rowsTotal ? Math.round(rowsDone / rowsTotal * 100) : 0) + "%";
  }
  document.addEventListener("input", (e) => {
    if (e.target.closest && e.target.closest("#view .set-row")) { paintTrainProgress(); scheduleAutosave(); }
    if (e.target.id === "ax-q") axShow(e.target.value);
  });
  document.addEventListener("focusin", (e) => { if (e.target.id === "ax-q") axShow(e.target.value); });
  document.addEventListener("focusout", (e) => {
    if (e.target.id === "ax-q") setTimeout(() => { if (document.activeElement?.id !== "ax-q") document.getElementById("ax-res")?.classList.remove("open"); }, 220);
  });

  function setRowHtml(exId, i, pv, ghost) {
    const phW = ghost ? ghost.w : "–", phR = ghost ? ghost.r : "–";
    return `<div class="set-row">
      <span class="sn">${i + 1}</span>
      <input class="w" type="number" inputmode="decimal" step="0.5" placeholder="${phW}" value="${pv ? pv.w : ""}">
      <input class="r" type="number" inputmode="numeric" placeholder="${phR}" value="${pv ? pv.r : ""}">
      <span class="del" data-act="delset">✕</span></div>`;
  }

  // Cardio (HIIT) card — logs minutes + rounds instead of weight × reps.
  function cardioCardHtml(ex, existing) {
    const pv = existing && existing.entries[ex.id] && existing.entries[ex.id][0]
      ? existing.entries[ex.id][0] : null;
    const meta = ex.id === "hiit" ? P.cardio.protocol : (ex.target || "Cardio");
    return `<div class="ex cardio" data-ex="${ex.id}">
      <div class="ex-h">
        <div class="info"><b class="ex-link" data-act="exhist" data-ex="${ex.id}">${esc(ex.name)}</b><div class="meta">${esc(meta)}</div></div>
        <div class="tgt">${esc(ex.reps)}<small>cardio</small></div>
        <button class="ex-rm" data-act="exrm" data-ex="${esc(ex.id)}" aria-label="Remove from today">${XMARK}</button>
      </div>
      <div class="sets">
        <div class="set-head"><span></span><span>Minutes</span><span>Rounds</span><span></span></div>
        <div class="rows"><div class="set-row">
          <span class="sn">·</span>
          <input class="w" type="number" inputmode="numeric" placeholder="min" value="${pv ? pv.w : ""}">
          <input class="r" type="number" inputmode="numeric" placeholder="rds" value="${pv ? pv.r : ""}">
          <span class="del" style="visibility:hidden">✕</span></div></div>
      </div></div>`;
  }

  // Shared exercise picker (library + your custom exercises + create-on-the-fly).
  // Resolves a chosen/created exercise and hands it to onPick.
  function openExercisePicker(onPick) {
    const resolve = (key) => {
      const c = getCustomExercises().find(e => e.key === key);
      if (c) return { id: c.key, name: c.name, target: c.group, sets: c.sets, reps: c.reps, custom: true, ...(c.cardio ? { cardio: true } : {}) };
      const e = libExercise(key);
      return e ? { id: e.key, name: e.name, target: e.group, sets: e.sets, reps: e.reps, ...(e.cardio ? { cardio: true } : {}) } : null;
    };
    const listHtml = (q) => MUSCLE_GROUPS.map(g => {
      const items = [...getCustomExercises().filter(e => e.group === g), ...EXERCISE_LIBRARY.filter(e => e.group === g)]
        .filter(e => !q || e.name.toLowerCase().includes(q) || g.toLowerCase().includes(q));
      if (!items.length) return "";
      return `<div class="ed-pg">${g}</div>` + items.map(e =>
        `<button class="ed-pi" data-k="${e.key}"><span>${esc(e.name)}${e.custom ? ' <span class="tag-yours">YOURS</span>' : ""}${e.cardio ? ' <span class="tag-yours">CARDIO</span>' : ""}</span>
          <small>${esc(e.equipment)} · ${esc(e.sets)}×${esc(e.reps)}</small></button>`).join("");
    }).join("");
    const ov = document.createElement("div"); ov.className = "ed-picker";
    ov.innerHTML = `<div class="ed-pbox"><div class="ed-ptop"><b>Add exercise</b><button class="ed-pclose">✕</button></div>
      <input class="ed-search" placeholder="Search your library…" autocapitalize="none">
      <div class="ed-create"><input class="ed-cin" placeholder="…or create your own" autocapitalize="words">
        <select class="ed-cgrp">${MUSCLE_GROUPS.map(g => `<option value="${g}">${g}</option>`).join("")}</select>
        <button class="ed-cadd">Add</button></div>
      <div class="ed-plist">${listHtml("")}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector(".ed-pclose").onclick = close;
    const list = ov.querySelector(".ed-plist"), search = ov.querySelector(".ed-search");
    const bind = () => list.querySelectorAll(".ed-pi").forEach(it => it.onclick = () => { const ex = resolve(it.dataset.k); if (ex) onPick(ex); close(); });
    bind();
    search.oninput = () => { list.innerHTML = listHtml(search.value.toLowerCase()); bind(); };
    const cin = ov.querySelector(".ed-cin"), grp = ov.querySelector(".ed-cgrp");
    const add = async () => {
      const name = cin.value.trim(); if (!name) return;
      try { const ex = await addCustomExercise(cachedUser()?.id, { name, group: grp.value }); onPick({ id: ex.key, name: ex.name, target: ex.group, sets: ex.sets, reps: ex.reps, custom: true, ...(ex.cardio ? { cardio: true } : {}) }); } catch {}
      close();
    };
    ov.querySelector(".ed-cadd").onclick = add;
    cin.onkeydown = e => { if (e.key === "Enter") add(); };
  }

  /* ---------- today's workout: pick on the day ----------
     Nobody's week is fixed. Train asks what you're training today (one muscle
     group or several — "Chest + Triceps"), then starts EMPTY: you search and add
     only the exercises you're actually doing. Every number auto-saves; "Finish
     workout" marks the day done. A log is stored under the group key ("chest",
     "chest+triceps", "quick"), so the day records what you trained, while
     history/PRs/"last time" stay keyed by exercise and work across any mix. */
  const DAYSESS = {};            // key → today's working session (exercises added so far)
  let PICKSEL = [];              // muscle groups ticked on the "what are you training?" screen
  const groupKey = (g) => g.toLowerCase();
  const groupsOf = (key) => comboParts(key).map(k => MUSCLE_GROUPS.find(g => groupKey(g) === k)
    || MUSCLE_GROUPS.find(g => groupKey(g) === String(sess(k)?.name || "").toLowerCase())).filter(Boolean);
  const toEx = (key) => {
    const c = getCustomExercises().find(e => e.key === key);
    if (c) return { id: c.key, name: c.name, target: c.group, sets: c.sets, reps: c.reps, custom: true, ...(c.cardio || c.group === "Cardio" ? { cardio: true } : {}) };
    const e = libExercise(key);
    return e ? { id: e.key, name: e.name, target: e.group, sets: e.sets, reps: e.reps, ...(e.cardio ? { cardio: true } : {}) } : null;
  };
  // today's session = only what's been logged for it so far (nothing pre-ticked)
  function buildSession(key) {
    const s = { exercises: [] };
    const log = getLog(todayStr(), key);
    if (log) Object.keys(log.entries).forEach(id => {
      const m = toEx(id) || exMeta(id) || { name: (DB.names && DB.names[id]) || id };
      s.exercises.push({ id, name: m.name, target: m.target || "", sets: m.sets || 3, reps: m.reps || "", ...(m.cardio ? { cardio: true } : {}) });
    });
    return s;
  }
  // exercises added but not logged yet survive closing the app (per user, today only)
  const DKEY = "gymtracker.day:" + (cachedUser()?.id || "local");
  function readDay() { try { const d = JSON.parse(localStorage.getItem(DKEY) || "null"); return d && d.date === todayStr() ? d : { date: todayStr(), lists: {} }; } catch { return { date: todayStr(), lists: {} }; } }
  function persistDay() {
    const d = { date: todayStr(), lists: {} };
    Object.entries(DAYSESS).forEach(([k, v]) => { d.lists[k] = v.exercises; });
    try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch {}
  }
  function daySession(key) {
    if (DAYSESS[key]) return DAYSESS[key];
    const s = buildSession(key);
    (readDay().lists[key] || []).forEach(ex => { if (ex && ex.id && !s.exercises.some(x => x.id === ex.id)) s.exercises.push(ex); });
    return (DAYSESS[key] = s);
  }
  function startQuick() { ACTIVE = "quick"; go("train"); }
  function saveProgrammeQuiet() {
    const u = cachedUser(); if (!u) return;
    saveProgramme(u.id, progData()).then(r => { if (!r.synced) toast("Saved on this device — it'll sync when you're back online"); });
  }

  /* Auto-play: starting a workout starts the training playlist on Spotify. Opt-out
     per device; never on "Continue". Results are reported honestly. */
  const AP_KEY = "nl.autoplay:" + (cachedUser()?.id || "local");
  const autoplayOn = () => { try { return localStorage.getItem(AP_KEY) !== "off"; } catch { return true; } };
  async function maybeAutoplay() {
    const url = getMusic().url;
    if (!isSpotifyConnected() || !autoplayOn() || !spotifyPlaylistUri(url)) return;
    const label = getMusic().label || "your soundtrack";
    const r = await playPlaylist(url);
    if (r.result === "playing") toast(`Playing ${label}${r.device ? " on " + r.device : ""}`);
    else if (r.result === "no-device") toast("Open Spotify on your phone, then your soundtrack starts with your workout");
    else if (r.result === "premium") toast("Auto-play needs Spotify Premium");
    else if (r.result === "reconnect") toast("Reconnect Spotify in Settings to turn on auto-play");
  }

  function renderPicker() {
    const today = todayStr();
    const sched = cycleFor(today);
    const sg = sched.type === "train" ? groupsOf(sched.session) : [];
    if (!PICKSEL.length && sg.length) PICKSEL = sg.map(groupKey);
    const todays = DB.logs.filter(l => l.date === today);
    let html = `<div class="section-label">Train · ${esc(shortDate(today))}</div>
      <h1 class="h-title">What are you training?</h1>
      <p class="h-sub">Pick one or combine a few, then add the exercises you're doing as you go.</p>`;
    if (todays.length) {
      html += `<div class="card tr-today"><small>Today</small>` + todays.map(l => {
        const done = l.done !== false;
        return `<div class="tr-cont"><span><b>${esc(sessName(l.session))}</b><em>${done ? "Finished" : "In progress"} · ${Object.keys(l.entries).length} exercises</em></span>
          <button class="tr-switch" data-act="pick" data-s="${esc(l.session)}">${done ? "View" : "Continue"}</button></div>`;
      }).join("") + `</div>`;
    }
    if (sg.length) html += `<p class="tr-sug">Your schedule says <b>${esc(sg.join(" + "))}</b> today — or pick anything.</p>`;
    html += `<div class="tc-grid">` + MUSCLE_GROUPS.map(g => {
      const k = groupKey(g);
      const last = [...DB.logs].reverse().find(l => comboParts(l.session).includes(k));
      return `<button class="tc-chip glass${PICKSEL.includes(k) ? " on" : ""}" data-act="tchip" data-id="${k}">
        <b>${esc(g)}</b><small>${last ? "Last: " + esc(shortDate(last.date)) : "Not trained yet"}</small></button>`;
    }).join("") + `</div>`;
    html += `<button class="btn" id="tgo" data-act="tgo"${PICKSEL.length ? "" : " disabled"}>${pickLabel()}</button>
      <button class="linkbtn" data-act="quickstart" style="margin-top:10px">Just train<small>No muscle group — add any exercise as you go.</small></button>`;
    view().innerHTML = html;
  }
  const pickLabel = () => PICKSEL.length
    ? `Start · ${MUSCLE_GROUPS.filter(g => PICKSEL.includes(groupKey(g))).join(" + ")}`
    : "Pick what you're training";
  function startPicked() {
    const order = MUSCLE_GROUPS.map(groupKey).filter(k => PICKSEL.includes(k));
    if (!order.length) return false;
    ACTIVE = comboKey(order);
    PICKSEL = [];
    go("train");
    return true;
  }

  /* ---------- search-to-add (the whole library lives here) ---------- */
  function axPool() {
    return [...getCustomExercises().map(c => ({ key: c.key, name: c.name, group: c.group, equipment: "Yours", custom: true })),
            ...EXERCISE_LIBRARY];
  }
  function axResults(q) {
    const groups = groupsOf(ACTIVE);
    const have = new Set(daySession(ACTIVE).exercises.map(e => e.id));
    const recency = new Map();
    [...DB.logs].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(l => Object.keys(l.entries).forEach(id => { if (!recency.has(id)) recency.set(id, recency.size); }));
    const inGroup = (e) => !groups.length || groups.includes(e.group);
    let list = axPool().filter(e => !have.has(e.key));
    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(e => words.every(w => (e.name + " " + e.group + " " + (e.equipment || "")).toLowerCase().includes(w)));
      list.sort((a, b) => (inGroup(b) - inGroup(a)) || (b.name.toLowerCase().startsWith(words[0]) - a.name.toLowerCase().startsWith(words[0]))
        || ((recency.get(a.key) ?? 1e6) - (recency.get(b.key) ?? 1e6)));
    } else {
      list = list.filter(inGroup).sort((a, b) => (recency.get(a.key) ?? 1e6) - (recency.get(b.key) ?? 1e6));
    }
    return list.slice(0, q ? 20 : 14);
  }
  function axShow(q) {
    const box = document.getElementById("ax-res"); if (!box) return;
    const rows = axResults(q.trim());
    const groups = groupsOf(ACTIVE);
    const head = !q.trim() ? `<div class="ax-h">${groups.length ? esc(groups.join(" + ")) : "Exercises"} · your recent first</div>` : "";
    box.innerHTML = head + rows.map(e => {
      const last = lastSetsFor(e.key, todayStr());
      const lastTxt = last ? ` · last ${last.sets.map(x => `${x.w}×${x.r}`).slice(0, 2).join(", ")}` : "";
      return `<button class="ax-row" data-act="axadd" data-k="${esc(e.key)}"><span><b>${esc(e.name)}</b>
        <small>${esc(e.group)} · ${esc(e.equipment || "")}${esc(lastTxt)}</small></span><i>+</i></button>`;
    }).join("") + (q.trim() && !rows.some(e => e.name.toLowerCase() === q.trim().toLowerCase())
      ? `<button class="ax-row ax-new" data-act="axcreate" data-q="${esc(q.trim())}"><span><b>Create “${esc(q.trim())}”</b>
          <small>Saved to your library${groups.length ? " under " + esc(groups[0]) : ""}</small></span><i>+</i></button>` : "")
      + (!rows.length && !q.trim() ? `<div class="ax-h">Type to search all ${EXERCISE_LIBRARY.length}+ exercises</div>` : "");
    box.classList.add("open");
  }
  function addToWorkout(ex) {
    const s = daySession(ACTIVE);
    if (s.exercises.some(x => x.id === ex.id)) return;
    s.exercises.push(ex);
    persistDay();
    const today = todayStr();
    document.getElementById("tr-list").insertAdjacentHTML("beforeend", exCardHtml(ex, getLog(today, ACTIVE), today));
    document.getElementById("tp-of").textContent = s.exercises.length;
    const q = document.getElementById("ax-q"); q.value = ""; q.placeholder = "Add another exercise…";
    document.getElementById("ax-res").classList.remove("open");
    const card = document.querySelector(`#tr-list .ex[data-ex="${CSS.escape(ex.id)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => card?.querySelector("input")?.focus({ preventScroll: true }), 350);
    paintTrainProgress();
  }

  /* ---------- auto-save + finish ---------- */
  function collectEntries() {
    const entries = {};
    let count = 0, blankWeight = 0;
    document.querySelectorAll("#view .ex[data-ex]").forEach(card => {
      const exId = card.dataset.ex;
      const cardio = card.classList.contains("cardio");
      const weighted = !cardio && (prFor(exId)?.w || 0) > 0;     // this lift is normally loaded
      const sets = [];
      card.querySelectorAll(".set-row").forEach(row => {
        const w = parseFloat(row.querySelector(".w").value);
        const r = parseInt(row.querySelector(".r").value, 10);
        if (isNaN(w) && isNaN(r)) return;
        if (isNaN(w) && r > 0 && weighted) blankWeight++;
        sets.push({ w: isNaN(w) ? 0 : Math.max(0, w), r: isNaN(r) ? 0 : Math.max(0, r) });
      });
      if (sets.length) { entries[exId] = sets; count += sets.length; }
    });
    return { entries, count, blankWeight };
  }
  let AUTOSAVE_T = null, PUSH_T = null;
  const saveState = (t) => { const el = document.getElementById("tp-save"); if (el) el.textContent = t; };
  function autosave() {
    AUTOSAVE_T = null;
    if (!ACTIVE || !document.querySelector('#view [data-act="finish"]')) return;
    const { entries, count } = collectEntries();
    const today = todayStr();
    const existed = getLog(today, ACTIVE);
    if (!count) { saveState(existed ? "Saved" : "Saves as you type"); return; }
    const rec = upsertLog(today, ACTIVE, entries);
    if (!existed) { rec.done = false; rec.startedAt = Date.now(); save(); }   // a new workout is in progress until Finish
    saveState("Saved");
    clearTimeout(PUSH_T);
    PUSH_T = setTimeout(() => pushRecord("log", rec), 4000);
  }
  function scheduleAutosave() { clearTimeout(AUTOSAVE_T); saveState("Saving…"); AUTOSAVE_T = setTimeout(autosave, 600); }
  function flushAutosave() {
    if (AUTOSAVE_T) { clearTimeout(AUTOSAVE_T); autosave(); }
    if (PUSH_T) { clearTimeout(PUSH_T); PUSH_T = null; syncPending(); }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushAutosave(); });
  window.addEventListener("pagehide", flushAutosave);

  async function finishWorkout() {
    const today = todayStr();
    const before = getLog(today, ACTIVE);
    if (before && before.done !== false && !AUTOSAVE_T) { go("today"); return; }   // already finished → "Done — back to Home"
    clearTimeout(AUTOSAVE_T); AUTOSAVE_T = null; clearTimeout(PUSH_T); PUSH_T = null;
    stopRest();
    const { entries, count, blankWeight } = collectEntries();
    if (count === 0) { toast("Log at least one set first"); return; }
    // a grey placeholder is last time's number, not a value — don't silently log 0 kg (AUDIT M4)
    if (blankWeight && !confirm(`${blankWeight} set${blankWeight === 1 ? " has" : "s have"} reps but no weight.\n\nSave as bodyweight (0 kg)? Tap Cancel to go back and add the weight.`)) return;
    const rec = upsertLog(today, ACTIVE, entries);
    rec.done = true; rec.finishedAt = Date.now(); rec.startedAt ||= rec.finishedAt;
    // one squad post per workout, on finish (AUDIT H2)
    const u = cachedUser(), sid = getCurrentSquad();
    if (!rec.posted && u && sid && getPrivacy().workouts) {
      postActivity(u.id, sid, "workout", { title: sessName(ACTIVE), exercises: Object.keys(entries).length });
      rec.posted = true;
    }
    save();
    renderDone(rec);
    const ok = await pushRecord("log", rec);
    if (!ok) toast("Saved on this device — it'll sync when you're back online");
  }

  function renderDone(rec) {
    const ids = Object.keys(rec.entries);
    const sets = ids.reduce((t, id) => t + rec.entries[id].length, 0);
    const vol = Math.round(ids.filter(id => !isCardio(id)).reduce((t, id) => t + rec.entries[id].reduce((v, x) => v + (Number(x.w) || 0) * (Number(x.r) || 0), 0), 0));
    const mins = rec.startedAt && rec.finishedAt ? Math.max(1, Math.round((rec.finishedAt - rec.startedAt) / 60000)) : null;
    const prs = ids.filter(id => !isCardio(id)).map(id => {
      const best = H.bestSet(rec.entries[id]); const prior = prFor(id, rec.date);
      return prior && best && H.betterSet(prior, best) === best && (Number(best.w) !== Number(prior.w) || Number(best.r) !== Number(prior.r))
        ? { id, best } : null;
    }).filter(Boolean);
    const stat = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
    view().innerHTML = `<div class="wd">
      <canvas class="wd-confetti" id="wd-confetti" aria-hidden="true"></canvas>
      <div class="wd-tick"><svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1 class="wd-h">Workout done</h1>
      <p class="wd-sub">${esc(sessName(rec.session))} · ${esc(shortDate(rec.date))}. Well done${PROFILE?.name ? ", " + esc(PROFILE.name.split(" ")[0]) : ""} — that's ${goalNow() - Math.max(0, goalNow() - weekBounds().filter(d => DB.logs.some(l => l.date === d)).length)} of ${goalNow()} this week.</p>
      <div class="wd-stats glass">${stat(ids.length, "exercises")}${stat(sets, "sets")}${stat(vol >= 1000 ? (vol / 1000).toFixed(1) + "t" : vol + "kg", "volume")}${mins ? stat(mins + "m", "time") : ""}</div>
      ${prs.length ? `<div class="subhead">New personal records</div><div class="card">` + prs.map(p =>
        `<div class="pr-row"><span>${esc(exMeta(p.id)?.name || p.id)}</span><span class="v">${esc(fmtSet(p.best))}</span></div>`).join("") + `</div>` : ""}
      <button class="h2-cta" data-act="gohome">Back to Home</button>
      <button class="h2-cta ghost" data-act="pick" data-s="${esc(rec.session)}" style="margin-top:10px">Edit this workout</button>
    </div>`;
    window.scrollTo(0, 0);
    confetti(document.getElementById("wd-confetti"));
  }
  function confetti(cv) {
    if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.width = innerWidth * dpr, Hh = cv.height = innerHeight * dpr;
    const ctx = cv.getContext("2d");
    const cols = ["#CCFF00", "#F2F3EF", "#9AA394", "#CCFF00", "#FFFFFF"];
    const P2 = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - .5) * W * .3, y: Hh * .32, vx: (Math.random() - .5) * 15 * dpr, vy: (-Math.random() * 15 - 5) * dpr,
      w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .35,
      c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 2600; if (k > 1 || !cv.isConnected) { ctx.clearRect(0, 0, W, Hh); return; }
      ctx.clearRect(0, 0, W, Hh); ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
      for (const p of P2) {
        p.vy += .42 * dpr; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); ctx.restore();
      }
      requestAnimationFrame(frame);
    })(t0);
    try { navigator.vibrate?.([30, 40, 30]); } catch {}
  }

  /* ============================ PROGRESS ============================ */
  function renderProgress() {
    const today = todayStr();
    const total = DB.logs.length;
    const wk = DB.logs.filter(l => dayDiff(l.date, today) >= 0 && dayDiff(l.date, today) < 7).length;
    const bw = DB.body.length ? DB.body[DB.body.length - 1].weight : null;
    const dBw = DB.body.length > 1 ? +(DB.body[DB.body.length - 1].weight - DB.body[0].weight).toFixed(1) : null;

    let html = `<div class="section-label">Your numbers</div><h1 class="h-title">Progress</h1>
      <p class="h-sub">Beat the logbook. That's how you grow.</p>
      <button class="btn" data-act="weekly" style="margin:0 0 16px">Weekly review — copy to share</button>
      <div class="grid2">
        <div class="stat"><div class="n">${total}</div><div class="l">Workouts logged</div></div>
        <div class="stat"><div class="n">${wk}</div><div class="l">This week</div></div>
        <div class="stat"><div class="n">${bw != null ? bw + "<span style='font-size:14px'>kg</span>" : "—"}</div><div class="l">Bodyweight</div></div>
        <div class="stat"><div class="n">${dBw != null ? (dBw >= 0 ? "+" : "") + dBw + "<span style='font-size:14px'>kg</span>" : "—"}</div><div class="l">Weight change</div></div>
      </div>`;

    // bodyweight chart
    html += `<div class="subhead">Bodyweight trend</div><div class="card">`;
    if (DB.body.length >= 2) {
      html += `<div class="chart">${svgLine(DB.body.map(b => ({ label: b.date, y: b.weight })), "kg")}</div>`;
    } else {
      html += `<div class="empty">Log your bodyweight on the <b>Log</b> tab a few times to see the trend.</div>`;
    }
    html += `</div>`;

    // lift progress (cardio excluded — minutes aren't a "lift")
    const lifted = [];
    const seen = new Set();
    DB.logs.forEach(l => Object.keys(l.entries).forEach(id => {
      if (!seen.has(id) && !isCardio(id)) { seen.add(id); lifted.push(id); }
    }));
    html += `<div class="subhead">Lift progress</div>`;
    if (lifted.length) {
      const sel = ACTIVE_LIFT && lifted.includes(ACTIVE_LIFT) ? ACTIVE_LIFT : lifted[0];
      html += `<div class="selectrow"><select class="sel" data-act="liftsel">` +
        lifted.map(id => `<option value="${id}" ${id === sel ? "selected" : ""}>${esc(exMeta(id).name)}</option>`).join("") +
        `</select></div><div class="card"><div class="chart" id="liftchart">${liftChart(sel)}</div></div>`;
    } else {
      html += `<div class="card"><div class="empty">Log a workout on the <b>Train</b> tab and your top-set progress will chart here.</div></div>`;
    }

    // PRs
    html += `<div class="subhead">Personal records</div><div class="card">`;
    const prs = lifted.map(id => ({ id, pr: prFor(id) })).filter(x => x.pr)
      .sort((a, b) => (b.pr.w - a.pr.w) || (b.pr.r - a.pr.r));
    if (prs.length) {
      prs.forEach(x => {
        html += `<div class="pr-row ex-link" data-act="exhist" data-ex="${x.id}"><span>${esc(exMeta(x.id).name)}</span>
          <span class="v">${esc(fmtSet(x.pr))}</span></div>`;
      });
    } else {
      html += `<div class="empty">Your heaviest set on each lift will appear here.</div>`;
    }
    html += `</div>`;
    html += `<button class="linkbtn" data-act="history" style="margin-top:14px">View full workout history
      <small>Every session you've logged, by date.</small></button>`;
    view().innerHTML = html;
  }

  /* ============================ HISTORY ============================ */
  function renderHistory() {
    const logs = DB.logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    let html = `<div class="section-label">Your log</div><h1 class="h-title">History</h1>
      <p class="h-sub">Every session you've logged.</p>
      <button class="linkbtn" data-act="backprogress" style="margin-bottom:16px">‹ Back to progress</button>`;
    if (!logs.length) html += `<div class="empty">No workouts logged yet. Train a session and it'll show here.</div>`;
    logs.forEach(l => {
      const name = sessName(l.session);
      const rows = Object.entries(l.entries).map(([id, sets]) => {
        const nm = exMeta(id).name;
        const top = H.bestSet(sets);
        const label = isCardio(id) ? `${top.w} min · ${top.r} rounds` : `${sets.length} set${sets.length === 1 ? "" : "s"} · best ${fmtSet(top)}`;
        return `<div class="hist-ex"><span>${esc(nm)}</span><span class="hist-m">${esc(label)}</span></div>`;
      }).join("");
      html += `<div class="hist-card">
        <div class="hist-h"><b>${esc(name)}</b><span class="hist-date">${esc(prettyDate(l.date))}</span></div>
        ${rows}</div>`;
    });
    view().innerHTML = html;
  }
  let ACTIVE_LIFT = null;
  function liftChart(id) {
    const hist = allSetsFor(id);
    if (hist.length < 2) return `<div class="empty">Need 2+ logged sessions of this lift to chart it. Keep logging!</div>`;
    return isBodyweight(id)
      ? svgLine(hist.map(h => ({ label: h.date, y: h.top.r })), " reps")
      : svgLine(hist.map(h => ({ label: h.date, y: h.top.w })), "kg");
  }

  /* ---------- SVG line chart ---------- */
  function svgLine(pts, unit) {
    if (pts.length < 2) return `<div class="empty">Not enough data yet.</div>`;
    const W = 320, H = 150, pL = 30, pR = 10, pT = 14, pB = 22;
    const ys = pts.map(p => p.y);
    let mn = Math.min(...ys), mx = Math.max(...ys);
    if (mn === mx) { mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
    const plotW = W - pL - pR, plotH = H - pT - pB;
    const X = i => pL + (i / (pts.length - 1)) * plotW;
    const Y = v => pT + (1 - (v - mn) / (mx - mn)) * plotH;
    const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    const area = `${pL},${pT + plotH} ${line} ${W - pR},${pT + plotH}`;
    const dots = pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#CCFF00"/>`).join("");
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#CCFF00" stop-opacity=".26"/>
        <stop offset="1" stop-color="#CCFF00" stop-opacity="0"/></linearGradient></defs>
      <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT + plotH}" stroke="#2A2D26"/>
      <line x1="${pL}" y1="${pT + plotH}" x2="${W - pR}" y2="${pT + plotH}" stroke="#2A2D26"/>
      <text x="4" y="${Y(mx) + 4}" fill="#8B8F87" font-size="9">${mx.toFixed(mx - mn < 5 ? 1 : 0)}</text>
      <text x="4" y="${Y(mn) + 4}" fill="#8B8F87" font-size="9">${mn.toFixed(mx - mn < 5 ? 1 : 0)}</text>
      <polygon points="${area}" fill="url(#g)"/>
      <polyline points="${line}" fill="none" stroke="#CCFF00" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <text x="${W - pR}" y="${Y(last.y) - 7}" fill="#F2F3EF" font-size="10" text-anchor="end" font-weight="700">${last.y}${unit || ""}</text>
      <text x="${pL}" y="${H - 6}" fill="#8B8F87" font-size="9">${shortDate(pts[0].label)}</text>
      <text x="${W - pR}" y="${H - 6}" fill="#8B8F87" font-size="9" text-anchor="end">${shortDate(last.label)}</text>
    </svg>`;
  }

  /* ============================ WEEKLY REVIEW ============================ */
  function prettyShort(s) {
    return parseYmd(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  function weekBounds(ref) {
    const mon = parseYmd(mondayOnOrBefore(ref || new Date()));
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); days.push(ymd(d)); }
    return days;
  }
  function weeklyReport() {
    const days = weekBounds();
    const today = todayStr();
    const dn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const t = getActiveTargets();
    const L = [];
    L.push("🏋️ NO LIMIT — WEEKLY REVIEW");
    L.push("Week: " + prettyShort(days[0]) + " – " + prettyShort(days[6]));
    L.push("");

    // Training adherence — any session logged that day counts (a swapped or quick
    // session is still training); only past days can be "missed" (AUDIT M2)
    let done = 0, missed = 0; const tl = [];
    const goal = goalNow();
    days.forEach((d, i) => {
      const c = cycleFor(d);
      const planned = c.type === "train" && sess(c.session) ? sessName(c.session) : null;
      const dayLogs = DB.logs.filter(l => l.date === d);
      if (dayLogs.length) {
        done++;
        const what = dayLogs.map(l => sessName(l.session)).join(" + ");
        const n = new Set(dayLogs.flatMap(l => Object.keys(l.entries).filter(id => !isCardio(id)))).size;
        const swapped = planned && !dayLogs.some(l => comboParts(l.session).includes(c.session)) ? ` (scheduled: ${planned})` : "";
        tl.push(`✔  ${dn[i]} · ${what} — ${n} exercise${n === 1 ? "" : "s"}${swapped}`);
      } else if (planned) {
        if (d < today) missed++;
        tl.push(`${d > today ? "·" : "✘"}  ${dn[i]} · ${planned} — ${d > today ? "upcoming" : d === today ? "not logged yet" : "not logged"}`);
      } else tl.push(`—  ${dn[i]}`);
    });
    L.push(`TRAINING — ${done}/${goal} sessions (weekly goal ${goal})`);
    tl.forEach(x => L.push(x));
    L.push("");

    // Key lifts: this week's best set vs the all-time best BEFORE this week, for the
    // same exercise only — a different exercise is never reported as progress
    const weekLogs = DB.logs.filter(l => days.indexOf(l.date) >= 0);
    const exWeek = {};
    weekLogs.forEach(l => Object.entries(l.entries).forEach(([id, sets]) => {
      if (isCardio(id) || !sets.length) return;
      exWeek[id] = H.betterSet(exWeek[id], H.bestSet(sets));
    }));
    const lifts = Object.keys(exWeek);
    if (lifts.length) {
      L.push("KEY LIFTS (best set this week vs your best before)");
      const prs = [];
      lifts.forEach(id => {
        const tp = exWeek[id], prev = prFor(id, days[0]);
        const same = prev && Number(prev.w) === Number(tp.w) && Number(prev.r) === Number(tp.r);
        let tag;
        if (!prev) tag = "first time — baseline set";
        else if (!same && H.betterSet(prev, tp) === tp) { tag = `▲ PR, previous best ${fmtSet(prev)}`; prs.push(`${exMeta(id).name} — ${fmtSet(tp)}`); }
        else if (same) tag = "= matched your best";
        else tag = `below your best of ${fmtSet(prev)}`;
        L.push(`${exMeta(id).name}: ${fmtSet(tp)} (${tag})`);
      });
      L.push("");
      if (prs.length) { L.push("🏆 PERSONAL RECORDS THIS WEEK"); prs.forEach(p => L.push("• " + p)); L.push(""); }
    }

    // Cardio — any cardio exercise counts (no longer assumes one person's HIIT plan)
    const cardio = weekLogs.filter(l => Object.keys(l.entries).some(id => isCardio(id))).length;
    L.push(`CARDIO — ${cardio} session${cardio === 1 ? "" : "s"} with cardio`);
    L.push("");

    // Bodyweight
    const bw = DB.body.filter(b => days.indexOf(b.date) >= 0).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (bw.length) {
      const s = bw[0].weight, e = bw[bw.length - 1].weight, dlt = +(e - s).toFixed(1);
      L.push(`BODYWEIGHT — ${s}kg → ${e}kg (${dlt >= 0 ? "+" : ""}${dlt}kg this week)${PROFILE?.bw_target ? ` · target ${PROFILE.bw_target}kg` : ""}`);
    } else L.push("BODYWEIGHT — not logged this week");
    L.push("");

    // Nutrition
    const mac = DB.macros.filter(m => days.indexOf(m.date) >= 0 && (m.kcal || m.protein));
    if (mac.length) {
      const avgK = Math.round(mac.reduce((a, m) => a + (m.kcal || 0), 0) / mac.length);
      const avgP = Math.round(mac.reduce((a, m) => a + (m.protein || 0), 0) / mac.length);
      const pHit = mac.filter(m => (m.protein || 0) >= t.protein).length;
      L.push(`NUTRITION — ${mac.length}/7 days logged`);
      L.push(`Avg calories: ${avgK} (target ${t.kcal})`);
      L.push(`Avg protein: ${avgP}g (target ${t.protein}) · hit on ${pHit}/${mac.length} days`);
    } else L.push("NUTRITION — not logged this week");

    // Auto flags
    const flags = [];
    if (missed) flags.push(`Missed ${missed} planned session${missed === 1 ? "" : "s"}`);
    if (!bw.length) flags.push("No bodyweight logged");
    if (mac.length < 5) flags.push(`Only ${mac.length}/7 days of food logged`);
    if (flags.length) { L.push(""); L.push("⚠️ FLAGS"); flags.forEach(f => L.push("• " + f)); }

    L.push("");
    L.push("— Paste this into your coach chat to review the week —");
    return L.join("\n");
  }
  /* ---------- per-exercise history (bottom sheet — never leaves an unsaved workout) ---------- */
  function openExerciseHistory(id) {
    const m = exMeta(id), cardio = isCardio(id), hist = H.exerciseSessions(DB.logs, id);
    const pr = cardio ? null : prFor(id);
    const ago = hist.length ? H.daysBetween(hist[0].date, todayStr()) : null;
    const agoTxt = ago == null ? "—" : ago === 0 ? "Today" : ago === 1 ? "Yesterday" : ago + " days ago";
    const setTxt = (s) => (cardio ? `${s.w} min · ${s.r} rds` : fmtSet(s));
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box xh">
      <div class="modal-head"><b>${esc(m.name)}</b><span class="mx" data-act="closemodal">✕</span></div>
      <div class="xh-sub">${esc(m.target || "")}${m.custom ? " · your exercise" : ""}</div>
      <div class="xh-stats">
        <div><span>${cardio ? "Sessions" : "Best set"}</span><b>${cardio ? hist.length : (pr ? esc(fmtSet(pr)) : "—")}</b></div>
        <div><span>Last done</span><b>${esc(agoTxt)}</b></div>
        <div><span>Times logged</span><b>${hist.length}</b></div>
      </div>
      ${!cardio && hist.length >= 2 ? `<div class="chart xh-chart">${liftChart(id)}</div><div class="xh-cap">${isBodyweight(id) ? "Best reps" : "Heaviest weight"} per session — rep gains at the same weight show in the list below.</div>` : ""}
      <div class="xh-list">${hist.length ? hist.map(h => `<div class="xh-row">
          <div class="xh-when"><b>${esc(prettyShort(h.date))}</b><small>${esc(sessName(h.session))}</small></div>
          <div class="xh-sets">${h.sets.map(s => esc(setTxt(s))).join("<br>")}</div></div>`).join("")
        : `<div class="empty" style="padding:18px">Not logged yet — your first session sets the baseline.</div>`}</div>
    </div>`;
    document.body.appendChild(ov);
  }

  /* ---------- rest timer ----------
     Starts when a set's reps are entered; length comes from the exercise's rep
     target (core/history restSecondsFor). Lives outside #view so it survives tab
     changes, and counts against an absolute end time so it stays accurate when
     the phone sleeps. Beeps (Web Audio) + vibrates where supported when done. */
  let REST = null, REST_TICK = null, AUDIO = null;
  function fmtClock(sec) { return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function restEl() {
    let el = document.getElementById("restbar");
    if (!el) {
      el = document.createElement("div"); el.id = "restbar"; el.className = "restbar";
      el.innerHTML = `<div class="rb-fill"></div><div class="rb-row">
        <span class="rb-l"></span><b class="rb-t"></b>
        <span class="rb-acts"><button data-act="restadj" data-d="-15">−15</button>
          <button data-act="restadj" data-d="15">+15</button><button data-act="restskip" class="rb-skip">Skip</button></span></div>`;
      document.body.appendChild(el);
    }
    return el;
  }
  function startRest(sec, name) {
    REST = { endsAt: Date.now() + sec * 1000, total: sec, name, done: false };
    try { AUDIO = AUDIO || new (window.AudioContext || window.webkitAudioContext)(); AUDIO.resume && AUDIO.resume(); } catch {}
    clearInterval(REST_TICK); REST_TICK = setInterval(paintRest, 250); paintRest();
  }
  function stopRest() { clearInterval(REST_TICK); REST_TICK = null; REST = null; document.getElementById("restbar")?.remove(); }
  function paintRest() {
    if (!REST) return;
    const el = restEl();
    const left = Math.max(0, Math.ceil((REST.endsAt - Date.now()) / 1000));
    if (left === 0 && !REST.done) { REST.done = true; restDone(); }
    el.classList.toggle("done", REST.done);
    el.querySelector(".rb-fill").style.width = (100 - Math.min(100, (left / REST.total) * 100)) + "%";
    el.querySelector(".rb-l").textContent = REST.done ? "Go — next set" : "Rest";
    el.querySelector(".rb-t").textContent = REST.done ? "" : fmtClock(left);
    el.querySelector(".rb-skip").textContent = REST.done ? "Done" : "Skip";
  }
  function restDone() {
    try { navigator.vibrate && navigator.vibrate([220, 120, 220]); } catch {}
    try {
      if (AUDIO) [0, 0.28].forEach(t => {
        const o = AUDIO.createOscillator(), g = AUDIO.createGain(), at = AUDIO.currentTime + t;
        o.frequency.value = 880; o.connect(g); g.connect(AUDIO.destination);
        g.gain.setValueAtTime(0.25, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
        o.start(at); o.stop(at + 0.23);
      });
    } catch {}
    setTimeout(() => { if (REST && REST.done) stopRest(); }, 8000);
  }
  // entering a set's reps starts the timer (lifts only — not cardio)
  document.addEventListener("change", (e) => {
    const r = e.target;
    if (!r.classList || !r.classList.contains("r") || !r.value) return;
    const card = r.closest(".ex");
    if (!card || card.classList.contains("cardio")) return;
    const m = exMeta(card.dataset.ex);
    startRest(H.restSecondsFor(m.reps), m.name);
  });

  function showReport() {
    const text = weeklyReport();
    const ov = document.createElement("div");
    ov.className = "modal";
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><b>Weekly Review</b><span class="mx" data-act="closemodal">✕</span></div>
      <textarea class="report" readonly>${esc(text)}</textarea>
      <div class="modal-actions">
        <button class="btn sm" data-act="copyreport">Copy</button>
        <button class="btn sm ghost" data-act="dlreport">Download .txt</button>
      </div>
      <p class="modal-hint">Copy this and paste it into your chat — we'll review where you lacked and set next week's targets.</p>
    </div>`;
    ov._text = text;
    document.body.appendChild(ov);
  }

  function editTargets() {
    const t = getActiveTargets();
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><b>My Targets</b><span class="mx" data-act="closemodal">✕</span></div>
      <div class="rowflex">
        <div class="field"><label>Calories</label><input id="tg-kcal" type="number" inputmode="numeric" value="${t.kcal}"></div>
        <div class="field"><label>Protein (g)</label><input id="tg-prot" type="number" inputmode="numeric" value="${t.protein}"></div>
      </div>
      <div class="rowflex">
        <div class="field"><label>Carbs (g)</label><input id="tg-carbs" type="number" inputmode="numeric" value="${t.carbs}"></div>
        <div class="field"><label>Fats (g)</label><input id="tg-fats" type="number" inputmode="numeric" value="${t.fats}"></div>
      </div>
      <div class="modal-actions"><button class="btn sm" data-act="savetargets">Save targets</button></div>
      <p class="modal-hint">Set your daily goals — the bars and weekly review use these.</p>
    </div>`;
    document.body.appendChild(ov);
  }

  /* ============================ LOG (body + macros) ============================ */
  function renderLog() {
    const today = todayStr();
    const bwToday = DB.body.find(b => b.date === today);
    const mToday = DB.macros.find(m => m.date === today) || {};
    const t = getActiveTargets();

    let html = `<div class="section-label">Daily log · ${esc(shortDate(today))}</div>
      <h1 class="h-title">Body &amp; Fuel</h1><p class="h-sub">Hit your numbers, every day.</p>`;

    html += `<div class="card"><div class="field"><label>Bodyweight today (kg)</label>
      <input id="bw" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 72.4" value="${bwToday ? bwToday.weight : ""}"></div>
      <button class="btn sm" data-act="savebw">Save weight</button></div>`;

    const bar = (label, val, target, unit) => {
      const pct = target ? Math.min(100, Math.round(val / target * 100)) : 0;
      return `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:10px">
          <span>${label}</span><span>${val} / ${target}${unit}</span></div>
        <div class="bar ${val > target ? "over" : ""}"><i style="width:${pct}%"></i></div>`;
    };
    const m = { kcal: mToday.kcal || 0, protein: mToday.protein || 0, carbs: mToday.carbs || 0, fats: mToday.fats || 0 };
    html += `<div class="card">
      <div class="rowflex">
        <div class="field"><label>Calories</label><input id="kcal" type="number" inputmode="numeric" placeholder="kcal" value="${mToday.kcal ?? ""}"></div>
        <div class="field"><label>Protein (g)</label><input id="prot" type="number" inputmode="numeric" placeholder="g" value="${mToday.protein ?? ""}"></div>
      </div>
      <div class="rowflex">
        <div class="field"><label>Carbs (g)</label><input id="carbs" type="number" inputmode="numeric" placeholder="g" value="${mToday.carbs ?? ""}"></div>
        <div class="field"><label>Fats (g)</label><input id="fats" type="number" inputmode="numeric" placeholder="g" value="${mToday.fats ?? ""}"></div>
      </div>
      <button class="btn sm" data-act="savemacro">Save fuel</button>
      <div style="margin-top:16px">
        ${bar("Calories", m.kcal, t.kcal, "")}
        ${bar("Protein", m.protein, t.protein, " g")}
        ${bar("Carbs", m.carbs, t.carbs, " g")}
        ${bar("Fats", m.fats, t.fats, " g")}
      </div>
      <button class="linkbtn" data-act="edittargets" style="margin-top:14px">Edit my targets
        <small>${t.kcal} kcal · ${t.protein}g P · ${t.carbs}g C · ${t.fats}g F</small></button>
    </div>`;

    // meals — log what you ate; each adds to today's totals above
    const meals = (DB.macros.find(x => x.date === today)?.meals) || [];
    html += `<div class="subhead">Meals today</div><div class="card">`;
    meals.forEach((ml, idx) => {
      html += `<div class="meal-row"><span class="meal-n">${esc(ml.name)}</span>
        <span class="meal-m">${ml.kcal} kcal · ${ml.protein}g P</span>
        <span class="meal-x" data-act="delmeal" data-idx="${idx}">✕</span></div>`;
    });
    if (!meals.length) html += `<div class="empty" style="padding:10px 0">No meals yet — add one to build your day.</div>`;
    html += `<div class="meal-add">
      <input id="ml-name" placeholder="Meal (e.g. Breakfast)" autocapitalize="words">
      <div class="rowflex" style="margin-top:8px">
        <input id="ml-kcal" type="number" inputmode="numeric" placeholder="kcal">
        <input id="ml-prot" type="number" inputmode="numeric" placeholder="protein">
        <input id="ml-carbs" type="number" inputmode="numeric" placeholder="carbs">
        <input id="ml-fats" type="number" inputmode="numeric" placeholder="fats">
      </div>
      <button class="btn sm" data-act="addmeal" style="margin-top:10px">+ Add meal</button>
    </div></div>`;

    // protein trend — only days that were actually logged (last 14 entries)
    const logged = DB.macros.filter(m => m.protein > 0).slice(-14)
      .map(m => ({ label: m.date, y: m.protein }));
    html += `<div class="subhead">Protein trend</div><div class="card">`;
    if (logged.length >= 2) {
      html += `<div class="chart">${svgLine(logged, "g")}</div>`;
    } else {
      html += `<div class="empty">Log your protein for 2+ days and your trend will chart here.</div>`;
    }
    html += `</div>`;

    html += `<div class="note">Aim for a small daily surplus (~+250 kcal) with protein at the top of the range. Slow gain = lean gain.</div>`;
    html += `<button class="linkbtn" data-act="gofuel" style="margin-top:12px">What should I eat today?
      <small>Your daily meal template, shopping list &amp; macro reference.</small></button>`;
    view().innerHTML = html;
  }

  /* ---------- Daily fuel cheat-sheet (rendered inside Plan) ---------- */
  function renderFuel() {
    const f = P.fuel;
    let h = `<div class="subhead">Daily fuel cheat-sheet</div>`;

    // meal template
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <b style="font-size:14px">A day that hits your numbers</b>
        <span style="color:var(--gold);font-size:12px;font-weight:700">${f.totalKcal} · ${f.totalProtein}</span></div>`;
    f.meals.forEach(m => {
      h += `<div class="fuel-meal">
        <div class="fuel-m"><b>${esc(m.m)}</b> <span class="fuel-tag ${m.tag}">${m.tag}</span><div class="fuel-food">${esc(m.food)}</div></div>
        <div class="fuel-macros">${m.kcal}<small>kcal</small><br>${m.p}<small>g P</small></div></div>`;
    });
    h += `<div class="note" style="margin-top:12px">${esc(f.note)}</div></div>`;

    // grocery list
    h += `<div class="subhead">Weekly shopping list</div><div class="card grocery">`;
    Object.keys(f.groceries).forEach(cat => {
      h += `<div class="gcat"><b>${esc(cat)}</b><div>` +
        f.groceries[cat].map(x => `<span class="chip">${esc(x)}</span>`).join("") + `</div></div>`;
    });
    h += `</div>`;

    // macro reference
    h += `<div class="subhead">Macro reference · per portion</div><div class="card" style="padding:6px 0">
      <table class="ref-tbl"><thead><tr><th>Food</th><th>Portion</th><th>kcal</th><th>Protein</th></tr></thead><tbody>` +
      f.ref.map(r => `<tr><td>${esc(r[0])}</td><td class="mut">${esc(r[1])}</td><td class="mut">${r[2]}</td><td class="pp">${r[3]}g</td></tr>`).join("") +
      `</tbody></table></div>`;
    return h;
  }

  /* ============================ PLAN (reference + settings) ============================ */
  function renderPlan() {
    const t = getActiveTargets();
    let html = `<div class="section-label">Your plan</div><h1 class="h-title">The Plan</h1>
      <p class="h-sub">Fuel, supplements and the rules that make the training work.</p>`;
    html += `<div class="subhead">Nutrition · your targets</div><div class="card"><ul class="clean">
      <li><b>Calories:</b> ${t.kcal}</li>
      <li><b>Protein:</b> ${t.protein} g</li>
      <li><b>Carbs:</b> ${t.carbs} g · <b>Fats:</b> ${t.fats} g</li>
      <li><b>Breakfast:</b> oats + whey + berries + peanut butter</li>
      <li><b>Timing:</b> breakfast · lunch · post-workout shake · dinner</li></ul>
      <button class="linkbtn" data-act="edittargets" style="margin:12px 0 0">Edit my targets</button></div>`;
    html += renderFuel();
    html += `<div class="subhead">Supplements</div><div class="card"><ul class="clean">` +
      P.supplements.map(s => `<li><b>${esc(s[0])}</b> — ${esc(s[1])}, ${esc(s[2])}. ${esc(s[3])}.</li>`).join("") +
      `</ul><div class="note">${esc(P.aminoNote)}</div></div>`;
    html += `<div class="subhead">Warm-up · every session</div><div class="card"><ul class="clean">` +
      P.warmup.map(w => `<li>${esc(w)}</li>`).join("") + `</ul></div>`;
    html += `<div class="subhead">Training rules</div><div class="card"><ul class="clean">` +
      P.rules.map(r => `<li>${esc(r)}</li>`).join("") + `</ul></div>`;
    html += `<button class="linkbtn" data-act="settings" style="margin-top:6px">Settings<small>Weekly goal, schedule, Spotify, privacy, your data.</small></button>`;
    view().innerHTML = html;
  }

  /* ============================ SETTINGS ============================ */
  function renderSettings() {
    const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const goal = goalNow();
    const schedTxt = hasSchedule()
      ? P.cycle.map((c, i) => c.type === "train" && sess(c.session) ? `${DN[i]} ${esc(oneName(c.session))}` : null).filter(Boolean).join(" · ")
      : "None — you pick on the day";
    let html = `<div class="section-label">Your app</div><h1 class="h-title">Settings</h1>
      <div class="subhead">Training</div>
      <div class="card pl-week">
        <small>Weekly goal</small>
        <div class="goal-row">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="goal-chip${n === goal ? " on" : ""}" data-act="setgoal" data-n="${n}">${n}</button>`).join("")}</div>
        <p class="pl-note">sessions a week — Home's ring counts any workout toward it.</p>
        <div class="pl-sched"><span><small>Schedule · optional</small><b>${schedTxt}</b></span>
          <button class="tr-switch" data-act="weekedit">Edit</button></div>
      </div>`;
    // privacy
    const pv = getPrivacy();
    const privRow = (key, label) => `<div class="priv-row"><span>${label}</span>
      <button class="toggle ${pv[key] ? "on" : ""}" data-act="togglepriv" data-key="${key}"><i></i></button></div>`;
    html += `<div class="subhead">Privacy — what your squad sees</div><div class="card">
      ${privRow("workouts", "Workouts")}
      ${privRow("nutrition", "Nutrition")}
      ${privRow("bodyweight", "Bodyweight")}
      ${privRow("music", "Music")}
      <p class="sq-ihint" style="margin-top:8px">You control what's shared. Turn Workouts off and your sessions stop posting to the feed.</p></div>`;

    // training soundtrack
    const mus = getMusic();
    const musOn = pv.music;
    const spotBlock = spotifyConfigured() ? (isSpotifyConnected()
      ? `<div class="spot-row"><span class="spot-badge">Spotify connected</span>
          <span class="spot-acts"><button class="lb-r" data-act="spotpick">Pick a playlist</button>
            <button class="lb-r" data-act="spotoff">Disconnect</button></span></div>
        ${canControlPlayback()
          ? `<div class="priv-row ap-row"><span><b>Auto-play on Start</b><small>Starting a workout plays your soundtrack on Spotify. Premium; Spotify open on a device.</small></span>
              <button class="toggle${autoplayOn() ? " on" : ""}" data-act="aptoggle" aria-label="Auto-play on Start"><i></i></button></div>`
          : `<button class="btn ghost sm" data-act="spoton" style="margin-top:12px">Reconnect Spotify to turn on auto-play</button>
             <p class="sq-ihint" style="margin:8px 0 0">One tap — Spotify asks for permission to start your playlist.</p>`}`
      : `<button class="btn sm spot-connect" data-act="spoton">Connect Spotify</button>
         <p class="sq-ihint" style="margin:8px 0 0">Authorize once, then pick a playlist to share — no typing a link.</p>`)
      : "";
    html += `<div class="subhead">Your training soundtrack</div><div class="card">
      ${musOn ? `${spotBlock ? spotBlock + `<div class="or-line"><span>or paste a link</span></div>` : ""}
      <div class="field"><label>Playlist link (Spotify, Apple Music, YouTube…)</label>
        <input id="mus-url" class="inp" type="url" inputmode="url" autocapitalize="none" placeholder="https://…" value="${esc(mus.url || "")}"></div>
      <div class="field" style="margin-top:10px"><label>Vibe <small style="color:var(--muted)">(optional)</small></label>
        <input id="mus-label" class="inp" placeholder="e.g. Heavy rap · gym phonk" maxlength="40" value="${esc(mus.label || "")}"></div>
      <button class="btn sm" data-act="savemusic" style="margin-top:12px">Save soundtrack</button>
      <p class="sq-ihint" style="margin-top:8px">Your squad sees this on the Squad tab. Clear the link to stop sharing.</p>`
      : `<p class="sq-ihint" style="margin:0">Music sharing is off. Turn on <b>Music</b> above to share a playlist with your squad.</p>`}
      </div>`;

    // data
    html += `<div class="subhead">Your data</div>`;
    html += `${hasSchedule() ? `<button class="linkbtn" data-act="ics">` : `<button class="linkbtn" data-act="ics" style="display:none">`}Add gym-day reminders to Calendar
        <small>Weekly alerts for each training day (.ics file for iPhone Calendar).</small></button>
      <button class="linkbtn" data-act="export">⬇︎ Back up my data
        <small>Download all your logs as a file you can keep safe.</small></button>
      <button class="linkbtn" data-act="importbtn">Restore from backup
        <small>Load a previously saved backup file.</small></button>
      <input id="importfile" type="file" accept="application/json" style="display:none">
      <button class="linkbtn" data-act="reset" style="border-color:#5a3030">Reset all data
        <small>Erase every log and start fresh. Cannot be undone.</small></button>
      <div class="subhead">Account</div>
      <div class="card"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Signed in as</div>
        <div style="font-family:var(--cond);font-size:16px;margin-top:3px">${esc(cachedUser()?.email || "—")}</div></div>
      <button class="linkbtn" data-act="logout" style="border-color:#5a3030">Log out</button>
      <div style="text-align:center;color:var(--dim);font-size:11px;margin-top:18px">
        No Limit — every muscle, every head, no excuses.</div>`;

    view().innerHTML = html;
  }

  /* ============================ PROFILE ============================ */
  function myWeekStreak() {
    const weeks = new Set(DB.logs.map(l => weekStartISO(parseYmd(l.date))));
    if (!weeks.size) return 0;
    let streak = 0, cur = weekStartISO();
    if (weeks.has(cur)) streak++;
    cur = prevWeekISO(cur);
    while (weeks.has(cur)) { streak++; cur = prevWeekISO(cur); }
    return streak;
  }
  const GOAL_LABELS = { lean_gain: "Lean gain", fat_loss: "Fat loss", strength: "Strength", maintain: "Maintain" };
  async function renderProfile() {
    const u = cachedUser();
    if (!PROFILE && u) {
      try { PROFILE = await getProfile(u.id); applyCloudPrivacy(PROFILE?.privacy); renderHeader(); } catch {}
      if (TAB !== "profile") return;                     // user navigated away while loading (AUDIT H1)
    }
    const p = PROFILE || {};
    const name = p.name || p.username || (u?.email || "Athlete").split("@")[0];
    const uname = p.username ? "@" + p.username : "";
    const init = (name.trim()[0] || "?").toUpperCase();

    const total = DB.logs.length;
    const lifted = []; const seen = new Set();
    DB.logs.forEach(l => Object.keys(l.entries).forEach(id => { if (!seen.has(id) && !isCardio(id)) { seen.add(id); lifted.push(id); } }));
    const prCount = lifted.filter(id => !!prFor(id)).length;
    const streak = myWeekStreak();
    const bw = DB.body.length ? DB.body[DB.body.length - 1].weight : null;
    const since = DB.logs.length ? DB.logs.map(l => l.date).sort()[0] : (u?.created_at || null);
    const sinceTxt = since ? (/^\d{4}-\d{2}-\d{2}$/.test(since) ? parseYmd(since) : new Date(since)).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—";
    const goalTxt = GOAL_LABELS[p.goal] || null;
    const mus = getMusic();
    const stat = (v, l) => `<div class="stat"><div class="n">${v}</div><div class="l">${l}</div></div>`;

    let html = `<div class="section-label">Your profile</div>
      <div class="prof-head">
        <button class="prof-av-btn" data-act="avatarpick" aria-label="Change photo">
          ${avatarMarkup(name, p.avatar_url, "prof-av")}<span class="av-cam"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span></button>
        <input type="file" id="avatar-file" accept="image/*" style="display:none">
        <div class="prof-id"><h1 class="prof-name">${esc(name)}</h1>
          ${uname ? `<div class="prof-handle">${esc(uname)}</div>` : ""}
          <div class="prof-since">Member since ${esc(sinceTxt)}</div></div>
        <button class="lb-r" data-act="editprofile">Edit</button>
      </div>
      <div class="prof-stats">
        ${stat(total, "Workouts")}
        ${stat(prCount, "PRs")}
        ${stat(String(streak || 0), "Week streak")}
        ${stat(bw != null ? bw + "<small>kg</small>" : "—", "Bodyweight")}
      </div>`;

    if (goalTxt || p.bw_target) {
      html += `<div class="subhead">Your goal</div><div class="card prof-goal">
        ${goalTxt ? `<span class="goal-chip">${esc(goalTxt)}</span>` : ""}
        ${(p.bw_current || p.bw_target) ? `<span class="goal-bw">${esc(String(p.bw_current || bw || "—"))}kg → <b>${esc(String(p.bw_target || "—"))}kg</b></span>` : ""}
      </div>`;
    }

    html += `<div class="subhead lb-head">Progress photos <span class="ph-note">Auto-delete after ${PHOTO_DAYS / 7} weeks</span></div>
      <div class="ph-grid" id="ph-mine"><button class="ph-add glass" data-act="photoadd" aria-label="Add a photo">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>Add</span></button></div>
      <input type="file" id="photo-file" accept="image/*" style="display:none">`;
    html += `<div class="subhead">Yours</div>
      <button class="linkbtn" data-act="gosquad">Your squad<small>Leaderboard, challenges, accountability</small></button>
      ${mus.url
        ? `<a class="linkbtn" href="${esc(safeMusicUrl(mus.url) || "#")}" target="_blank" rel="noopener noreferrer">${esc(mus.label || "Your soundtrack")}<small>Open your training playlist</small></a>`
        : `<button class="linkbtn" data-act="goplan">Set your soundtrack<small>Share a playlist with your squad</small></button>`}
      <button class="linkbtn" data-act="settings">Settings<small>Weekly goal, schedule, Spotify, privacy, your data, log out.</small></button>`;

    view().innerHTML = html;
    loadMyPhotos();
  }

  /* ---------- photo gallery (4-week lifespan, private or squad) ---------- */
  let MY_PHOTOS = [], SQUAD_PHOTOS = [], PENDING_PHOTO = null;
  const LOCK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const PEOPLE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.5" cy="9" r="2.2"/></svg>';
  const photoSetupMsg = (e) => /relation|exist|schema|bucket|not.?found/i.test(e?.message || "")
    ? "Photos need a one-time setup — run migrate_12.sql." : "Couldn't load photos — check your connection.";
  async function loadMyPhotos() {
    const grid = document.getElementById("ph-mine"); if (!grid) return;
    try { MY_PHOTOS = await listMyPhotos(cachedUser().id); }
    catch (e) { if (TAB === "profile") grid.insertAdjacentHTML("beforeend", `<div class="ph-msg">${photoSetupMsg(e)}</div>`); return; }
    if (TAB !== "profile" || !document.getElementById("ph-mine")) return;
    grid.insertAdjacentHTML("beforeend", MY_PHOTOS.map(r => `<button class="ph-tile" data-act="photoview" data-src="mine" data-id="${esc(r.id)}">
      <img src="${esc(r.url)}" alt="" loading="lazy"><span class="ph-badge">${r.visibility === "squad" ? PEOPLE : LOCK}${daysLeft(r)}d</span></button>`).join(""));
  }
  async function loadSquadPhotos() {
    const strip = document.getElementById("ph-squad"); if (!strip) return;
    try { SQUAD_PHOTOS = await listSquadPhotos(cachedUser().id); }
    catch (e) { strip.innerHTML = `<div class="ph-msg">${photoSetupMsg(e)}</div>`; return; }
    if (TAB !== "squad" || !document.getElementById("ph-squad")) return;
    strip.innerHTML = SQUAD_PHOTOS.length ? SQUAD_PHOTOS.map(r => `<button class="ph-tile sq" data-act="photoview" data-src="squad" data-id="${esc(r.id)}">
        <img src="${esc(r.url)}" alt="" loading="lazy"><span class="ph-who">${esc(r.who?.name || r.who?.username || "Member")}</span><span class="ph-badge">${daysLeft(r)}d</span></button>`).join("")
      : `<div class="ph-msg">Nothing shared this month. Post a progress or flex pic from your Profile and choose Squad.</div>`;
  }
  function openPhotoCompose(file) {
    PENDING_PHOTO = file;
    const url = URL.createObjectURL(file);
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box ph-compose"><div class="modal-head"><b>New photo</b><span class="mx" data-act="closemodal">✕</span></div>
      <img class="ph-prev" src="${url}" alt="">
      <div class="ph-opts"><small>Type</small><div class="seg" data-g="kind">
        <button class="seg-b on" data-act="phopt" data-g="kind" data-v="progress">Progress</button><button class="seg-b" data-act="phopt" data-g="kind" data-v="flex">Flex</button></div></div>
      <div class="ph-opts"><small>Who sees it</small><div class="seg" data-g="vis">
        <button class="seg-b on" data-act="phopt" data-g="vis" data-v="private">Only me</button><button class="seg-b" data-act="phopt" data-g="vis" data-v="squad">My squad</button></div></div>
      <input class="inp ph-cap" id="ph-cap" maxlength="140" placeholder="Caption (optional)">
      <p class="sq-ihint" style="margin:8px 0 12px">Deletes itself after ${PHOTO_DAYS / 7} weeks. Location data is stripped.</p>
      <button class="btn" data-act="photoup">Upload</button></div>`;
    document.body.appendChild(ov);
  }
  function openPhotoViewer(src, id) {
    const r = (src === "mine" ? MY_PHOTOS : SQUAD_PHOTOS).find(x => x.id === id); if (!r) return;
    const mine = src === "mine";
    const when = new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box ph-view"><div class="modal-head"><b>${mine ? (r.kind === "flex" ? "Flex" : "Progress") : esc(r.who?.name || r.who?.username || "Member")}</b><span class="mx" data-act="closemodal">✕</span></div>
      <img class="ph-full" src="${esc(r.url)}" alt="">
      ${r.caption ? `<p class="ph-capt">${esc(r.caption)}</p>` : ""}
      <p class="sq-ihint" style="margin:6px 0 12px">${esc(when)} · ${r.kind === "flex" ? "Flex" : "Progress"} · deletes in ${daysLeft(r)} day${daysLeft(r) === 1 ? "" : "s"}</p>
      ${mine ? `<div class="seg" style="margin-bottom:12px">
          <button class="seg-b${r.visibility === "private" ? " on" : ""}" data-act="phvis" data-id="${esc(r.id)}" data-v="private">Only me</button>
          <button class="seg-b${r.visibility === "squad" ? " on" : ""}" data-act="phvis" data-id="${esc(r.id)}" data-v="squad">My squad</button></div>
        <button class="btn ghost" data-act="phdel" data-id="${esc(r.id)}" style="color:#FF8A80">Delete now</button>` : ""}</div>`;
    document.body.appendChild(ov);
  }
  function openProfileEdit() {
    const p = PROFILE || {};
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box"><div class="modal-head"><b>Edit profile</b><span class="mx" data-act="closemodal">✕</span></div>
      <label class="fld"><span>Name</span><input id="pf-name" value="${esc(p.name || "")}" maxlength="40"></label>
      <label class="fld"><span>Username</span><input id="pf-user" value="${esc(p.username || "")}" maxlength="20" autocapitalize="none" placeholder="username"></label>
      <button class="btn" data-act="saveprofile" style="width:100%;margin-top:4px">Save</button></div>`;
    document.body.appendChild(ov);
    setTimeout(() => document.getElementById("pf-name")?.focus(), 30);
  }

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function openWeekEditor() {
    const opts = (sel) => `<option value="__rest" ${sel === "__rest" ? "selected" : ""}>No plan</option>` +
      SESSION_IDS.map(id => `<option value="${id}" ${sel === id ? "selected" : ""}>${esc(P.sessions[id].name)}</option>`).join("");
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box"><div class="modal-head"><b>Your week</b><span class="mx" data-act="closemodal">✕</span></div>
      <p class="sq-ihint" style="margin:0 0 12px">Optional. Give a workout a usual day and Train will suggest it — you can always pick something else on the day. Leave it all on "No plan" to choose each time.</p>
      <div class="wk-edit">` +
      WEEKDAYS.map((d, i) => {
        const c = P.cycle[i];
        const sel = c && c.type === "train" ? c.session : "__rest";
        return `<label class="wk-row"><span>${d}</span><select class="sel wk-sel" data-i="${i}">${opts(sel)}</select></label>`;
      }).join("") +
      `</div><button class="btn" data-act="saveweek" style="width:100%;margin-top:8px">Save schedule</button>
      <button class="btn ghost" data-act="clearweek" style="width:100%;margin-top:10px">No schedule — I'll pick on the day</button></div>`;
    document.body.appendChild(ov);
  }

  /* ============================ SQUAD ============================ */
  let LB_RANGE = 7;  // leaderboard window in days (0 = all time)
  function renderLeaderboard(ranked) {
    if (!ranked.length) return `<div class="empty" style="padding:14px">No workouts logged in this window yet.</div>`;
    const medal = i => String(i + 1);
    return ranked.map((r, i) => `<div class="lb-row">
      <span class="lb-rank">${medal(i)}</span>
      <span class="lb-name">${esc(r.name)}</span>
      <span class="lb-n">${r.n} workout${r.n === 1 ? "" : "s"}</span></div>`).join("");
  }
  function renderChallenges(challenges, allWp, isOwner, myId) {
    if (!challenges.length)
      return `<div class="card"><div class="empty" style="padding:16px">No challenges yet — set a squad goal to chase together.</div></div>`;
    return challenges.map(c => {
      const start = new Date(c.starts_on || c.created_at).getTime();
      const end = c.ends_on ? new Date(c.ends_on).getTime() : Infinity;
      const done = allWp.filter(p => { const t = new Date(p.created_at).getTime(); return t >= start && t <= end; }).length;
      const pct = c.target ? Math.min(100, Math.round(done / c.target * 100)) : 0;
      const complete = done >= c.target;
      const daysLeft = c.ends_on ? Math.max(0, Math.ceil((end - Date.now()) / 86400000)) : null;
      const canDel = isOwner || c.created_by === myId;
      return `<div class="card ch-card">
        <div class="ch-h"><b>${esc(c.title)}</b>${canDel ? `<span class="ch-x" data-act="delchallenge" data-id="${c.id}">✕</span>` : ""}</div>
        <div class="ch-meta">
          <span>${done} / ${c.target} workouts${complete ? " · smashed it" : ""}</span>
          <span>${daysLeft != null ? (daysLeft === 0 ? "ends today" : daysLeft + "d left") : "ongoing"}</span></div>
        <div class="ch-bar"><i class="${complete ? "done" : ""}" style="width:${pct}%"></i></div>
      </div>`;
    }).join("");
  }
  // consecutive pledged-and-hit weeks per user (current week counts only once hit;
  // an unhit current week doesn't break a prior streak — it's still in progress).
  function computeStreaks(commitsAll, allWp) {
    const wk = {};   // uid -> { weekStart -> workout count }
    allWp.forEach(p => {
      const ws = weekStartISO(new Date(p.created_at));
      (wk[p.user_id] ||= {})[ws] = ((wk[p.user_id] || {})[ws] || 0) + 1;
    });
    const cm = {};   // uid -> { weekStart -> target }
    commitsAll.forEach(c => { (cm[c.user_id] ||= {})[c.week_start] = c.target; });
    const thisWeek = weekStartISO();
    const streaks = {};
    Object.keys(cm).forEach(uid => {
      const hit = ws => cm[uid][ws] != null && (wk[uid]?.[ws] || 0) >= cm[uid][ws];
      let streak = 0, cur = thisWeek;
      if (hit(cur)) streak++;            // count current week only if already hit
      cur = prevWeekISO(cur);            // then walk back through completed weeks
      while (cm[uid][cur] != null) {
        if (hit(cur)) { streak++; cur = prevWeekISO(cur); }
        else break;
      }
      streaks[uid] = streak;
    });
    return streaks;
  }
  function renderAccountability(members, squadCommits, allWp, myCommit, myId, streaks) {
    const ws = new Date(weekStartISO() + "T00:00:00").getTime();
    const doneBy = {};
    allWp.filter(p => new Date(p.created_at).getTime() >= ws)
      .forEach(p => { doneBy[p.user_id] = (doneBy[p.user_id] || 0) + 1; });
    const commitBy = {};
    squadCommits.forEach(c => { commitBy[c.user_id] = c.target; });

    const streakTag = n => n > 0 ? `<span class="ac-streak">${n}-wk streak</span>` : "";
    const myTarget = myCommit?.target || 0;
    const myDone = doneBy[myId] || 0;
    const myStreak = (streaks && streaks[myId]) || 0;
    let mine;
    if (!myTarget) {
      mine = `<div class="card ac-set">
        <div class="ac-setx"><b>Set this week's commitment</b>
          <small>Pledge how many sessions you'll train — your squad holds you to it.${myStreak ? ` You're on a ${myStreak}-week streak — keep it alive.` : ""}</small></div>
        <button class="btn sm" data-act="setcommit" data-cur="">Pledge</button></div>`;
    } else {
      const pct = Math.min(100, Math.round(myDone / myTarget * 100));
      const hit = myDone >= myTarget;
      mine = `<div class="card">
        <div class="ac-mine-h"><b>Your pledge · ${myDone} / ${myTarget} this week${hit ? " · hit" : ""}</b>
          <span class="ac-mine-r">${streakTag(myStreak)}<button class="lb-r" data-act="setcommit" data-cur="${myTarget}">Edit</button></span></div>
        <div class="ch-bar"><i class="${hit ? "done" : ""}" style="width:${pct}%"></i></div></div>`;
    }

    const rows = members.map(m => {
      const uid = m.user_id || m.profiles?.id;
      const p = m.profiles || {};
      const nm = p.name || p.username || "Member";
      const tgt = commitBy[uid] || 0;
      const done = doneBy[uid] || 0;
      const isMe = uid === myId;
      let status, cls, behind = false;
      if (!tgt) { status = "no pledge"; cls = "none"; }
      else if (done >= tgt) { status = `${done}/${tgt} hit`; cls = "hit"; }
      else { status = `${done}/${tgt}`; cls = (done >= tgt * 0.5 ? "mid" : "behind"); behind = true; }
      const nudge = (behind && !isMe)
        ? `<button class="ac-nudge" data-act="nudge" data-name="${esc(nm)}">Nudge</button>` : "";
      return `<div class="ac-row">
        ${avatarMarkup(nm, p.avatar_url, "sq-av sm")}
        <span class="ac-nm">${esc(nm)}${isMe ? " <small>(you)</small>" : ""}${streakTag(streaks && streaks[uid])}</span>
        ${nudge}<span class="ac-st ${cls}">${status}</span></div>`;
    }).join("");

    return `${mine}<div class="card">${rows || '<div class="empty">No members yet.</div>'}</div>`;
  }
  function renderSquadMusic(members) {
    const items = members.map(m => {
      const p = m.profiles || {};
      const url = safeMusicUrl(p.music_url);
      if (!url) return "";
      const nm = p.name || p.username || "Member";
      return `<a class="mus-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        ${avatarMarkup(nm, p.avatar_url, "sq-av sm")}
        <span class="mus-info"><b>${esc(nm)}</b><small>${esc(p.music_label || "Training playlist")}</small></span>
        <span class="mus-play">▶</span></a>`;
    }).filter(Boolean).join("");
    if (!items) return "";
    return `<div class="subhead">What we train to</div><div class="card mus-card">${items}</div>`;
  }
  async function openSpotifyPicker() {
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box"><div class="modal-head"><b>Pick a playlist</b><span class="mx" data-act="closemodal">✕</span></div>
      <div class="spot-list"><div class="empty" style="padding:22px">Loading your playlists…</div></div></div>`;
    document.body.appendChild(ov);
    const list = ov.querySelector(".spot-list");
    try {
      const pls = await getSpotifyPlaylists();
      if (!pls.length) { list.innerHTML = `<div class="empty" style="padding:22px">No playlists found on your account.</div>`; return; }
      list.innerHTML = pls.map(p => `<button class="spot-item" data-url="${esc(p.url || "")}" data-name="${esc(p.name)}">
        ${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="spot-ph">♪</span>`}
        <span class="spot-meta"><b>${esc(p.name)}</b><small>${p.tracks != null ? p.tracks + " tracks" : "playlist"}</small></span></button>`).join("");
      list.querySelectorAll(".spot-item").forEach(it => it.addEventListener("click", () => {
        const url = it.dataset.url, name = it.dataset.name;
        if (!url) { toast("That playlist has no shareable link"); return; }
        setMusic(cachedUser().id, url, name)
          .then(() => { ov.remove(); toast("Soundtrack set"); if (TAB === "settings") renderSettings(); else if (TAB === "plan") renderPlan(); })
          .catch(e => toast(/column|music_url|schema/i.test(e?.message || "") ? "Run migrate_8.sql first" : "Couldn't save"));
      }));
    } catch (e) {
      const m = e?.message || "";
      let msg;
      if (/not-connected|expired|api-401/.test(m)) msg = "Spotify session expired — disconnect and reconnect.";
      else if (/api-403/.test(m)) msg = "Spotify blocked this (403). Your app is in Development mode — add your Spotify account under the app's User Management in the Spotify dashboard, then reconnect.";
      else msg = "Couldn't load playlists" + (m ? " (" + esc(m) + ")" : "") + ".";
      list.innerHTML = `<div class="empty" style="padding:22px;line-height:1.5">${msg}</div>`;
    }
  }
  function openChallengeModal() {
    const ov = document.createElement("div");
    ov.className = "modal";
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><b>New challenge</b><span class="mx" data-act="closemodal">✕</span></div>
      <label class="fld"><span>Title</span><input id="ch-title" placeholder="e.g. 20 workouts this month" maxlength="60"></label>
      <div class="ch-row">
        <label class="fld"><span>Target (combined workouts)</span><input id="ch-target" type="number" inputmode="numeric" value="20" min="1"></label>
        <label class="fld"><span>Days</span><input id="ch-days" type="number" inputmode="numeric" value="30" min="1"></label>
      </div>
      <button class="btn" data-act="savechallenge" style="width:100%;margin-top:4px">Create challenge</button></div>`;
    document.body.appendChild(ov);
    setTimeout(() => document.getElementById("ch-title")?.focus(), 30);
  }
  let SQUAD_TOKEN = 0;
  async function renderSquad() {
    const u = cachedUser();
    const token = ++SQUAD_TOKEN;
    // the user may have moved to another tab while this loaded — never paint over it (AUDIT H1)
    const stale = () => token !== SQUAD_TOKEN || TAB !== "squad";
    view().innerHTML = `<div class="section-label">Your people</div><h1 class="h-title">Squad</h1>
      <div class="card"><div class="skel skel-row" style="width:55%"></div><div class="skel skel-row" style="width:80%"></div></div>
      <div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card" style="width:70%"></div>`;
    let squad;
    try { squad = await getMySquad(u.id); }
    catch (e) {
      if (stale()) return;
      view().innerHTML = `<div class="section-label">Your people</div><h1 class="h-title">Squad</h1>
        <div class="empty">Couldn't load your squad — check your connection and try again.</div>`;
      return;
    }
    if (stale()) return;
    setCurrentSquad(squad?.id);   // keep workout posts + pledges pointed at the right squad (AUDIT H6)
    if (!squad) return renderSquadJoin();

    // independent reads in parallel (was 8 sequential round-trips — AUDIT M10)
    const safe = (p, fallback) => p.catch(() => fallback);
    const [members, feed, allWp, challenges, myCommit, commitsAll] = await Promise.all([
      safe(getMembers(squad.id), []), safe(getFeed(squad.id), []), safe(getWorkoutPosts(squad.id, null), []),
      safe(getChallenges(squad.id), []), safe(getMyCommitment(u.id), null), safe(getSquadCommitmentsAll(squad.id), []),
    ]);
    if (stale()) return;
    const thisWeek = weekStartISO();
    const squadCommits = commitsAll.filter(c => c.week_start === thisWeek);
    const streaks = computeStreaks(commitsAll, allWp);
    let ranked = [];
    {
      const cut = LB_RANGE ? Date.now() - LB_RANGE * 86400000 : 0;
      const counts = {};
      allWp.filter(p => new Date(p.created_at).getTime() >= cut)
        .forEach(p => { (counts[p.user_id] ||= { name: p.profiles?.name || p.profiles?.username || "Member", n: 0 }).n++; });
      ranked = Object.values(counts).sort((a, b) => b.n - a.n);
    }
    const isOwner = members.some(m => m.role === "owner" && (m.user_id === u.id || m.profiles?.id === u.id));
    const memberRows = members.map(m => {
      const p = m.profiles || {};
      const nm = p.name || p.username || "Member";
      return `<div class="sq-member">
        ${avatarMarkup(nm, p.avatar_url, "sq-av")}
        <span class="sq-mn"><b>${esc(nm)}</b><small>@${esc(p.username || "")}</small></span>
        ${m.role === "owner" ? '<span class="sq-role">Owner</span>' : ""}</div>`;
    }).join("");

    view().innerHTML = `<div class="section-label">Your squad</div><h1 class="h-title">${esc(squad.name)}</h1>
      <p class="h-sub">${members.length} member${members.length === 1 ? "" : "s"} · train together, stay accountable.</p>
      <div class="card">
        <div class="sq-invite"><div><div class="sq-ilabel">Invite code</div><div class="sq-code">${esc(squad.invite_code)}</div></div>
          <button class="btn sm" data-act="copyinvite" data-code="${esc(squad.invite_code)}">Copy</button></div>
        <p class="sq-ihint">Share this code — friends enter it in Squad → Join to train with you.</p>
      </div>
      <div class="subhead">Members</div>
      <div class="card">${memberRows || '<div class="empty">No members yet.</div>'}</div>
      <div class="subhead lb-head">Squad gallery <span class="ph-note">Last 4 weeks</span></div>
      <div class="ph-strip" id="ph-squad"><div class="skel skel-card" style="width:120px;height:160px"></div></div>
      <div class="subhead">Accountability · this week</div>
      ${renderAccountability(members, squadCommits, allWp, myCommit, u.id, streaks)}
      <div class="subhead lb-head">Leaderboard
        <span class="lb-range">${[[7, "7D"], [30, "30D"], [0, "All"]].map(([v, l]) => `<button class="lb-r ${(LB_RANGE || 0) === v ? "on" : ""}" data-act="lbrange" data-d="${v}">${l}</button>`).join("")}</span></div>
      <div class="card">${renderLeaderboard(ranked)}</div>
      <div class="subhead lb-head">Challenges
        <button class="lb-r" data-act="newchallenge">+ New</button></div>
      ${renderChallenges(challenges, allWp, isOwner, u.id)}
      ${renderSquadMusic(members)}
      <div class="subhead">Squad activity</div>
      <div class="feed">${renderFeedPosts(feed, u.id)}</div>
      <button class="linkbtn" data-act="leavesquad" data-sid="${esc(squad.id)}" style="border-color:#5a3030;margin-top:14px">Leave squad</button>`;
    loadSquadPhotos();
  }

  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function renderFeedPosts(feed, myId) {
    if (!feed.length) return `<div class="empty" style="padding:18px">No activity yet — log a workout to kick it off.</div>`;
    return feed.map(p => {
      const name = p.profiles?.name || p.profiles?.username || "Someone";
      const text = p.type === "workout"
        ? `completed <b>${esc(p.data?.title || "a workout")}</b>${p.data?.exercises ? ` · ${p.data.exercises} exercise${p.data.exercises === 1 ? "" : "s"}` : ""}`
        : `<b>${esc(p.data?.title || "did something")}</b>`;
      const reax = p.activity_reactions || [];
      const btns = REACTIONS.map(e => {
        const n = reax.filter(r => r.emoji === e).length;
        const mine = reax.some(r => r.emoji === e && r.user_id === myId);
        return `<button class="reax ${mine ? "on" : ""}" data-act="react" data-pid="${p.id}" data-emoji="${e}">${e}${n ? " " + n : ""}</button>`;
      }).join("");
      return `<div class="feed-post">
        <div class="feed-h">${avatarMarkup(name, p.profiles?.avatar_url, "sq-av sm")}
          <span class="feed-t"><b>${esc(name)}</b> ${text}<small>${timeAgo(p.created_at)}</small></span></div>
        <div class="feed-reax">${btns}</div></div>`;
    }).join("");
  }

  function renderSquadJoin() {
    view().innerHTML = `<div class="section-label">Your people</div><h1 class="h-title">Squad</h1>
      <p class="h-sub">Train with your friends. Create a squad or join one with a code.</p>
      <div class="card"><div class="field"><label>Create a squad</label>
        <input id="sq-name" placeholder="e.g. The Grind" autocapitalize="words"></div>
        <button class="btn sm" data-act="createsquad">Create squad</button></div>
      <div class="card"><div class="field"><label>Join with an invite code</label>
        <input id="sq-join" placeholder="6-character code" autocapitalize="characters" maxlength="6"></div>
        <button class="btn sm ghost" data-act="joinsquad">Join squad</button></div>`;
  }

  /* ============================ downloads ============================ */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }
  function icsStamp(d) {
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") +
      String(d.getUTCDate()).padStart(2, "0") + "T" +
      String(d.getUTCHours()).padStart(2, "0") + String(d.getUTCMinutes()).padStart(2, "0") + "00Z";
  }
  function buildICS() {
    const now = icsStamp(new Date());
    let out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Empire//Gym Tracker//EN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    P.cycle.forEach((c, p) => {
      if (c.type !== "train") return;
      const s = P.sessions[c.session];
      const d = nextDateForPos(p);
      const start = ymd(d).replace(/-/g, "") + "T070000"; // 07:00 local, floating
      out.push("BEGIN:VEVENT",
        `UID:${c.session}-${d.getTime()}@empire-gym`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        "DURATION:PT1H",
        "RRULE:FREQ=WEEKLY",
        `SUMMARY:🏋️ Gym — ${s.full}`,
        `DESCRIPTION:${s.sub} — ${s.exercises.length} exercises. Log it in your Gym Tracker.`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:Gym day — ${s.name}`, "TRIGGER:PT0S", "END:VALARM",
        "END:VEVENT");
    });
    out.push("END:VCALENDAR");
    return out.join("\r\n");
  }

  /* ============================ event delegation ============================ */
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "start" || act === "pick") {
      ACTIVE = el.dataset.s; go("train");
      if (act === "start" && !getLog(todayStr(), ACTIVE)) maybeAutoplay();
    }
    else if (act === "picker") { ACTIVE = null; renderPicker(); }
    else if (act === "gotrain") { ACTIVE = null; go("train"); }
    else if (act === "quickstart") { startQuick(); if (!getLog(todayStr(), "quick")) maybeAutoplay(); }
    else if (act === "tchip") {
      const id = el.dataset.id;
      PICKSEL = PICKSEL.includes(id) ? PICKSEL.filter(x => x !== id) : [...PICKSEL, id];
      el.classList.toggle("on", PICKSEL.includes(id));
      const b = document.getElementById("tgo"); b.disabled = !PICKSEL.length; b.textContent = pickLabel();
    }
    else if (act === "tgo") { if (startPicked() && !getLog(todayStr(), ACTIVE)) maybeAutoplay(); }
    else if (act === "axadd") { const ex = toEx(el.dataset.k); if (ex) addToWorkout(ex); }
    else if (act === "axcreate") {
      const groups = groupsOf(ACTIVE);
      if (!groups.length) { openExercisePicker(ex => addToWorkout(ex)); return; }
      addCustomExercise(cachedUser()?.id, { name: el.dataset.q, group: groups[0] })
        .then(c => addToWorkout({ id: c.key, name: c.name, target: c.group, sets: c.sets, reps: c.reps, custom: true, ...(c.cardio ? { cardio: true } : {}) }))
        .catch(() => toast("Couldn't create that exercise"));
    }
    else if (act === "finish") finishWorkout();
    else if (act === "gohome") go("today");
    else if (act === "settings") go("settings");
    else if (act === "photoadd") document.getElementById("photo-file")?.click();
    else if (act === "photoview") openPhotoViewer(el.dataset.src, el.dataset.id);
    else if (act === "phopt") el.parentElement.querySelectorAll(".seg-b").forEach(b => b.classList.toggle("on", b === el));
    else if (act === "photoup" && PENDING_PHOTO) {
      const box = el.closest(".modal-box");
      const kind = box.querySelector('[data-g="kind"].on')?.dataset.v || "progress";
      const visibility = box.querySelector('[data-g="vis"].on')?.dataset.v || "private";
      const caption = box.querySelector("#ph-cap").value || "";
      el.disabled = true; el.textContent = "Uploading…";
      uploadPhoto(cachedUser().id, PENDING_PHOTO, { kind, visibility, caption })
        .then(() => { PENDING_PHOTO = null; el.closest(".modal")?.remove(); toast(visibility === "squad" ? "Shared with your squad" : "Saved — only you can see it"); if (TAB === "profile") renderProfile(); })
        .catch(e => { el.disabled = false; el.textContent = "Upload"; toast(/relation|exist|bucket|not.?found|policy|row-level/i.test(e?.message || "") ? "Run migrate_12.sql first" : "Couldn't upload that photo"); });
    }
    else if (act === "phvis") {
      setPhotoVisibility(el.dataset.id, el.dataset.v)
        .then(() => {
          const r = MY_PHOTOS.find(x => x.id === el.dataset.id); if (r) r.visibility = el.dataset.v;
          el.parentElement.querySelectorAll(".seg-b").forEach(b => b.classList.toggle("on", b === el));
          toast(el.dataset.v === "squad" ? "Now visible to your squad" : "Now private");
          if (TAB === "profile") renderProfile();
        })
        .catch(() => toast("Couldn't change that — try again"));
    }
    else if (act === "phdel") {
      const r = MY_PHOTOS.find(x => x.id === el.dataset.id); if (!r || !confirm("Delete this photo now?")) return;
      deletePhoto(r).then(() => { el.closest(".modal")?.remove(); toast("Photo deleted"); if (TAB === "profile") renderProfile(); })
        .catch(() => toast("Couldn't delete — try again"));
    }
    else if (act === "addex") openExercisePicker(ex => addToWorkout(ex));
    else if (act === "exrm") {
      // today only — the usual list is edited in Plan, and logged sets are only saved on Save
      const s = daySession(ACTIVE);
      s.exercises = s.exercises.filter(x => x.id !== el.dataset.ex);
      persistDay();
      el.closest(".ex")?.remove();
      document.getElementById("tp-of").textContent = s.exercises.length;
      paintTrainProgress();
      scheduleAutosave();
    }
    else if (act === "exhist") openExerciseHistory(el.dataset.ex);
    else if (act === "restskip") stopRest();
    else if (act === "restadj" && REST) {
      REST.endsAt += Number(el.dataset.d) * 1000;
      REST.total = Math.max(REST.total, Math.ceil((REST.endsAt - Date.now()) / 1000));
      if (REST.endsAt > Date.now()) REST.done = false;
      paintRest();
    }
    else if (act === "addset") {
      const rows = document.querySelector(`.ex[data-ex="${el.dataset.ex}"] .rows`);
      rows.insertAdjacentHTML("beforeend", setRowHtml(el.dataset.ex, rows.children.length, null));
      paintTrainProgress();
    }
    else if (act === "delset") {
      const row = el.closest(".set-row"); const rows = row.parentElement;
      row.remove();
      [...rows.children].forEach((r, i) => r.querySelector(".sn").textContent = i + 1);
      paintTrainProgress();
      scheduleAutosave();
    }
    else if (act === "savebw") {
      const v = parseFloat(document.getElementById("bw").value);
      if (isNaN(v) || v <= 0 || v > 500) { toast("Enter a valid weight in kg"); return; }
      const t = todayStr(); let rec = DB.body.find(b => b.date === t);
      if (rec) rec.weight = v; else { rec = { date: t, weight: v }; DB.body.push(rec); }
      DB.body.sort((a, b) => (a.date < b.date ? -1 : 1));
      renderLog();
      saveAndSync("body", rec, "Weight saved");
    }
    else if (act === "savemacro") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : Math.max(0, v); };
      const t = todayStr(); let m = DB.macros.find(x => x.date === t);
      if (!m) { m = { date: t }; DB.macros.push(m); }
      m.kcal = num("kcal"); m.protein = num("prot"); m.carbs = num("carbs"); m.fats = num("fats");
      DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1));
      renderLog();
      saveAndSync("macro", m, "Fuel logged");
    }
    else if (act === "addmeal") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : Math.max(0, v); };
      const ml = { name: (document.getElementById("ml-name").value || "").trim() || "Meal",
        kcal: num("ml-kcal"), protein: num("ml-prot"), carbs: num("ml-carbs"), fats: num("ml-fats") };
      if (!ml.kcal && !ml.protein && !ml.carbs && !ml.fats) { toast("Enter the meal's macros"); return; }
      const t = todayStr(); let m = DB.macros.find(x => x.date === t);
      if (!m) { m = { date: t, kcal: 0, protein: 0, carbs: 0, fats: 0 }; DB.macros.push(m); }
      m.meals = m.meals || [];
      m.meals.push(ml);
      m.kcal = (m.kcal || 0) + ml.kcal; m.protein = (m.protein || 0) + ml.protein;
      m.carbs = (m.carbs || 0) + ml.carbs; m.fats = (m.fats || 0) + ml.fats;
      DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1));
      renderLog();
      saveAndSync("macro", m, "Meal added");
    }
    else if (act === "delmeal") {
      const idx = +el.dataset.idx, t = todayStr(), m = DB.macros.find(x => x.date === t);
      if (m && m.meals && m.meals[idx]) {
        const ml = m.meals.splice(idx, 1)[0];
        m.kcal = Math.max(0, (m.kcal || 0) - ml.kcal); m.protein = Math.max(0, (m.protein || 0) - ml.protein);
        m.carbs = Math.max(0, (m.carbs || 0) - ml.carbs); m.fats = Math.max(0, (m.fats || 0) - ml.fats);
        renderLog();
        saveAndSync("macro", m, "Meal removed");
      }
    }
    else if (act === "edittargets") editTargets();
    else if (act === "savetargets") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : Math.max(0, v); };
      const tg = { kcal: num("tg-kcal"), protein: num("tg-prot"), carbs: num("tg-carbs"), fats: num("tg-fats") };
      setActiveTargets(tg);
      const mo = el.closest(".modal"); if (mo) mo.remove();
      renderLog();
      const u = cachedUser();
      if (u) saveTargets(u.id, tg).then(r => toast(r.synced ? "Targets updated" : "Targets saved on this device — will sync when online"));
      else toast("Targets updated");
    }
    else if (act === "ics") { download("gym-reminders.ics", buildICS(), "text/calendar"); toast("Open the file to add to Calendar"); }
    else if (act === "export") { download("gym-backup-" + todayStr() + ".json", JSON.stringify(DB, null, 2), "application/json"); toast("Backup downloaded"); }
    else if (act === "importbtn") { document.getElementById("importfile").click(); }
    else if (act === "reset") {
      // used to clear only this device — the next launch restored everything from the cloud (AUDIT H7)
      if (!confirm("Erase ALL your workouts, bodyweight and nutrition logs — in the cloud and on this device?\n\nThis cannot be undone. Back up your data first if you might want it.")) return;
      const u = cachedUser();
      (u ? deleteAllHistory(u.id) : Promise.resolve())
        .then(() => { localStorage.removeItem(KEY); DB = load(); toast("All data erased"); go("today"); })
        .catch(() => toast("Couldn't reach the cloud — nothing was erased. Try again when online."));
    }
    else if (act === "hideinstall") { DB.settings.hideInstall = true; save(); renderToday(); }
    else if (act === "weekly") { showReport(); }
    else if (act === "closemodal") { const m = el.closest(".modal"); if (m) m.remove(); }
    else if (act === "copyreport") {
      const m = el.closest(".modal"); const txt = m ? m._text : "";
      const done = () => toast("Copied — paste it in your chat");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done).catch(() => { m.querySelector(".report").select(); document.execCommand("copy"); done(); });
      } else { m.querySelector(".report").select(); document.execCommand("copy"); done(); }
    }
    else if (act === "dlreport") {
      const m = el.closest(".modal");
      download("weekly-review-" + todayStr() + ".txt", m ? m._text : "", "text/plain");
      toast("Downloaded");
    }
    else if (act === "gofuel") {
      go("plan");
      setTimeout(() => {
        const heads = [...document.querySelectorAll(".subhead")];
        const target = heads.find(h => h.textContent.indexOf("Daily fuel") === 0);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
    else if (act === "logout") {
      if (confirm("Log out of No Limit?")) signOut().then(() => location.reload());
    }
    else if (act === "profile") go("profile");
    else if (act === "gosquad") go("squad");
    else if (act === "goplan") go("plan");
    else if (act === "goprogress") go("progress");
    else if (act === "editprofile") openProfileEdit();
    else if (act === "avatarpick") document.getElementById("avatar-file")?.click();
    else if (act === "weekedit") openWeekEditor();
    else if (act === "clearweek") {
      document.querySelectorAll(".wk-sel").forEach(s => { s.value = "__rest"; });
      document.querySelector('[data-act="saveweek"]')?.click();
    }
    else if (act === "setgoal") {
      P.goal = Number(el.dataset.n);
      saveProgrammeQuiet();
      document.querySelectorAll(".goal-chip").forEach(c => c.classList.toggle("on", c === el));
      toast(`Goal: ${P.goal} session${P.goal === 1 ? "" : "s"} a week`);
    }
    else if (act === "saveweek") {
      const cycle = [...document.querySelectorAll(".wk-sel")]
        .map(s => s.value === "__rest" ? { type: "rest" } : { type: "train", session: s.value });
      const prog = getActiveProgramme();
      el.disabled = true;
      const u = cachedUser();
      (u ? saveProgramme(u.id, progData({ cycle })) : Promise.resolve({ synced: true }))
        .then(r => {
          toast(r.synced ? "Week saved" : "Week saved on this device — it'll sync when you're back online");
          setTimeout(() => location.reload(), 650);
        });
    }
    else if (act === "saveprofile") {
      const name = (document.getElementById("pf-name")?.value || "").trim();
      const username = (document.getElementById("pf-user")?.value || "").trim().replace(/[^a-z0-9_]/gi, "");
      if (!name) { toast("Add a name"); return; }
      el.disabled = true;
      updateProfileBasics(cachedUser().id, { name, username: username || null })
        .then(() => { PROFILE = { ...(PROFILE || {}), name, username: username || null }; el.closest(".modal")?.remove(); renderHeader(); toast("Profile updated"); renderProfile(); })
        .catch(e => { el.disabled = false; toast(/duplicate|unique/i.test(e?.message || "") ? "That username is taken" : "Couldn't save"); });
    }
    else if (act === "history") renderHistory();
    else if (act === "backprogress") go("progress");
    else if (act === "createsquad") {
      const name = (document.getElementById("sq-name").value || "").trim();
      if (!name) { toast("Name your squad"); return; }
      createSquad(name).then(() => { toast("Squad created"); renderSquad(); })
        .catch(e => toast(/relation|exist|function|schema/i.test(e.message || "") ? "Run migrate_4.sql first" : "Couldn't create squad"));
    }
    else if (act === "joinsquad") {
      const code = (document.getElementById("sq-join").value || "").trim();
      if (!code) { toast("Enter a code"); return; }
      joinSquad(code).then(() => { toast("Joined the squad"); renderSquad(); })
        .catch(e => toast(/invalid/i.test(e.message || "") ? "Invalid invite code" : "Couldn't join"));
    }
    else if (act === "leavesquad") {
      if (confirm("Leave this squad?"))
        leaveSquad(el.dataset.sid, cachedUser().id).then(() => { setCurrentSquad(null); toast("Left squad"); renderSquad(); }).catch(() => toast("Couldn't leave"));
    }
    else if (act === "copyinvite") {
      const code = el.dataset.code;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => toast("Code copied")).catch(() => toast("Code: " + code));
      else toast("Code: " + code);
    }
    else if (act === "react") {
      toggleReaction(el.dataset.pid, cachedUser().id, el.dataset.emoji).then(() => renderSquad()).catch(() => {});
    }
    else if (act === "lbrange") { LB_RANGE = parseInt(el.dataset.d, 10) || 0; renderSquad(); }
    else if (act === "newchallenge") openChallengeModal();
    else if (act === "savechallenge") {
      const title = (document.getElementById("ch-title")?.value || "").trim();
      const target = parseInt(document.getElementById("ch-target")?.value, 10) || 0;
      const days = parseInt(document.getElementById("ch-days")?.value, 10) || 30;
      if (!title) { toast("Give it a title"); return; }
      if (!target) { toast("Set a target"); return; }
      const sid = getCurrentSquad();
      if (!sid) { toast("No squad found"); return; }
      el.disabled = true;
      createChallenge(sid, cachedUser().id, title, target, days)
        .then(() => { el.closest(".modal")?.remove(); toast("Challenge created"); renderSquad(); })
        .catch(e => { el.disabled = false; toast(/relation|exist|schema/i.test(e?.message || "") ? "Run migrate_6.sql in Supabase first" : "Couldn't create challenge"); });
    }
    else if (act === "delchallenge") {
      if (confirm("Delete this challenge?")) deleteChallenge(el.dataset.id).then(() => renderSquad()).catch(() => toast("Couldn't delete"));
    }
    else if (act === "setcommit") {
      const v = prompt("How many sessions will you train this week?", el.dataset.cur || "4");
      if (v === null) return;
      const t = parseInt(v, 10);
      if (!t || t < 1) { toast("Enter a number of 1 or more"); return; }
      setCommitment(cachedUser().id, getCurrentSquad(), t)
        .then(() => { toast("Locked in"); renderSquad(); })
        .catch(e => toast(/relation|exist|schema/i.test(e?.message || "") ? "Run migrate_7.sql first" : "Couldn't save"));
    }
    else if (act === "nudge") {
      const name = el.dataset.name || "your squad-mate";
      el.disabled = true;
      postActivity(cachedUser().id, getCurrentSquad(), "nudge", { title: `nudged ${name} to show up` })
        .then(() => { toast("Nudge sent"); renderSquad(); })
        .catch(() => { el.disabled = false; toast("Couldn't send nudge"); });
    }
    else if (act === "togglepriv") {
      const key = el.dataset.key;
      const next = !getPrivacy()[key];
      setPrivacy(cachedUser().id, { [key]: next });
      if (key === "music" && !next) setMusic(cachedUser().id, "", "").catch(() => {}); // unshare on opt-out
      renderSettings();
    }
    else if (act === "spoton") { connectSpotify().catch(() => toast("Spotify isn't set up yet")); }
    else if (act === "spotoff") { disconnectSpotify(); toast("Spotify disconnected"); renderSettings(); }
    else if (act === "spotpick") { openSpotifyPicker(); }
    else if (act === "aptoggle") {
      const on = !autoplayOn();
      try { localStorage.setItem(AP_KEY, on ? "on" : "off"); } catch {}
      el.classList.toggle("on", on);
      toast(on ? "Auto-play on — Start plays your soundtrack" : "Auto-play off");
    }
    else if (act === "savemusic") {
      const url = (document.getElementById("mus-url")?.value || "").trim();
      const label = (document.getElementById("mus-label")?.value || "").trim();
      if (url && !safeMusicUrl(url)) { toast("Enter a valid http(s) link"); return; }
      el.disabled = true;
      setMusic(cachedUser().id, url, label)
        .then(() => { toast(url ? "Soundtrack saved" : "Soundtrack cleared"); if (TAB === "settings") renderSettings(); else if (TAB === "plan") renderPlan(); })
        .catch(e => { el.disabled = false; toast(/column|music_url|schema/i.test(e?.message || "") ? "Run migrate_8.sql first" : "Couldn't save"); });
    }
  });

  document.addEventListener("change", function (e) {
    // file inputs (avatar, backup restore) carry an id, not data-act — fall back to the target itself
    const el = e.target.closest("[data-act]") || e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.act === "liftsel") { ACTIVE_LIFT = el.value; document.getElementById("liftchart").innerHTML = liftChart(el.value); }
    else if (el.id === "avatar-file" && el.files[0]) {
      const file = el.files[0]; el.value = "";
      toast("Uploading photo…");
      uploadAvatar(cachedUser().id, file)
        .then(url => { PROFILE = { ...(PROFILE || {}), avatar_url: url }; renderHeader(); toast("Photo updated"); if (TAB === "profile") renderProfile(); })
        .catch(e => toast(/bucket|not.?found|exist|policy|denied|row-level|violates/i.test(e?.message || "") ? "Run migrate_9.sql first" : "Couldn't upload that image"));
    }
    else if (el.id === "photo-file" && el.files[0]) {
      const f = el.files[0]; el.value = "";
      if (!/^image\//.test(f.type || "image/")) { toast("Pick an image"); return; }
      openPhotoCompose(f);
    }
    else if (el.id === "importfile" && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d || !Array.isArray(d.logs)) throw new Error("not a backup");
          DB = Object.assign(blank(), d, { settings: { ...DB.settings, ...(d.settings || {}) } });
          // queue everything for upload — a restore used to be local-only and vanish on next launch (AUDIT H7)
          for (const list of [DB.logs, DB.body, DB.macros]) for (const rec of list) { rec.rev = (rec.rev || 0) + 1; rec.synced = false; }
          save(); go("today"); toast("Backup restored — syncing to your account…");
          syncPending();
        } catch (err) { toast("Couldn't read that file — is it a NO LIMIT backup?"); }
      };
      r.readAsText(el.files[0]);
    }
  });

  document.querySelectorAll(".tabbar button").forEach(b =>
    b.addEventListener("click", () => { if (b.dataset.tab === "train") ACTIVE = null; go(b.dataset.tab); }));

  /* ---------- boot ---------- */
  renderHeader();
  if (cachedUser()) getProfile(cachedUser().id).then(pr => {
    PROFILE = pr; applyCloudPrivacy(pr?.privacy); renderHeader();
    if (TAB === "today") renderToday();
  }).catch(() => {});
  go("today");
  syncPending();                                          // retry anything saved offline earlier
}
