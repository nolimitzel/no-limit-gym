/* ==========================================================================
   NO LIMIT — Gym Tracker  (offline, on-device PWA)
   ========================================================================== */
import { signOut, cachedUser, hasLiveSession } from "./auth/auth.js";
import { pushWorkout, pushBodyweight, pushMacros, deleteAllHistory } from "./data/cloudStore.js";
import { getActiveProgramme, exMeta as resolveExercise } from "./data/programme.js";
import { esc } from "./ui/safeRender.js";
import * as H from "./core/history.js";
import { weekdayPos, isSessionReferenced, weeklyGoal, comboParts, comboKey } from "./core/programme.js";
import { missingPosts } from "./core/posts.js";
import { getActiveTargets, saveTargets, setActiveTargets } from "./data/targets.js";
import { saveProgramme, defaultProgrammeData } from "./data/programmeStore.js";
import { getMySquad, getMembers, createSquad, joinSquad, leaveSquad } from "./data/squad.js";
import { getProfile, updateProfileBasics } from "./auth/profile.js";
import { uploadAvatar } from "./data/storage.js";
import { uploadPhoto, listMyPhotos, listSquadPhotos, setPhotoVisibility, deletePhoto, purgeExpiredPhotos, daysLeft, PHOTO_DAYS } from "./data/photos.js";
import { libExercise, EXERCISE_LIBRARY, MUSCLE_GROUPS } from "./data/exerciseLibrary.js";
import { FOOD_LIBRARY, FOOD_CATS, libFood, STARTER_MEALS } from "./data/foods.js";
import { SUPP_LIBRARY, SUPP_CATS, libSupp, ESSENTIALS } from "./data/supplements.js";
import { mealTotals, foodMacros, PORTIONS, portionLabel, suppAdherence } from "./core/nutrition.js";
import { getCustomExercises, addCustomExercise, updateCustomExercise } from "./data/customExercises.js";
import { normalizeSupersets, linkSuperset, unlinkSuperset, supersetLabels } from "./core/superset.js";
import { getCurrentSquad, setCurrentSquad, postActivity, getMyWorkoutPosts, getFeed, getWorkoutPosts, toggleReaction, REACTIONS,
  getChallenges, createChallenge, deleteChallenge } from "./data/social.js";
import { getPrivacy, setPrivacy, applyCloudPrivacy } from "./data/privacy.js";
import { getMyCommitment, setCommitment, getSquadCommitmentsAll, weekStartISO, prevWeekISO } from "./data/commitments.js";
import { getMusic, setMusic, safeMusicUrl } from "./data/music.js";
import { spotifyLink } from "./core/playlist.js";
import { playlistMeta } from "./data/playlistMeta.js";
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
  const progData = (over = {}) => ({ sessions: P.sessions, cycle: P.cycle, ...(P.goal ? { goal: P.goal } : {}), ...(P.nut ? { nut: P.nut } : {}), ...over });
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
    if (!l) { l = { date, session, entries: {}, ts: Date.now(), share: !!getPrivacy().workouts }; DB.logs.push(l); }
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
    reconcilePosts();
  }

  /* Squad posts follow the workouts (core/posts.js): every workout from the last
     14 days with at least one set gets exactly one post, retried until the
     server confirms it — whether it was finished, auto-saved, or logged offline.
     Backfilled posts are dated to the day of the workout. */
  let RECON_BUSY = false, RECON_AT = 0, PRIV_READY = false, MY_SQUAD = null;
  /* Was this workout logged while squad sharing was on? Per-workout flag on the
     device that logged it, plus the synced "sharing back on since" moment from the
     privacy record, so every device agrees. When unsure, keep it private. */
  function sharedLog(l) {
    if (l.share === false) return false;
    if (l.share === true) return true;           // logged on this device while sharing was on
    const since = getPrivacy().workoutsOnSince;
    if (!since) return true;
    const sinceDay = ymd(new Date(since));
    if (l.date !== sinceDay) return l.date > sinceDay;
    return !!l.startedAt && l.startedAt >= Date.parse(since);
  }
  async function reconcilePosts(force) {
    const u = cachedUser();
    // only once this account's real privacy choice has loaded (never the default),
    // and only with a session the server accepts (an anon read would see no posts
    // and re-post everything)
    if (RECON_BUSY || !u || !PRIV_READY || !getPrivacy().workouts || (!force && Date.now() - RECON_AT < 20000)) return;
    RECON_BUSY = true; RECON_AT = Date.now();
    try {
      if (!(await hasLiveSession())) return;
      if (!MY_SQUAD || MY_SQUAD.id !== getCurrentSquad()) { MY_SQUAD = await getMySquad(u.id); setCurrentSquad(MY_SQUAD?.id); }
      const sid = MY_SQUAD?.id;
      if (!sid) return;
      // backfill at most 14 days, and never from before joining this squad
      const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - 14);
      let since = ymd(sinceDate);
      if (MY_SQUAD.myJoinedAt) { const j = ymd(new Date(MY_SQUAD.myJoinedAt)); if (j > since) since = j; }
      const today = todayStr();
      // shared workouts only; today's unfinished one waits for Finish (or the day to end)
      const eligible = DB.logs.filter(l => sharedLog(l) && !(l.date === today && l.done === false));
      if (!eligible.some(l => l.date >= since)) return;
      const posts = await getMyWorkoutPosts(sid, u.id, new Date(parseYmd(since).getTime() - 86400000).toISOString());
      for (const l of missingPosts(eligible, posts, { since, nameOf: sessName })) {
        const n = Object.values(l.entries).filter(x => x.length).length;
        const data = { title: sessName(l.session), date: l.date, key: l.session, exercises: n };
        // backfills are dated midday (local) on the workout's own day
        const [y, m, d] = l.date.split("-").map(Number);
        const at = l.date === today ? undefined : new Date(y, m - 1, d, 12).toISOString();
        if (!(await postActivity(u.id, sid, "workout", data, at))) break;   // offline again — next sync retries
      }
    } catch (e) {
      console.warn("[NO LIMIT] squad posts will retry:", e?.message || e);
    } finally { RECON_BUSY = false; }
  }
  async function saveAndSync(kind, rec, okMsg) {
    markDirty(rec);
    const ok = await pushRecord(kind, rec);
    toast(ok ? okMsg : "Saved on this device — it'll sync when you're back online");
  }
  window.addEventListener("online", () => syncPending());
  window.addEventListener("nl-session-live", () => {
    // after an offline launch the account's privacy choice was never loaded — load it, then sync
    if (!PRIV_READY && cachedUser()) getProfile(cachedUser().id).then(pr => {
      PROFILE = pr; applyCloudPrivacy(pr?.privacy); PRIV_READY = true; renderHeader(); syncPending();
    }).catch(() => {});
    syncPending();
  });
  setInterval(() => { if (DB.logs.concat(DB.body, DB.macros).some(r => r.synced === false)) syncPending(); }, 60000);
  // photos live 4 weeks: quietly delete this user's expired files a few seconds after launch
  setTimeout(() => purgeExpiredPhotos(cachedUser()?.id), 5000);
  // history queries — pure + unit-tested, keyed by stable exercise key (core/history.js)
  // a workout counts once it has a set: one emptied by removing its only exercise
  // stays stored (so the removal syncs) but isn't a workout for rings, streaks or reports
  const trainedLogs = () => DB.logs.filter(l => Object.values(l.entries || {}).some(x => x && x.length));
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
    document.getElementById("axs")?.remove(); document.getElementById("nsheet")?.remove(); document.body.classList.remove("sheet-open", "kb-open");
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
    const inner = `<span class="hm2-art"${url ? plCover(url) : ""}>${ICON.note}</span>
      <span class="hm2-meta"><small>${url ? "Soundtrack" : "Music"}</small><b${url ? plTitle(url, mus.label) : ""}>${esc(url ? (mus.label || "Training playlist") : "Set your training soundtrack")}</b></span>
      <span class="hm2-go">${url ? ICON.play : ICON.chev}</span>`;
    if (!url) return `<button class="h2-music glass" data-act="gomusic">${inner}</button>`;
    return spotifyLink(url)
      ? `<button class="h2-music glass" id="home-music" data-act="plopen" data-url="${esc(url)}">${inner}</button>`
      : `<a class="h2-music glass" id="home-music" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  /* ---- playlist covers + in-app player (Spotify links; others open as before) ---- */
  // markup hooks filled in by hydratePlaylists once the cover/name has loaded
  const plCover = (url) => spotifyLink(url) ? ` data-plcover="${esc(url)}"` : "";
  const plTitle = (url, label) => spotifyLink(url) && !label ? ` data-pltitle="${esc(url)}"` : "";
  function hydratePlaylists(root) {
    root.querySelectorAll("[data-plcover]").forEach(el => playlistMeta(el.dataset.plcover).then(m => {
      if (m?.image && el.isConnected) { el.innerHTML = `<img src="${esc(m.image)}" alt="" loading="lazy">`; el.classList.add("has-cover"); }
    }));
    root.querySelectorAll("[data-pltitle]").forEach(el => playlistMeta(el.dataset.pltitle).then(m => {
      if (m?.title && el.isConnected) el.textContent = m.title;
    }));
  }
  function openPlaylist(url) {
    const sp = spotifyLink(url);
    if (!sp) { const safe = safeMusicUrl(url); if (safe) window.open(safe, "_blank", "noopener"); return; }
    const player = navigator.onLine
      ? `<div class="pl-embed"><iframe src="${esc(sp.embed)}" title="Spotify player" loading="lazy"
           allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`
      : `<div class="empty" style="padding:22px">You're offline — the player needs a connection.</div>`;
    openSheet("Soundtrack", `${player}
      <a class="btn ghost pl-open" href="${esc(sp.url)}" target="_blank" rel="noopener noreferrer">Open in Spotify</a>
      <p class="sq-ihint" style="margin:10px 4px 0">Full tracks play if you're logged in to Spotify in this browser; otherwise you'll hear previews. Open in Spotify for the full playlist.</p>`);
    playlistMeta(url).then(m => { const t = document.querySelector("#nsheet .ns-title"); if (m?.title && t) t.textContent = m.title; });
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
  /* "Getting stronger": your top 3 improving lifts. Strength = estimated one-rep
     max (weight AND reps count), compared across each lift's last 8 sessions. */
  function homeProgress() {
    const ids = [...new Set(DB.logs.flatMap(l => Object.keys(l.entries)))].filter(id => !isCardio(id));
    const trends = ids.map(id => ({ id, n: allSetsFor(id).length, ...H.strengthTrend(DB.logs, id, 8) }))
      .filter(t => t.latest);
    if (!trends.length) {
      return `<button class="h2-prog glass" data-act="gotrain"><span class="h2-prog-l"><small>Getting stronger</small><b>Your strength trend starts here</b>
        <span class="h2-prog-v">Log a workout — every lift is tracked automatically.</span></span><span class="hm2-go">${ICON.chev}</span></button>`;
    }
    const rising = trends.filter(t => t.pct > 0).sort((a, b) => b.pct - a.pct);
    const pick = (rising.length ? rising : trends.sort((a, b) => b.n - a.n)).slice(0, 3);
    const rows = pick.map(t => {
      const pc = t.pct == null ? null : Math.round(t.pct);
      const delta = pc == null ? "1st session" : pc > 0 ? `+${pc}%` : pc < 0 ? `${pc}%` : "Steady";
      const cls = t.pct > 0 ? "up" : t.pct < 0 ? "down" : "";
      return `<button class="gs-row" data-act="exhist" data-ex="${esc(t.id)}">
        <span class="gs-l"><b>${esc(exMeta(t.id)?.name || t.id)}</b><small>Latest best ${esc(fmtSet(t.latest))}</small></span>
        ${spark(t.values)}<em class="gs-d ${cls}">${delta}</em></button>`;
    }).join("");
    const head = rising.length ? "Getting stronger" : "Your strength";
    const note = rising.length
      ? "Estimated max over your last 8 sessions — weight and reps both count."
      : "No lift has moved up yet — add a rep or a little weight and it shows here.";
    return `<div class="gs glass"><div class="gs-h"><small>${head}</small><button data-act="goprogress">All lifts</button></div>
      <p class="gs-note">${note}</p>${rows}</div>`;
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
    const done = days.filter(d => trainedLogs().some(l => l.date === d)).length;
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
    const todays = trainedLogs().filter(l => l.date === today);
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
      const logs = trainedLogs().filter(l => l.date === d);
      const first = (k) => (oneName(comboParts(k)[0]) || "").split(" ")[0];
      const nm = logs.length ? first(logs[0].session) + (logs.length > 1 || comboParts(logs[0].session).length > 1 ? "+" : "")
        : ce.type === "train" && sess(ce.session) ? (sess(ce.session).name || "").split(" ")[0] : "";
      const cls = [d === today ? "today" : "", logs.length ? "done" : "", !logs.length && ce.type !== "train" ? "rest" : ""].join(" ");
      html += `<div class="h2-day ${cls}"><span>${parseYmd(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span><i></i><b>${esc(nm) || "&nbsp;"}</b></div>`;
    });
    html += `</div>`;

    view().innerHTML = html;
    hydratePlaylists(view());
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
        <div class="tp-foot"><span class="tp-save" id="tp-save">${existing ? "Saved" : "Saves as you type"}</span>
          <button class="tp-add" data-act="axopen">+ Add exercise</button></div></div>`;
    // a superset is one joined block: header, its exercises with "no rest" links, and its own add button
    const labs = supersetLabels(s.exercises);
    html += `<div id="tr-list">${s.exercises.map(ex => {
      const lab = labs[ex.id];
      if (!lab) return exCardHtml(ex, existing, today);
      const lastName = s.exercises.find(x => x.ss === ex.ss && labs[x.id].last)?.name || "";
      const open = lab.pos === 1 ? `<div class="ss-group">
          <div class="ss-head">${LINK_ICON}<b>Superset ${lab.letter}</b><span>Back to back · rest after ${esc(lastName)}</span></div>` : "";
      const join = lab.last ? "" : `<div class="ss-join"><span>no rest</span></div>`;
      const close = lab.last ? `<button class="ss-more" data-act="sspair" data-ex="${esc(ex.id)}">+ Add to superset ${lab.letter}</button></div>` : "";
      return open + exCardHtml(ex, existing, today, lab) + join + close;
    }).join("")}</div>`;
    html += s.exercises.length ? "" : `<button class="ax-empty glass" data-act="axopen">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        <b>Add your first exercise</b><small>Search the library, or add your own</small></button>`;
    html += `<button class="linkbtn ax-more" data-act="axopen"${s.exercises.length ? "" : ' style="display:none"'}>+ Add exercise</button>`;
    html += `<div style="height:70px"></div>
      <div class="savebar">
        <button class="btn" data-act="finish">${finished ? "Done — back to Home" : "Finish workout"}</button>
      </div>`;
    view().innerHTML = html;
    paintTrainProgress();
    if (!s.exercises.length) openAddSheet();
  }

  const isCustomEx = (id) => getCustomExercises().some(c => c.key === id);
  const editBtn = (id) => isCustomEx(id) ? ` · <button class="ex-edit" data-act="cxedit" data-ex="${esc(id)}">Edit</button>` : "";
  function exCardHtml(ex, existing, today, lab) {
    if (ex.cardio) return cardioCardHtml(ex, existing);
    const last = lastSetsFor(ex.id, today);
    // Today's saved values fill the boxes; last session's numbers are the shadow in
    // every set — as the placeholder while empty, and in the box's corner once typed.
    const saved = existing ? existing.entries[ex.id] : null;
    const ghost = last ? last.sets : null;
    const nRows = Math.max(ex.sets || 3, saved ? saved.length : 0, ghost ? ghost.length : 0);
    let rows = "";
    for (let i = 0; i < nRows; i++) {
      rows += setRowHtml(ex.id, i, saved && saved[i] ? saved[i] : null, ghost && ghost[i] ? ghost[i] : null);
    }
    const lastTxt = last
      ? `Last time · ${esc(shortDate(last.date))} <b>${last.sets.map(x => `${x.w}×${x.r}`).join("  ")}</b>`
      : `No history yet — set your baseline.`;
    const ssCls = lab ? ` in-ss${lab.pos === 1 ? " ss-first" : ""}${lab.last ? " ss-last" : ""}` : "";
    const ssBtn = lab
      ? `<button class="ex-ss on" data-act="ssunlink" data-ex="${esc(ex.id)}" aria-label="Take out of the superset">${UNLINK_ICON}</button>`
      : `<button class="ex-ss" data-act="sspair" data-ex="${esc(ex.id)}" aria-label="Superset with another exercise">${LINK_ICON}</button>`;
    return `<div class="ex${ssCls}" data-ex="${esc(ex.id)}"${lab ? ` data-ss="${esc(ex.ss)}"` : ""}>
      <div class="ex-h">
        <div class="info"><b class="ex-link" data-act="exhist" data-ex="${esc(ex.id)}">${lab ? `<span class="ss-tag">${lab.letter}${lab.pos}</span>` : ""}${esc(ex.name)}${ex.isNew ? '<span class="tag-new">NEW</span>' : ""}</b>
          <div class="meta">${esc(ex.target || "")}${editBtn(ex.id)}</div></div>
        <div class="tgt">${esc(ex.reps || "")} reps<small>${esc(ex.sets || 3)} sets</small></div>
        ${ssBtn}<button class="ex-rm" data-act="exrm" data-ex="${esc(ex.id)}" aria-label="Remove from today">${XMARK}</button>
      </div>
      <div class="last">${lastTxt}</div>
      <div class="sets">
        <div class="set-head"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span></span></div>
        <div class="rows">${rows}</div>
      </div>
      <div class="addset" data-act="addset" data-ex="${esc(ex.id)}">+ Add set</div>
    </div>`;
  }
  const LINK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
  const UNLINK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 13.5l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M8.5 10.5l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/></svg>';
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
        // last session's number stays visible in the corner once a box is typed in
        w.parentElement?.classList.toggle("typed", !!w.value);
        r.parentElement?.classList.toggle("typed", !!r.value);
        const vs = !cardio && filled && row.dataset.gr != null
          ? H.compareSet({ w: w.value, r: r.value }, { w: row.dataset.gw, r: row.dataset.gr }) : null;
        row.classList.toggle("vs-up", vs === "up");
        row.classList.toggle("vs-same", vs === "same");
        row.classList.toggle("vs-down", vs === "down");
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
    if (e.target.id === "ns-q") document.getElementById("nsheet")?._search?.(e.target.value);
    if (e.target.id === "me-q") { const p = document.getElementById("me-pick"); if (p) p.innerHTML = mealPickHtml(e.target.value); }
    if (e.target.classList?.contains("me-gin") && MEAL_DRAFT) {
      const i = +e.target.dataset.i, it = MEAL_DRAFT.items[i], f = it && foodOf(it.key);
      if (f) { it.g = Math.max(0, Number(e.target.value) || 0);
        const mEl = document.getElementById("me-m-" + i); if (mEl) mEl.textContent = `${r0(foodMacros(f, it.g).kcal)} kcal · ${r0(foodMacros(f, it.g).protein)}g P`;
        const tEl = document.getElementById("me-tot"); if (tEl) tEl.textContent = macroLine(mealTotals(MEAL_DRAFT.items, foodOf)); }
    }
    if (e.target.id === "fl-g" && LOG_DRAFT && LOG_DRAFT.foodKey) {
      LOG_DRAFT.g = Math.max(0, Number(e.target.value) || 0);
      const tEl = document.getElementById("fl-tot"); if (tEl) tEl.textContent = macroLine(foodMacros(foodOf(LOG_DRAFT.foodKey), LOG_DRAFT.g));
    }
  });
  /* Keyboard handling (web app on iPhone): while you type, hide the floating tab
     bar / Finish button / rest bar so nothing jumps up over your inputs, and keep
     sheets sized to the part of the screen above the keyboard. */
  const isTyping = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|file|button|submit)$/.test(el.type)));
  document.addEventListener("focusin", (e) => { if (isTyping(e.target)) document.body.classList.add("kb-open"); });
  document.addEventListener("focusout", () => setTimeout(() => { if (!isTyping(document.activeElement)) document.body.classList.remove("kb-open"); }, 120));
  if (window.visualViewport) {
    const fit = () => {
      const vv = window.visualViewport;
      document.documentElement.style.setProperty("--vvh", vv.height + "px");
      document.documentElement.style.setProperty("--vvt", vv.offsetTop + "px");
    };
    visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); fit();
  }

  function setRowHtml(exId, i, pv, ghost) {
    const phW = ghost ? ghost.w : "–", phR = ghost ? ghost.r : "–";
    const gAttr = ghost ? ` data-gw="${esc(ghost.w)}" data-gr="${esc(ghost.r)}"` : "";
    return `<div class="set-row"${gAttr}>
      <span class="sn">${i + 1}</span>
      <span class="gw" data-g="${ghost ? esc(ghost.w) : ""}"><input class="w" type="number" inputmode="decimal" step="0.5" placeholder="${phW}" value="${pv ? pv.w : ""}"></span>
      <span class="gw" data-g="${ghost ? esc(ghost.r) : ""}"><input class="r" type="number" inputmode="numeric" placeholder="${phR}" value="${pv ? pv.r : ""}"></span>
      <span class="del" data-act="delset">✕</span></div>`;
  }

  // Cardio (HIIT) card — logs minutes + rounds instead of weight × reps.
  function cardioCardHtml(ex, existing) {
    const pv = existing && existing.entries[ex.id] && existing.entries[ex.id][0]
      ? existing.entries[ex.id][0] : null;
    const meta = ex.id === "hiit" ? P.cardio.protocol : (ex.target || "Cardio");
    return `<div class="ex cardio" data-ex="${ex.id}">
      <div class="ex-h">
        <div class="info"><b class="ex-link" data-act="exhist" data-ex="${ex.id}">${esc(ex.name)}</b><div class="meta">${esc(meta)}${editBtn(ex.id)}</div></div>
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
    const d = readDay();             // keep today's lists for sessions not loaded right now
    Object.entries(DAYSESS).forEach(([k, v]) => { d.lists[k] = v.exercises; });
    try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch {}
  }
  function daySession(key) {
    if (DAYSESS[key]) return DAYSESS[key];
    // today's list in the order it was built (with superset links), then anything
    // logged that the saved list doesn't have
    const built = buildSession(key).exercises, out = [];
    (readDay().lists[key] || []).forEach(ex => {
      if (!ex || !ex.id || out.some(x => x.id === ex.id)) return;
      const b = built.find(x => x.id === ex.id);
      out.push(b ? { ...b, ...(ex.ss ? { ss: ex.ss } : {}) } : ex);
    });
    built.forEach(b => { if (!out.some(x => x.id === b.id)) out.push(b); });
    return (DAYSESS[key] = { exercises: normalizeSupersets(out) });
  }
  // redraw Train after a reorder/relabel, keeping what's typed and the scroll position
  function rerenderTrain() {
    if (TAB !== "train" || !ACTIVE) return;
    flushAutosave();
    const y = window.scrollY;
    renderTrain();
    window.scrollTo(0, y);
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
    const todays = trainedLogs().filter(l => l.date === today);
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
      const last = [...trainedLogs()].reverse().find(l => comboParts(l.session).includes(k));
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
  /* Add-exercise sheet: full screen, search pinned to the top so the keyboard can
     never push it away. Sized to the visible viewport (above the keyboard). If
     nothing matches, "add it as a new exercise" sits directly under the search. */
  let AX_GROUP = null;
  let SS_ANCHOR = null;            // "Superset" → add a new exercise: pair it with this one
  // every open sets the pairing target (or clears a stale one), however the sheet last closed
  function openAddSheet(pairWith) {
    closeAddSheet();
    SS_ANCHOR = pairWith || null;
    const groups = groupsOf(ACTIVE);
    AX_GROUP = groups[0] || null;
    const ov = document.createElement("div"); ov.className = "axs"; ov.id = "axs";
    ov.innerHTML = `<div class="axs-top">
        <div class="ax-in"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
          <input id="ax-q" type="search" placeholder="Search exercises…" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></div>
        <button class="axs-x" data-act="axclose">Close</button></div>
      <div class="axs-body" id="axs-body"><div id="axs-new"></div><div id="ax-res"></div></div>`;
    document.body.appendChild(ov);
    document.body.classList.add("sheet-open");
    axShow("");
    document.getElementById("ax-q")?.focus();   // in the same tap, so iPhone opens the keyboard
  }
  function closeAddSheet() {
    document.getElementById("axs")?.remove();
    document.body.classList.remove("sheet-open");
  }
  function axShow(q) {
    const box = document.getElementById("ax-res"); if (!box) return;
    const query = q.trim();
    const rows = axResults(query);
    const groups = groupsOf(ACTIVE);
    const exact = rows.some(e => e.name.toLowerCase() === query.toLowerCase());
    const nw = document.getElementById("axs-new");
    if (query && !exact) {
      const order = [...groups, ...MUSCLE_GROUPS.filter(g => !groups.includes(g))];
      if (!AX_GROUP || !order.includes(AX_GROUP)) AX_GROUP = order[0];
      nw.innerHTML = `<div class="axn glass"><small>${rows.length ? "Not the one?" : "Not in the library"}</small>
        <b>Add “${esc(query)}” as a new exercise</b>
        <div class="axn-g">${order.map(g => `<button class="axn-c${g === AX_GROUP ? " on" : ""}" data-act="axgrp" data-g="${esc(g)}">${esc(g)}</button>`).join("")}</div>
        <button class="btn" data-act="axcreate" data-q="${esc(query)}">Add “${esc(query)}”</button></div>`;
    } else nw.innerHTML = "";
    const head = !query ? `<div class="ax-h">${groups.length ? esc(groups.join(" + ")) : "Exercises"} · your recent first</div>`
      : rows.length ? `<div class="ax-h">In the library</div>` : "";
    box.innerHTML = head + rows.map(e => {
      const last = lastSetsFor(e.key, todayStr());
      const lastTxt = last ? ` · last ${last.sets.map(x => `${x.w}×${x.r}`).slice(0, 2).join(", ")}` : "";
      return `<button class="ax-row" data-act="axadd" data-k="${esc(e.key)}"><span><b>${esc(e.name)}</b>
        <small>${esc(e.group)} · ${esc(e.equipment || "")}${esc(lastTxt)}</small></span><i>+</i></button>`;
    }).join("");
    document.getElementById("axs-body").scrollTop = 0;
  }
  function addToWorkout(ex) {
    const s = daySession(ACTIVE);
    if (SS_ANCHOR && ex.cardio) { SS_ANCHOR = null; toast("Cardio can't be part of a superset — added on its own"); }
    if (SS_ANCHOR) {
      const anchor = SS_ANCHOR; SS_ANCHOR = null;
      if (!s.exercises.some(x => x.id === ex.id)) s.exercises.push(ex);
      s.exercises = linkSuperset(s.exercises, anchor, ex.id);
      persistDay();
      closeAddSheet();
      rerenderTrain();
      document.querySelector(`#tr-list .ex[data-ex="${CSS.escape(ex.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const dupe = s.exercises.some(x => x.id === ex.id);
    if (!dupe) {
      s.exercises.push(ex);
      persistDay();
      const today = todayStr();
      document.getElementById("tr-list").insertAdjacentHTML("beforeend", exCardHtml(ex, getLog(today, ACTIVE), today));
      document.getElementById("tp-of").textContent = s.exercises.length;
    }
    closeAddSheet();
    document.getElementById("tr-empty")?.remove();
    document.querySelector("#view .ax-empty")?.remove();
    const more = document.querySelector("#view .ax-more"); if (more) more.style.display = "";
    const card = document.querySelector(`#tr-list .ex[data-ex="${CSS.escape(ex.id)}"]`);
    // focus in the same tap so the keyboard opens straight onto the weight box
    const first = [...(card?.querySelectorAll(".set-row input") || [])].find(i => !i.value);
    first?.focus({ preventScroll: true });
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    PUSH_T = setTimeout(() => pushRecord("log", rec).then(ok => { if (ok) reconcilePosts(); }), 4000);
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
    save();
    renderDone(rec);
    const ok = await pushRecord("log", rec);
    if (!ok) toast("Saved on this device — it'll sync when you're back online");
    reconcilePosts(true);                 // squad post (once per workout, retried until confirmed)
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
      <p class="wd-sub">${esc(sessName(rec.session))} · ${esc(shortDate(rec.date))}. Well done${PROFILE?.name ? ", " + esc(PROFILE.name.split(" ")[0]) : ""} — that's ${goalNow() - Math.max(0, goalNow() - weekBounds().filter(d => trainedLogs().some(l => l.date === d)).length)} of ${goalNow()} this week.</p>
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
    const total = trainedLogs().length;
    const wk = trainedLogs().filter(l => dayDiff(l.date, today) >= 0 && dayDiff(l.date, today) < 7).length;
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
    const logs = trainedLogs().sort((a, b) => (a.date < b.date ? 1 : -1));
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
  // which: "this" (Mon–Sun containing today) or "last" (the full week before)
  function weeklyReport(which = "this") {
    const ref = new Date(); if (which === "last") ref.setDate(ref.getDate() - 7);
    const days = weekBounds(ref);
    const today = todayStr();
    const dn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const t = getActiveTargets();
    const L = [];
    L.push("🏋️ NO LIMIT — WEEKLY REVIEW");
    L.push("Week: " + prettyShort(days[0]) + " – " + prettyShort(days[6]) + (which === "last" ? " (last week)" : days[6] >= today ? " (so far)" : ""));
    L.push("");

    // Training adherence — any session logged that day counts (a swapped or quick
    // session is still training); only past days can be "missed" (AUDIT M2)
    let done = 0, missed = 0; const tl = [];
    const goal = goalNow();
    days.forEach((d, i) => {
      const c = cycleFor(d);
      const planned = c.type === "train" && sess(c.session) ? sessName(c.session) : null;
      const dayLogs = trainedLogs().filter(l => l.date === d);
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
    const workouts = DB.logs.filter(l => days.includes(l.date) && Object.values(l.entries).some(x => x.length)).length;
    L.push(`TRAINING — trained on ${done} day${done === 1 ? "" : "s"} (weekly goal ${goal}) · ${workouts} workout${workouts === 1 ? "" : "s"} logged`);
    tl.forEach(x => L.push(x));
    L.push("");

    // Key lifts: this week's best set vs the all-time best BEFORE this week, for the
    // same exercise only — a different exercise is never reported as progress
    const weekLogs = trainedLogs().filter(l => days.indexOf(l.date) >= 0);
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
      const avgC = Math.round(mac.reduce((a, m) => a + (m.carbs || 0), 0) / mac.length);
      const avgF = Math.round(mac.reduce((a, m) => a + (m.fats || 0), 0) / mac.length);
      const kOn = mac.filter(m => Math.abs((m.kcal || 0) - t.kcal) <= t.kcal * 0.1).length;
      L.push(`NUTRITION — ${mac.length}/7 days logged (estimates from logged meals)`);
      L.push(`Avg calories: ${avgK} (target ${t.kcal}) · within ±10% on ${kOn}/${mac.length} days`);
      L.push(`Avg protein: ${avgP}g (target ${t.protein}) · hit on ${pHit}/${mac.length} days`);
      L.push(`Avg carbs: ${avgC}g (target ${t.carbs}) · avg fats: ${avgF}g (target ${t.fats})`);
      // what was eaten most — meal names logged this week
      const counts = {};
      mac.forEach(m => (m.meals || []).forEach(x => { const k = String(x.name || "").replace(/ \(.*\)$/, "").replace(/ \d+(\.\d+)?g$/, ""); if (k) counts[k] = (counts[k] || 0) + 1; }));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length) L.push(`Most eaten: ${top.map(([k, c]) => `${k} ×${c}`).join(", ")}`);
    } else L.push("NUTRITION — not logged this week");

    // Supplements — consistency for the user's own stack
    const stack = (P.nut && P.nut.supps) || [];
    if (stack.length) {
      const since = (P.nut && P.nut.suppSince) || {};
      L.push("");
      L.push("SUPPLEMENTS — days ticked off in the app this week");
      stack.forEach(k => {
        const x = suppOf(k); if (!x) return;
        const win = days.filter(d => d <= today && (!since[k] || d >= since[k]));
        const n = suppAdherence(DB.macros, win, [k])[k] || 0;
        L.push(`${x.name} · ${x.dose} — ${n}/${win.length} day${win.length === 1 ? "" : "s"}`);
      });
    }

    // Auto flags
    const flags = [];
    if (missed) flags.push(`Missed ${missed} planned session${missed === 1 ? "" : "s"}`);
    if (!bw.length) flags.push("No bodyweight logged");
    if (mac.length < 5) flags.push(`Only ${mac.length}/7 days of food logged`);
    if (flags.length) { L.push(""); L.push("⚠️ FLAGS"); flags.forEach(f => L.push("• " + f)); }

    L.push("");
    L.push("— Weekly review from NO LIMIT. Food numbers are estimates from logged meals. —");
    return L.join("\n");
  }
  /* ---------- per-exercise history (bottom sheet — never leaves an unsaved workout) ---------- */
  /* Superset: pick a partner from today's list, or add a new exercise to pair */
  function openSupersetSheet(anchorId) {
    const s = daySession(ACTIVE);
    const anchor = s.exercises.find(x => x.id === anchorId); if (!anchor) return;
    const labs = supersetLabels(s.exercises);
    const options = s.exercises.filter(x => x.id !== anchorId && !x.cardio && (!anchor.ss || x.ss !== anchor.ss));
    const rows = options.map(x => `<button class="ns-row" data-act="sspick" data-a="${esc(anchorId)}" data-b="${esc(x.id)}">
        <span><b>${esc(x.name)}</b><small>${esc(x.target || "")}${labs[x.id] ? ` · now in superset ${labs[x.id].letter}` : ""}</small></span><i>+</i></button>`).join("");
    openSheet(`Superset with ${anchor.name}`, `
      <p class="sq-ihint" style="margin:6px 6px 12px">Do them back to back, then rest. Pick one from today's workout or add a new one.</p>
      ${rows || `<div class="empty" style="padding:14px 6px">No other exercises in today's workout yet.</div>`}
      <button class="btn ghost" data-act="ssnew" data-a="${esc(anchorId)}" style="margin-top:12px">+ Add a new exercise to pair</button>`);
  }
  /* Fix a mistake in an exercise you created (name or muscle group). History stays
     linked by key. Switching between cardio and weights is blocked once it has
     logged sets, since cardio logs minutes/rounds instead of kg × reps. */
  function openCustomEdit(key) {
    const c = getCustomExercises().find(x => x.key === key); if (!c) return;
    const logged = DB.logs.some(l => l.entries && l.entries[key] && l.entries[key].length);
    const isC = c.group === "Cardio";
    const chips = MUSCLE_GROUPS.map(g => {
      const locked = logged && (g === "Cardio") !== isC;
      return `<button type="button" class="ob-chip${g === c.group ? " on" : ""}" data-act="cxgrp" data-g="${esc(g)}"${locked ? " disabled" : ""}>${esc(g)}</button>`;
    }).join("");
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box"><div class="modal-head"><b>Edit exercise</b><span class="mx" data-act="closemodal">✕</span></div>
      <label class="fld"><span>Name</span><input id="cx-name" value="${esc(c.name)}" maxlength="60" autocomplete="off"></label>
      <div class="fld"><span>Muscle group</span></div>
      <div class="ob-chips cx-groups">${chips}</div>
      ${logged ? `<p class="sq-ihint" style="margin:10px 0 0">It has logged sets, so it can't switch between cardio and weights. Your history stays with it.</p>` : ""}
      <button class="btn" data-act="cxsave" data-ex="${esc(key)}" style="width:100%;margin-top:16px">Save</button></div>`;
    document.body.appendChild(ov);
    setTimeout(() => { const i = document.getElementById("cx-name"); i?.focus(); i?.select(); }, 30);
  }
  function openExerciseHistory(id) {
    const m = exMeta(id), cardio = isCardio(id), hist = H.exerciseSessions(DB.logs, id);
    const pr = cardio ? null : prFor(id);
    const ago = hist.length ? H.daysBetween(hist[0].date, todayStr()) : null;
    const agoTxt = ago == null ? "—" : ago === 0 ? "Today" : ago === 1 ? "Yesterday" : ago + " days ago";
    const setTxt = (s) => (cardio ? `${s.w} min · ${s.r} rds` : fmtSet(s));
    const ov = document.createElement("div"); ov.className = "modal";
    ov.innerHTML = `<div class="modal-box xh">
      <div class="modal-head"><b>${esc(m.name)}</b><span class="mx" data-act="closemodal">✕</span></div>
      <div class="xh-sub">${esc(m.target || "")}${m.custom ? ` · your exercise · <button class="ex-edit" data-act="cxedit" data-ex="${esc(id)}">Edit</button>` : ""}</div>
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
    // superset: straight on to the next exercise; rest only after the last one
    if (card.dataset.ss) {
      const group = [...document.querySelectorAll(`#view .ex[data-ss="${CSS.escape(card.dataset.ss)}"]`)];
      const i = group.indexOf(card);
      if (i >= 0 && i < group.length - 1) { group[i + 1].scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const sec = Math.max(...group.map(c => H.restSecondsFor(exMeta(c.dataset.ex).reps)));
      startRest(sec, "Superset");
      group[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const m = exMeta(card.dataset.ex);
    startRest(H.restSecondsFor(m.reps), m.name);
  });

  function showReport(which) {
    // on a Monday the new week is empty — open on the week you just finished
    which = which || (new Date().getDay() === 1 ? "last" : "this");
    const text = weeklyReport(which);
    const ov = document.createElement("div");
    ov.className = "modal";
    ov.innerHTML = `<div class="modal-box">
      <div class="modal-head"><b>Weekly Review</b><span class="mx" data-act="closemodal">✕</span></div>
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-b${which === "last" ? " on" : ""}" data-act="reportweek" data-v="last">Last week</button>
        <button class="seg-b${which === "this" ? " on" : ""}" data-act="reportweek" data-v="this">This week</button></div>
      <textarea class="report" readonly>${esc(text)}</textarea>
      <div class="modal-actions">
        ${navigator.share ? `<button class="btn sm" data-act="sharereport">Share</button>` : ""}
        <button class="btn sm${navigator.share ? " ghost" : ""}" data-act="copyreport">Copy</button>
        <button class="btn sm ghost" data-act="dlreport">Download .txt</button>
      </div>
      <p class="modal-hint">Send it to your coach, trainer, doctor or an AI assistant — it covers training, bodyweight, food and supplements.</p>
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
    html += `<div class="subhead lb-head">Meals today <button class="lb-r" data-act="nlog">+ From my meals</button></div><div class="card">`;
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
    html += `<button class="linkbtn" data-act="gofuel" style="margin-top:12px">My meals, foods &amp; supplements
      <small>Build meals once, log them in a tap, keep your shopping list.</small></button>`;
    view().innerHTML = html;
  }

  /* ---------- Daily fuel cheat-sheet (rendered inside Plan) ---------- */
  /* ============================ PLAN — food, meals, supplements ============================
     Everything here is the user's own: the foods they actually buy (pantry +
     shopping list that carries over week to week), meals built from those
     foods, and their supplement stack. Logging a meal at a portion writes to
     today's food log, so the Log tab and the weekly report stay in step.
     Stored in the private programme (P.nut); daily supplement ticks live on the
     day's food log record (supps). */
  const NUT = () => {
    const n = (P.nut ||= {});
    n.foods ||= []; n.custom ||= []; n.meals ||= []; n.supps ||= []; n.suppCustom ||= []; n.suppSince ||= {};
    return n;
  };
  const foodOf = (k) => NUT().custom.find(f => f.key === k) || libFood(k);
  const suppOf = (k) => NUT().suppCustom.find(x => x.key === k) || libSupp(k);
  const hasFood = (k) => NUT().foods.some(f => f.key === k);
  const r0 = (n) => Math.round(Number(n) || 0);
  const macroLine = (m) => `${r0(m.kcal)} kcal · ${r0(m.protein)}g P · ${r0(m.carbs)}g C · ${r0(m.fats)}g F`;
  const todayMacros = () => DB.macros.find(x => x.date === todayStr());
  let NUT_TAB = "shop";
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>';

  function renderPlan() {
    const t = getActiveTargets();
    const n = NUT();
    const mt = todayMacros() || {};
    const pct = (v, tg) => (tg ? Math.min(100, Math.round((v || 0) / tg * 100)) : 0);
    const taken = new Set(mt.supps || []);
    let html = `<div class="section-label">Your plan</div><h1 class="h-title">The Plan</h1>
      <p class="h-sub">Your foods, your meals, your stack. Log what you eat in a tap.</p>`;

    // Today — food vs targets + supplement check-offs
    html += `<div class="card np-today">
      <div class="np-row"><span><small>Today</small><b>${r0(mt.kcal)} <em>/ ${t.kcal} kcal</em></b></span>
        <button class="tp-add" data-act="nlog">+ Log food</button></div>
      <div class="bar ${(mt.kcal || 0) > t.kcal * 1.1 ? "over" : ""}"><i style="width:${pct(mt.kcal, t.kcal)}%"></i></div>
      <div class="np-sub"><span>Protein ${r0(mt.protein)} / ${t.protein} g</span><span>Carbs ${r0(mt.carbs)} · Fats ${r0(mt.fats)}</span></div>
      <div class="bar"><i style="width:${pct(mt.protein, t.protein)}%"></i></div>
      ${n.supps.length ? `<div class="np-supps"><small>Supplements · ${n.supps.filter(k => taken.has(k)).length}/${n.supps.length} today</small>
        <div class="np-chips">${n.supps.map(k => suppOf(k) ? `<button class="np-chip${taken.has(k) ? " on" : ""}" data-act="supptick" data-k="${esc(k)}">${taken.has(k) ? "✓ " : ""}${esc(suppOf(k).name.split(" (")[0])}</button>` : "").join("")}</div></div>` : ""}
    </div>`;

    // My meals
    html += `<div class="subhead lb-head">My meals <button class="lb-r" data-act="mnew">+ New</button></div><div class="card nm-card">`;
    if (!n.meals.length) {
      html += `<div class="empty" style="padding:12px 4px">Build the meals you actually eat from your foods — set the grams once, then log them in a tap.</div>
        <button class="btn ghost sm" data-act="mstarter">Start with 6 starter meals</button>`;
    } else html += n.meals.map(m => {
      const tt = mealTotals(m.items, foodOf);
      return `<div class="nm-row"><button class="nm-l" data-act="medit" data-id="${esc(m.id)}"><b>${esc(m.name)}</b>
          <small>${tt.kcal} kcal · ${tt.protein}g P · ${m.items.length} food${m.items.length === 1 ? "" : "s"}</small></button>
        <button class="tp-add" data-act="mlog" data-id="${esc(m.id)}">Log</button></div>`;
    }).join("");
    html += `</div>`;

    // Shopping list / My foods (carries over — nothing resets weekly)
    const need = n.foods.filter(f => f.need && foodOf(f.key));
    html += `<div class="subhead">Groceries</div><div class="card ng-card">
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-b${NUT_TAB === "shop" ? " on" : ""}" data-act="ntab" data-v="shop">Shopping list${need.length ? ` (${need.length})` : ""}</button>
        <button class="seg-b${NUT_TAB === "foods" ? " on" : ""}" data-act="ntab" data-v="foods">My foods (${n.foods.length})</button></div>`;
    if (NUT_TAB === "shop") {
      html += need.length ? need.map(f => `<button class="ng-row" data-act="gbought" data-k="${esc(f.key)}"><span class="ck-box"></span><span>${esc(foodOf(f.key).name)}</span></button>`).join("")
          + `<p class="pl-note" style="margin:10px 2px 0">Tap when it's in the basket. Anything you still have stays in My foods for next week.</p>`
        : `<div class="empty" style="padding:12px 4px">${n.foods.length ? "Nothing to buy. In My foods, tap Need on anything running low." : "Add the foods you usually buy, then mark what you need each week."}</div>`;
      if (n.meals.length) html += `<button class="linkbtn" data-act="gmeals" style="margin:10px 0 0">Add everything my meals need<small>Marks every food in your meals as Need.</small></button>`;
    } else {
      html += n.foods.length ? n.foods.map(f => { const fd = foodOf(f.key); if (!fd) return "";
          return `<div class="ng-food"><span><b>${esc(fd.name)}</b><small>${macroLine(foodMacros(fd, fd.portion)).split(" · ").slice(0, 2).join(" · ")} per ${fd.unit || fd.portion + "g"}</small></span>
            <button class="ng-need${f.need ? " on" : ""}" data-act="gneed" data-k="${esc(f.key)}">${f.need ? "Need ✓" : "Need"}</button>
            <button class="ex-rm" data-act="frm" data-k="${esc(f.key)}" aria-label="Remove">${XMARK}</button></div>`; }).join("")
        : `<div class="empty" style="padding:12px 4px">Pick the foods you actually buy — it takes a minute.</div>`;
      html += `<button class="linkbtn" data-act="fadd" style="margin:10px 0 0">+ Add foods<small>From the library, or your own from a label.</small></button>`;
    }
    html += `</div>`;

    // Supplements
    html += `<div class="subhead lb-head">My supplements <button class="lb-r" data-act="sadd">+ Add</button></div><div class="card">`;
    html += n.supps.length ? n.supps.map(k => { const x = suppOf(k); if (!x) return "";
        return `<div class="ng-food"><span><b>${esc(x.name)}</b><small>${esc(x.dose)} · ${esc(x.when)}</small></span>
          <button class="ex-rm" data-act="srm" data-k="${esc(k)}" aria-label="Remove">${XMARK}</button></div>`; }).join("")
      : `<div class="empty" style="padding:12px 4px">Choose what you take — tick them off each day on this page.</div>
         <button class="btn ghost sm" data-act="sessentials">Start with the essentials (creatine, D3, omega-3)</button>`;
    html += `<p class="pl-note" style="margin:10px 2px 0">General information, not medical advice — check with your GP if you take medication or have a condition.</p></div>`;

    // Reference (collapsed)
    html += `<div class="subhead">Reference</div>
      <details class="card nref"><summary>Your targets <em>${t.kcal} kcal · ${t.protein}g P · ${t.carbs}g C · ${t.fats}g F</em></summary>
        <button class="linkbtn" data-act="edittargets" style="margin:10px 0 0">Edit my targets</button></details>
      <details class="card nref"><summary>Training rules</summary><ul class="clean">${P.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul></details>
      <details class="card nref"><summary>Warm-up · every session</summary><ul class="clean">${P.warmup.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>
      <button class="linkbtn" data-act="settings" style="margin-top:6px">Settings<small>Weekly goal, schedule, Spotify, privacy, your data.</small></button>`;
    view().innerHTML = html;
  }

  /* ---------- sheets ---------- */
  function openSheet(title, body, opts = {}) {
    closeSheet();
    const ov = document.createElement("div"); ov.className = "axs nsheet"; ov.id = "nsheet";
    ov.innerHTML = `<div class="axs-top"><b class="ns-title">${esc(title)}</b><button class="axs-x" data-act="nsclose">Done</button></div>
      ${opts.search ? `<div class="ns-search"><div class="ax-in">${SEARCH_ICON}<input id="ns-q" type="search" placeholder="${esc(opts.search)}" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false"></div></div>` : ""}
      <div class="axs-body" id="ns-body">${body}</div>`;
    ov._search = opts.onSearch || null;
    document.body.appendChild(ov);
    document.body.classList.add("sheet-open");
    return ov;
  }
  function closeSheet() {
    document.getElementById("nsheet")?.remove();
    if (!document.getElementById("axs")) document.body.classList.remove("sheet-open");
  }
  const nsBody = (html) => { const b = document.getElementById("ns-body"); if (b) b.innerHTML = html; };
  const saveNut = () => saveProgrammeQuiet();

  // food library — tick to add to My foods; add your own from a label
  function foodSheetHtml(q = "") {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (f) => !words.length || words.every(w => (f.name + " " + f.cat).toLowerCase().includes(w));
    const row = (f) => `<button class="ns-row${hasFood(f.key) ? " on" : ""}" data-act="ftoggle" data-k="${esc(f.key)}">
        <span><b>${esc(f.name)}</b><small>${r0(foodMacros(f, f.portion).kcal)} kcal · ${r0(foodMacros(f, f.portion).protein)}g P per ${esc(f.unit || f.portion + "g")}</small></span><i>${hasFood(f.key) ? "✓" : "+"}</i></button>`;
    let h = "";
    const mine = NUT().custom.filter(match);
    if (mine.length) h += `<div class="ax-h">Your own foods</div>` + mine.map(row).join("");
    FOOD_CATS.forEach(c => { const items = FOOD_LIBRARY.filter(f => f.cat === c && match(f)); if (items.length) h += `<div class="ax-h">${esc(c)}</div>` + items.map(row).join(""); });
    if (!h) h = `<div class="ax-h">No match in the library</div>`;
    h += `<div class="axn glass" style="margin-top:14px"><small>Not here?</small><b>Add your own from the label</b>
      <input class="inp cf-in" id="cf-name" placeholder="Name (e.g. Tesco chicken wrap)" value="${esc(q && !FOOD_LIBRARY.some(match) ? q : "")}" autocapitalize="words">
      <div class="cf-grid"><label>kcal<input id="cf-kcal" type="number" inputmode="decimal" placeholder="per 100g"></label>
        <label>Protein<input id="cf-p" type="number" inputmode="decimal" placeholder="g"></label>
        <label>Carbs<input id="cf-c" type="number" inputmode="decimal" placeholder="g"></label>
        <label>Fat<input id="cf-f" type="number" inputmode="decimal" placeholder="g"></label></div>
      <label class="cf-portion">Usual portion <input id="cf-portion" type="number" inputmode="numeric" value="100"> g</label>
      <p class="pl-note" style="margin:6px 0 10px">Use the "per 100g" column on the packet.</p>
      <button class="btn" data-act="fcustomsave">Add to my foods</button></div>`;
    return h;
  }
  function openFoodSheet() {
    openSheet("Add foods", foodSheetHtml(), { search: "Search foods…", onSearch: (q) => nsBody(foodSheetHtml(q)) });
  }

  // meal editor
  let MEAL_DRAFT = null;
  function mealPickHtml(q = "") {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (f) => !words.length || words.every(w => f.name.toLowerCase().includes(w));
    const mine = NUT().foods.map(f => foodOf(f.key)).filter(Boolean).filter(match);
    const lib = words.length ? FOOD_LIBRARY.filter(f => match(f) && !hasFood(f.key)).slice(0, 15) : [];
    const row = (f) => `<button class="ax-row" data-act="meadd" data-k="${esc(f.key)}"><span><b>${esc(f.name)}</b><small>${esc(f.unit || f.portion + "g")} · ${r0(foodMacros(f, f.portion).kcal)} kcal</small></span><i>+</i></button>`;
    return (mine.length ? `<div class="ax-h">My foods</div>` + mine.map(row).join("") : "")
      + (lib.length ? `<div class="ax-h">Library</div>` + lib.map(row).join("") : "")
      + (!mine.length && !lib.length ? `<div class="ax-h">${words.length ? "No match — add it in My foods first" : "Search any food"}</div>` : "");
  }
  function mealSheetHtml() {
    const d = MEAL_DRAFT, tt = mealTotals(d.items, foodOf);
    return `<input class="inp me-name" id="me-name" value="${esc(d.name)}" placeholder="Meal name (e.g. Chicken & rice)" autocapitalize="words">
      <div class="me-items">${d.items.map((it, i) => { const f = foodOf(it.key); if (!f) return "";
        return `<div class="me-row"><span><b>${esc(f.name)}</b><small id="me-m-${i}">${r0(foodMacros(f, it.g).kcal)} kcal · ${r0(foodMacros(f, it.g).protein)}g P</small></span>
          <label class="me-g"><input type="number" inputmode="decimal" data-i="${i}" class="me-gin" value="${it.g}"> g</label>
          <button class="ex-rm" data-act="merm" data-i="${i}" aria-label="Remove">${XMARK}</button></div>`; }).join("") || `<div class="ax-h">Add the foods in this meal ↓</div>`}</div>
      <div class="me-tot glass" id="me-tot">${macroLine(tt)}</div>
      <div class="ax-in me-search">${SEARCH_ICON}<input id="me-q" type="search" placeholder="Add a food…" autocapitalize="none" autocomplete="off"></div>
      <div id="me-pick">${mealPickHtml()}</div>
      <button class="btn" data-act="mesave" style="margin-top:14px">Save meal</button>
      ${NUT().meals.some(m => m.id === d.id) ? `<button class="btn ghost" data-act="medel" style="margin-top:10px;color:#FF8A80">Delete meal</button>` : ""}`;
  }
  function openMealEditor(id) {
    const m = NUT().meals.find(x => x.id === id);
    MEAL_DRAFT = m ? JSON.parse(JSON.stringify(m)) : { id: "m-" + Date.now().toString(36), name: "", items: [] };
    openSheet(m ? "Edit meal" : "New meal", mealSheetHtml());
  }

  // log a meal at a portion, or a single food by grams
  let LOG_DRAFT = null;
  function logSheetHtml() {
    const d = LOG_DRAFT;
    if (d.mealId) {
      const m = NUT().meals.find(x => x.id === d.mealId); if (!m) return "";
      const tt = mealTotals(m.items, foodOf, d.portion);
      return `<div class="nl-name">${esc(m.name)}</div><small class="pl-note">How much did you have?</small>
        <div class="nl-por">${PORTIONS.map(p => `<button class="axn-c${p === d.portion ? " on" : ""}" data-act="lgportion" data-p="${p}">${portionLabel(p)}</button>`).join("")}</div>
        <div class="me-tot glass">${macroLine(tt)}</div>
        <button class="btn" data-act="lggo">Log to today</button>`;
    }
    const f = foodOf(d.foodKey); if (!f) return "";
    return `<div class="nl-name">${esc(f.name)}</div>
      <label class="me-g nl-g"><input type="number" inputmode="decimal" id="fl-g" value="${d.g}"> g</label>
      <div class="nl-por">${[0.5, 1, 1.5, 2].map(k => `<button class="axn-c" data-act="lgfg" data-g="${Math.round(f.portion * k)}">${f.unit && k === 1 ? esc(f.unit) : Math.round(f.portion * k) + "g"}</button>`).join("")}</div>
      <div class="me-tot glass" id="fl-tot">${macroLine(foodMacros(f, d.g))}</div>
      <button class="btn" data-act="lggo">Log to today</button>`;
  }
  function quickLogHtml(q = "") {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (name) => !words.length || words.every(w => name.toLowerCase().includes(w));
    const meals = NUT().meals.filter(m => match(m.name));
    const mine = NUT().foods.map(f => foodOf(f.key)).filter(f => f && match(f.name));
    const lib = words.length ? FOOD_LIBRARY.filter(f => match(f.name) && !hasFood(f.key)).slice(0, 12) : [];
    const frow = (f) => `<button class="ax-row" data-act="lgfood" data-k="${esc(f.key)}"><span><b>${esc(f.name)}</b><small>${esc(f.unit || f.portion + "g")} · ${r0(foodMacros(f, f.portion).kcal)} kcal</small></span><i>+</i></button>`;
    return (meals.length ? `<div class="ax-h">My meals</div>` + meals.map(m => { const tt = mealTotals(m.items, foodOf);
        return `<button class="ax-row" data-act="mlog" data-id="${esc(m.id)}"><span><b>${esc(m.name)}</b><small>${tt.kcal} kcal · ${tt.protein}g P</small></span><i>+</i></button>`; }).join("") : "")
      + (mine.length ? `<div class="ax-h">My foods</div>` + mine.map(frow).join("") : "")
      + (lib.length ? `<div class="ax-h">Library</div>` + lib.map(frow).join("") : "")
      + (!meals.length && !mine.length && !lib.length ? `<div class="ax-h">${words.length ? "No match" : "Search any food, or build meals on the Plan page"}</div>` : "");
  }
  function logToToday(name, mc) {
    const t = todayStr(); let m = DB.macros.find(x => x.date === t);
    if (!m) { m = { date: t, kcal: 0, protein: 0, carbs: 0, fats: 0 }; DB.macros.push(m); }
    const ml = { name, kcal: r0(mc.kcal), protein: r0(mc.protein), carbs: r0(mc.carbs), fats: r0(mc.fats) };
    (m.meals ||= []).push(ml);
    m.kcal = (m.kcal || 0) + ml.kcal; m.protein = (m.protein || 0) + ml.protein;
    m.carbs = (m.carbs || 0) + ml.carbs; m.fats = (m.fats || 0) + ml.fats;
    DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1));
    saveAndSync("macro", m, `Logged ${name} · ${ml.kcal} kcal`);
  }
  function toggleSupp(k) {
    const t = todayStr(); let m = DB.macros.find(x => x.date === t);
    if (!m) { m = { date: t, kcal: 0, protein: 0, carbs: 0, fats: 0 }; DB.macros.push(m); DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1)); }
    const set = new Set(m.supps || []);
    set.has(k) ? set.delete(k) : set.add(k);
    m.supps = [...set];
    markDirty(m);
    pushRecord("macro", m);
  }

  // supplement library — tick to add to your stack; add your own
  function suppSheetHtml() {
    const n = NUT();
    const row = (x) => `<button class="ns-row${n.supps.includes(x.key) ? " on" : ""}" data-act="stoggle" data-k="${esc(x.key)}">
        <span><b>${esc(x.name)}</b><small>${esc(x.dose)} · ${esc(x.when)}</small><small class="ns-why">${esc(x.why || "")}</small></span><i>${n.supps.includes(x.key) ? "✓" : "+"}</i></button>`;
    let h = n.suppCustom.length ? `<div class="ax-h">Your own</div>` + n.suppCustom.map(row).join("") : "";
    SUPP_CATS.forEach(c => { h += `<div class="ax-h">${esc(c)}</div>` + SUPP_LIBRARY.filter(x => x.cat === c).map(row).join(""); });
    h += `<div class="axn glass" style="margin-top:14px"><small>Not listed?</small><b>Add your own</b>
      <input class="inp cf-in" id="cs-name" placeholder="Name" autocapitalize="words">
      <input class="inp cf-in" id="cs-dose" placeholder="Dose (e.g. 1 capsule)">
      <input class="inp cf-in" id="cs-when" placeholder="When (e.g. with breakfast)">
      <button class="btn" data-act="scustomsave">Add to my stack</button></div>
      <p class="pl-note" style="margin:12px 4px">General information, not medical advice.</p>`;
    return h;
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
          <span class="spot-acts"><button class="lb-r" data-act="spotpick">${mus.url ? "Change playlist" : "Pick a playlist"}</button>
            <button class="lb-r" data-act="spotoff">Disconnect</button></span></div>
        ${canControlPlayback()
          ? `<div class="priv-row ap-row"><span><b>Auto-play on Start</b><small>Starting a workout plays your soundtrack on Spotify. Premium; Spotify open on a device.</small></span>
              <button class="toggle${autoplayOn() ? " on" : ""}" data-act="aptoggle" aria-label="Auto-play on Start"><i></i></button></div>`
          : `<button class="btn ghost sm" data-act="spoton" style="margin-top:12px">Reconnect Spotify to turn on auto-play</button>
             <p class="sq-ihint" style="margin:8px 0 0">One tap — Spotify asks for permission to start your playlist.</p>`}`
      : `<button class="btn sm spot-connect" data-act="spoton">Connect Spotify</button>
         <p class="sq-ihint" style="margin:8px 0 0">Authorize once, then pick a playlist to share — no typing a link.</p>`)
      : "";
    const musUrl = mus.url ? safeMusicUrl(mus.url) : null;
    const current = musUrl ? `<div class="pl-cur">
        <button class="pl-cur-main" ${spotifyLink(musUrl) ? `data-act="plopen" data-url="${esc(musUrl)}"` : `data-act="plext" data-url="${esc(musUrl)}"`}>
          <span class="pl-cover"${plCover(musUrl)}>${ICON.note}</span>
          <span class="pl-meta"><small>Now sharing</small><b${plTitle(musUrl, mus.label)}>${esc(mus.label || "Training playlist")}</b></span>
          <span class="hm2-go">${ICON.play}</span></button>
        <button class="lb-r pl-remove" data-act="musremove">Remove</button></div>` : "";
    html += `<div class="subhead" id="soundtrack">Your training soundtrack</div><div class="card">
      ${musOn ? `${current}${spotBlock}
      <details class="pl-link"${!musUrl && !spotBlock ? " open" : ""}><summary>${musUrl ? "Edit link or vibe" : spotBlock ? "Or paste a link" : "Add a playlist link"}</summary>
      <div class="field"><label>Playlist link (Spotify, Apple Music, YouTube…)</label>
        <input id="mus-url" class="inp" type="url" inputmode="url" autocapitalize="none" placeholder="https://…" value="${esc(mus.url || "")}"></div>
      <div class="field" style="margin-top:10px"><label>Vibe <small style="color:var(--muted)">(optional)</small></label>
        <input id="mus-label" class="inp" placeholder="e.g. Heavy rap · gym phonk" maxlength="40" value="${esc(mus.label || "")}"></div>
      <button class="btn sm" data-act="savemusic" style="margin-top:12px">Save soundtrack</button></details>
      <p class="sq-ihint" style="margin-top:10px">Your squad sees this on the Squad tab.</p>`
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
    hydratePlaylists(view());
  }

  /* ============================ PROFILE ============================ */
  function myWeekStreak() {
    const weeks = new Set(trainedLogs().map(l => weekStartISO(parseYmd(l.date))));
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

    const total = trainedLogs().length;
    const lifted = []; const seen = new Set();
    DB.logs.forEach(l => Object.keys(l.entries).forEach(id => { if (!seen.has(id) && !isCardio(id)) { seen.add(id); lifted.push(id); } }));
    const prCount = lifted.filter(id => !!prFor(id)).length;
    const streak = myWeekStreak();
    const bw = DB.body.length ? DB.body[DB.body.length - 1].weight : null;
    const since = trainedLogs().length ? trainedLogs().map(l => l.date).sort()[0] : (u?.created_at || null);
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
        ? (spotifyLink(mus.url)
          ? `<button class="linkbtn" data-act="plopen" data-url="${esc(mus.url)}">${esc(mus.label || "Your soundtrack")}<small>Play your training playlist</small></button>`
          : `<a class="linkbtn" href="${esc(safeMusicUrl(mus.url) || "#")}" target="_blank" rel="noopener noreferrer">${esc(mus.label || "Your soundtrack")}<small>Open your training playlist</small></a>`)
        : `<button class="linkbtn" data-act="gomusic">Set your soundtrack<small>Share a playlist with your squad</small></button>`}
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
      const inner = `<span class="mus-cover"${plCover(url)}>${avatarMarkup(nm, p.avatar_url, "sq-av sm")}</span>
        <span class="mus-info"><b>${esc(nm)}</b><small${plTitle(url, p.music_label)}>${esc(p.music_label || "Training playlist")}</small></span>
        <span class="mus-play">${ICON.play}</span>`;
      return spotifyLink(url)
        ? `<button class="mus-row" data-act="plopen" data-url="${esc(url)}">${inner}</button>`
        : `<a class="mus-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
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
    hydratePlaylists(view());
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
        ? `trained <b>${esc(p.data?.title || "a workout")}</b>${p.data?.exercises ? ` · ${p.data.exercises} exercise${p.data.exercises === 1 ? "" : "s"}` : ""}`
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
    else if (act === "axopen") openAddSheet();
    else if (act === "axclose") { SS_ANCHOR = null; closeAddSheet(); }
    else if (act === "axgrp") { AX_GROUP = el.dataset.g; el.parentElement.querySelectorAll(".axn-c").forEach(c => c.classList.toggle("on", c === el)); document.getElementById("ax-q")?.focus(); }
    else if (act === "axadd") { const ex = toEx(el.dataset.k); if (ex) addToWorkout(ex); }
    else if (act === "axcreate") {
      el.disabled = true; el.textContent = "Adding…";
      const nice = el.dataset.q.replace(/\s+/g, " ").replace(/(^|\s)\S/g, m => m.toUpperCase());
      addCustomExercise(cachedUser()?.id, { name: nice, group: AX_GROUP || "Chest" })
        .then(c => {
          const cardio = c.cardio || c.group === "Cardio", pairing = !!SS_ANCHOR;
          addToWorkout({ id: c.key, name: c.name, target: c.group, sets: c.sets, reps: c.reps, custom: true, ...(cardio ? { cardio: true } : {}) });
          if (!(cardio && pairing)) toast(`Added “${c.name}” — it's in your library now`);   // keep the "cardio can't superset" note
        })
        .catch(() => { el.disabled = false; el.textContent = "Try again"; toast("Couldn't add that exercise"); });
    }
    else if (act === "finish") finishWorkout();
    else if (act === "gohome") go("today");
    else if (act === "settings") go("settings");
    /* --- Plan: foods, meals, supplements --- */
    else if (act === "nsclose") { closeSheet(); if (TAB === "plan") renderPlan(); else if (TAB === "log") renderLog(); }
    else if (act === "ntab") { NUT_TAB = el.dataset.v; renderPlan(); }
    else if (act === "fadd") openFoodSheet();
    else if (act === "ftoggle") {
      const n = NUT(), k = el.dataset.k;
      n.foods = hasFood(k) ? n.foods.filter(f => f.key !== k) : [...n.foods, { key: k, need: false }];
      el.classList.toggle("on", hasFood(k)); el.querySelector("i").textContent = hasFood(k) ? "✓" : "+";
      saveNut();
    }
    else if (act === "fcustomsave") {
      const v = (id) => document.getElementById(id)?.value || "";
      const num = (id) => Math.max(0, parseFloat(v(id)) || 0);
      const name = v("cf-name").trim().replace(/\s+/g, " ");
      if (!name) { toast("Give it a name"); return; }
      if (!num("cf-kcal") && !num("cf-p")) { toast("Add at least the calories per 100g"); return; }
      const f = { key: "cf-" + Date.now().toString(36), name, cat: "Yours", kcal: num("cf-kcal"), p: num("cf-p"), c: num("cf-c"), f: num("cf-f"), portion: Math.max(1, num("cf-portion") || 100) };
      const n = NUT(); n.custom.push(f); n.foods.push({ key: f.key, need: false });
      saveNut(); toast(`Added ${name}`); nsBody(foodSheetHtml());
    }
    else if (act === "frm") { const n = NUT(); n.foods = n.foods.filter(f => f.key !== el.dataset.k); saveNut(); renderPlan(); }
    else if (act === "gneed") { const f = NUT().foods.find(x => x.key === el.dataset.k); if (f) { f.need = !f.need; saveNut(); renderPlan(); } }
    else if (act === "gbought") {
      const f = NUT().foods.find(x => x.key === el.dataset.k); if (!f) return;
      f.need = false; saveNut();
      el.classList.add("got"); setTimeout(() => renderPlan(), 260);
    }
    else if (act === "gmeals") {
      const n = NUT(); let added = 0;
      n.meals.forEach(m => m.items.forEach(it => {
        let f = n.foods.find(x => x.key === it.key);
        if (!f) { f = { key: it.key, need: false }; n.foods.push(f); }
        if (!f.need) { f.need = true; added++; }
      }));
      saveNut(); NUT_TAB = "shop"; renderPlan(); toast(added ? `${added} item${added === 1 ? "" : "s"} added to your list` : "Already on your list");
    }
    else if (act === "mnew") openMealEditor(null);
    else if (act === "medit") openMealEditor(el.dataset.id);
    else if (act === "meadd") {
      const f = foodOf(el.dataset.k); if (!f) return;
      MEAL_DRAFT.name = document.getElementById("me-name")?.value || MEAL_DRAFT.name;
      MEAL_DRAFT.items.push({ key: f.key, g: f.portion });
      if (!hasFood(f.key)) NUT().foods.push({ key: f.key, need: false });   // a meal's foods belong in My foods
      nsBody(mealSheetHtml());
    }
    else if (act === "merm") { MEAL_DRAFT.name = document.getElementById("me-name")?.value || MEAL_DRAFT.name; MEAL_DRAFT.items.splice(+el.dataset.i, 1); nsBody(mealSheetHtml()); }
    else if (act === "mesave") {
      const d = MEAL_DRAFT; d.name = (document.getElementById("me-name")?.value || "").trim();
      if (!d.name) { toast("Name your meal"); return; }
      if (!d.items.length) { toast("Add at least one food"); return; }
      const n = NUT(), i = n.meals.findIndex(m => m.id === d.id);
      if (i >= 0) n.meals[i] = d; else n.meals.push(d);
      saveNut(); closeSheet(); renderPlan(); toast("Meal saved");
    }
    else if (act === "medel") {
      if (!confirm("Delete this meal? Anything you've already logged stays in your log.")) return;
      const n = NUT(); n.meals = n.meals.filter(m => m.id !== MEAL_DRAFT.id);
      saveNut(); closeSheet(); renderPlan();
    }
    else if (act === "mstarter") {
      const n = NUT();
      STARTER_MEALS.forEach((m, i) => {
        n.meals.push({ id: "m-" + Date.now().toString(36) + i, name: m.name, items: m.items.map(([key, g]) => ({ key, g })) });
        m.items.forEach(([key]) => { if (!hasFood(key)) n.foods.push({ key, need: false }); });
      });
      saveNut(); renderPlan(); toast("6 meals added — edit the grams to match how you eat");
    }
    else if (act === "mlog") {
      LOG_DRAFT = { mealId: el.dataset.id, portion: 1 };
      openSheet("Log a meal", logSheetHtml());
    }
    else if (act === "lgfood") {
      const f = foodOf(el.dataset.k); if (!f) return;
      LOG_DRAFT = { foodKey: f.key, g: f.portion };
      openSheet("Log a food", logSheetHtml());
    }
    else if (act === "lgportion") { LOG_DRAFT.portion = Number(el.dataset.p); nsBody(logSheetHtml()); }
    else if (act === "lgfg") { LOG_DRAFT.g = Number(el.dataset.g); nsBody(logSheetHtml()); }
    else if (act === "lggo") {
      const d = LOG_DRAFT;
      if (d.mealId) {
        const m = NUT().meals.find(x => x.id === d.mealId); if (!m) return;
        logToToday(d.portion === 1 ? m.name : `${m.name} (${portionLabel(d.portion)})`, mealTotals(m.items, foodOf, d.portion));
      } else {
        const f = foodOf(d.foodKey); const g = Math.max(0, Number(document.getElementById("fl-g")?.value) || d.g);
        if (!f || !g) return;
        logToToday(`${f.name.split(" (")[0]} ${g}g`, foodMacros(f, g));
      }
      closeSheet();
      if (TAB === "plan") renderPlan(); else if (TAB === "log") renderLog();
    }
    else if (act === "nlog") openSheet("Log food", quickLogHtml(), { search: "Search meals and foods…", onSearch: (q) => nsBody(quickLogHtml(q)) });
    else if (act === "supptick") {
      toggleSupp(el.dataset.k);
      const on = (todayMacros()?.supps || []).includes(el.dataset.k);
      el.classList.toggle("on", on);
      el.textContent = (on ? "✓ " : "") + suppOf(el.dataset.k).name.split(" (")[0];
      const lbl = el.closest(".np-supps")?.querySelector("small");
      if (lbl) lbl.textContent = `Supplements · ${NUT().supps.filter(k => (todayMacros()?.supps || []).includes(k)).length}/${NUT().supps.length} today`;
    }
    else if (act === "sadd") openSheet("Supplements", suppSheetHtml());
    else if (act === "stoggle") {
      const n = NUT(), k = el.dataset.k;
      if (n.supps.includes(k)) n.supps = n.supps.filter(x => x !== k);
      else { n.supps = [...n.supps, k]; n.suppSince[k] = todayStr(); }
      saveNut(); nsBody(suppSheetHtml());
    }
    else if (act === "scustomsave") {
      const v = (id) => (document.getElementById(id)?.value || "").trim();
      if (!v("cs-name")) { toast("Give it a name"); return; }
      const x = { key: "cs-" + Date.now().toString(36), name: v("cs-name"), dose: v("cs-dose") || "As labelled", when: v("cs-when") || "Daily", why: "" };
      const n = NUT(); n.suppCustom.push(x); n.supps.push(x.key); n.suppSince[x.key] = todayStr();
      saveNut(); nsBody(suppSheetHtml()); toast(`Added ${x.name}`);
    }
    else if (act === "srm") { const n = NUT(); n.supps = n.supps.filter(k => k !== el.dataset.k); saveNut(); renderPlan(); }
    else if (act === "sessentials") { const n = NUT(); ESSENTIALS.forEach(k => { if (!n.supps.includes(k)) { n.supps.push(k); n.suppSince[k] = todayStr(); } }); saveNut(); renderPlan(); }
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
      const id = el.dataset.ex;
      const wasSS = !!s.exercises.find(x => x.id === id)?.ss;
      s.exercises = normalizeSupersets(s.exercises.filter(x => x.id !== id));
      persistDay();
      el.closest(".ex")?.remove();
      // its sets leave the saved workout too, even when nothing else is logged
      // (autosave skips an empty workout, so the old copy would bring it back)
      const log = getLog(todayStr(), ACTIVE);
      if (log && log.entries[id]) {
        const { [id]: _gone, ...rest } = log.entries;
        const rec = upsertLog(todayStr(), ACTIVE, rest);
        pushRecord("log", rec);
      }
      if (wasSS) { scheduleAutosave(); rerenderTrain(); return; }   // save the removal, then relabel the group
      document.getElementById("tp-of").textContent = s.exercises.length;
      paintTrainProgress();
      scheduleAutosave();
    }
    else if (act === "exhist") openExerciseHistory(el.dataset.ex);
    else if (act === "sspair") openSupersetSheet(el.dataset.ex);
    else if (act === "sspick") {
      const s = daySession(ACTIVE);
      s.exercises = linkSuperset(s.exercises, el.dataset.a, el.dataset.b);
      persistDay(); closeSheet(); rerenderTrain();
      toast("Superset set — no rest between them");
    }
    else if (act === "ssnew") { closeSheet(); openAddSheet(el.dataset.a); }
    else if (act === "ssunlink") {
      const s = daySession(ACTIVE);
      s.exercises = unlinkSuperset(s.exercises, el.dataset.ex);
      persistDay(); rerenderTrain();
    }
    else if (act === "cxedit") { el.closest(".modal")?.remove(); openCustomEdit(el.dataset.ex); }
    else if (act === "cxgrp") {
      if (el.disabled) return;
      el.parentElement.querySelectorAll(".ob-chip").forEach(c => c.classList.toggle("on", c === el));
    }
    else if (act === "cxsave") {
      const key = el.dataset.ex, box = el.closest(".modal");
      const name = (box.querySelector("#cx-name")?.value || "").trim();
      const group = box.querySelector(".ob-chip.on")?.dataset.g;
      if (!name) { toast("Give it a name"); return; }
      const hasLogs = DB.logs.some(l => l.entries && l.entries[key] && l.entries[key].length);
      updateCustomExercise(cachedUser()?.id, key, { name, group }, { hasLogs })
        .then(c => {
          Object.values(DAYSESS).forEach(sx => {
            sx.exercises.forEach(x => {
              if (x.id !== key) return;
              x.name = c.name; x.target = c.group;
              if (c.cardio) { x.cardio = true; delete x.ss; } else delete x.cardio;   // cardio isn't part of supersets
            });
            sx.exercises = normalizeSupersets(sx.exercises);
          });
          persistDay(); box.remove(); toast("Exercise updated");
          rerenderTrain();
        })
        .catch(e => toast(e?.message === "duplicate" ? `You already have “${name}” in ${group}`
          : e?.message === "cardio-lock" ? "It has logged sets — it can't switch between cardio and weights" : "Couldn't save — try again"));
    }
    else if (act === "restskip") stopRest();
    else if (act === "restadj" && REST) {
      REST.endsAt += Number(el.dataset.d) * 1000;
      REST.total = Math.max(REST.total, Math.ceil((REST.endsAt - Date.now()) / 1000));
      if (REST.endsAt > Date.now()) REST.done = false;
      paintRest();
    }
    else if (act === "addset") {
      const rows = document.querySelector(`.ex[data-ex="${el.dataset.ex}"] .rows`);
      const last = lastSetsFor(el.dataset.ex, todayStr());
      rows.insertAdjacentHTML("beforeend", setRowHtml(el.dataset.ex, rows.children.length, null, last?.sets[rows.children.length] || null));
      paintTrainProgress();
    }
    else if (act === "delset") {
      const row = el.closest(".set-row"); const rows = row.parentElement;
      row.remove();
      [...rows.children].forEach((r, i) => r.querySelector(".sn").textContent = i + 1);
      // shadows follow the set number: set 2 always shows last session's set 2
      const exId = rows.closest(".ex")?.dataset.ex;
      const last = exId && !rows.closest(".ex").classList.contains("cardio") ? lastSetsFor(exId, todayStr()) : null;
      if (last) [...rows.children].forEach((r, i) => {
        const g = last.sets[i] || null;
        if (g) { r.dataset.gw = g.w; r.dataset.gr = g.r; } else { delete r.dataset.gw; delete r.dataset.gr; }
        const [gw, gr] = r.querySelectorAll(".gw");
        if (gw) { gw.dataset.g = g ? g.w : ""; gw.querySelector("input").placeholder = g ? g.w : "–"; }
        if (gr) { gr.dataset.g = g ? g.r : ""; gr.querySelector("input").placeholder = g ? g.r : "–"; }
      });
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
    else if (act === "reportweek") {
      const m = el.closest(".modal"); if (!m) return;
      const text = weeklyReport(el.dataset.v);
      m._text = text; m.querySelector(".report").value = text;
      m.querySelectorAll('[data-act="reportweek"]').forEach(b => b.classList.toggle("on", b === el));
    }
    else if (act === "sharereport") {
      const text = el.closest(".modal")?._text || weeklyReport();
      navigator.share({ title: "My week — NO LIMIT", text }).catch(() => {});
    }
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
    else if (act === "gofuel") go("plan");
    else if (act === "logout") {
      if (confirm("Log out of No Limit?")) signOut().then(() => location.reload());
    }
    else if (act === "profile") go("profile");
    else if (act === "gosquad") go("squad");
    else if (act === "goplan") go("plan");
    else if (act === "gomusic") { go("settings"); document.getElementById("soundtrack")?.scrollIntoView({ block: "start" }); }
    else if (act === "plopen") openPlaylist(el.dataset.url);
    else if (act === "plext") { const u = safeMusicUrl(el.dataset.url); if (u) window.open(u, "_blank", "noopener"); }
    else if (act === "musremove") {
      if (!confirm("Stop sharing your soundtrack with the squad?")) return;
      setMusic(cachedUser().id, "", "")
        .then(() => { toast("Soundtrack removed"); renderSettings(); })
        .catch(() => toast("Couldn't remove — try again"));
    }
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

      setPrivacy(cachedUser().id, key === "workouts" && next ? { workouts: true, workoutsOnSince: new Date().toISOString() } : { [key]: next });
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
    PRIV_READY = true; reconcilePosts(true);
    if (TAB === "today") renderToday();
  }).catch(() => {});
  go("today");
  syncPending();                                          // retry anything saved offline earlier
}
