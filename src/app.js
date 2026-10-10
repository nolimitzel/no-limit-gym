/* ==========================================================================
   NO LIMIT — Gym Tracker  (offline, on-device PWA)
   ========================================================================== */
import { signOut, cachedUser } from "./auth/auth.js";
import { pushWorkout, pushBodyweight, pushMacros } from "./data/cloudStore.js";
import { getActiveProgramme } from "./data/programme.js";
import { getActiveTargets, saveTargets, setActiveTargets } from "./data/targets.js";
import { openEditor } from "./programme/editor.js";

let _booted = false;
export function initTracker() {
  if (_booted) return;
  _booted = true;
  const KEY = "gymtracker.v1:" + (cachedUser()?.id || "local");  // per-user local cache
  const P = getActiveProgramme();                                 // this user's programme
  const SESSION_IDS = Object.keys(P.sessions);
  const NUMS = {};                                                // schedule day #s from the cycle
  P.cycle.forEach((c, i) => { if (c.type === "train") NUMS[c.session] = i + 1; });
  const isCardio = id => !!exMeta(id).cardio;

  /* ---------- storage ---------- */
  const blank = () => ({ logs: [], body: [], macros: [], settings: {} });
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
  function ensureAnchor() {
    // Default (and one-time migration) anchors the week to Monday = Day 1 (Push):
    // Mon Push · Tue Back · Wed Legs · Thu Rest · Fri Chest+Delts · Sat Arms · Sun Rest.
    if (!DB.settings.anchorDate || !DB.settings.scheduleV2) {
      DB.settings.anchorDate = mondayOnOrBefore(new Date());
      DB.settings.anchorPos = 0;
      DB.settings.scheduleV2 = true;
      save();
    }
  }
  function posForDate(s) {
    ensureAnchor();
    const p = (DB.settings.anchorPos + dayDiff(DB.settings.anchorDate, s)) % 7;
    return (p + 7) % 7;
  }
  function cycleFor(s) { return P.cycle[posForDate(s)]; }
  function setTodayAs(pos) {
    DB.settings.anchorDate = todayStr();
    DB.settings.anchorPos = pos;
    save();
  }
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
  function upsertLog(date, session, entries) {
    let l = getLog(date, session);
    if (!l) { l = { date, session, entries: {}, ts: Date.now() }; DB.logs.push(l); }
    l.entries = entries; l.ts = Date.now();
    save();
  }
  // most recent prior sets logged for an exercise (any session)
  function lastSetsFor(exId, beforeDate) {
    const rel = DB.logs
      .filter(l => l.entries[exId] && l.entries[exId].length && (!beforeDate || l.date < beforeDate))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return rel.length ? { date: rel[0].date, sets: rel[0].entries[exId] } : null;
  }
  function allSetsFor(exId) {
    const out = [];
    DB.logs.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(l => {
      if (l.entries[exId] && l.entries[exId].length) {
        const top = l.entries[exId].reduce((m, s) => (s.w > m.w ? s : m), l.entries[exId][0]);
        const vol = l.entries[exId].reduce((t, s) => t + (s.w * s.r || 0), 0);
        out.push({ date: l.date, top, vol });
      }
    });
    return out;
  }
  function prFor(exId) {
    let best = null;
    DB.logs.forEach(l => (l.entries[exId] || []).forEach(s => {
      if (s.w > 0 && (!best || s.w > best.w)) best = s;
    }));
    return best;
  }
  function exMeta(exId) {
    for (const sid of SESSION_IDS) {
      const e = P.sessions[sid].exercises.find(x => x.id === exId);
      if (e) return e;
    }
    return { name: exId, reps: "" };
  }

  /* ---------- tiny DOM helpers ---------- */
  const view = () => document.getElementById("view");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1900);
  }

  /* ---------- navigation ---------- */
  let TAB = "today", ACTIVE = null;
  function go(tab, opts) {
    TAB = tab; ACTIVE = (opts && opts.session) || ACTIVE;
    document.querySelectorAll(".tabbar button").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    ({ today: renderToday, train: renderTrain, progress: renderProgress, log: renderLog, plan: renderPlan }[tab])();
    window.scrollTo(0, 0);
  }

  /* ---------- header ---------- */
  function renderHeader() {
    document.getElementById("hdate").innerHTML =
      "<b>" + prettyDate(todayStr()).split(",")[0] + "</b>" +
      parseYmd(todayStr()).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  /* ============================ TODAY ============================ */
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function renderToday() {
    const today = todayStr();
    const c = cycleFor(today);
    let html = "";

    if (!isStandalone() && !DB.settings.hideInstall) {
      html += `<div class="install-hint"><span class="x" data-act="hideinstall">✕</span>
        <b>Install me:</b> tap the Share icon in Safari, then <b>“Add to Home Screen”</b> — the app runs full-screen and works offline in the gym.</div>`;
    }

    if (c.type === "rest") {
      html += `<div class="hero rest"><div class="kick">Today</div>
        <h2>Rest Day</h2><p>Recover, walk 8–10k steps, hydrate, hit your protein. Muscle is built now.</p></div>`;
    } else {
      const s = P.sessions[c.session];
      const done = getLog(today, c.session);
      html += `<div class="hero"><div class="kick">Today is gym day</div>
        <h2>${esc(s.name)}</h2><p>${esc(s.sub)}</p>
        <button class="btn" data-act="start" data-s="${c.session}">${done ? "Continue logging" : "Start workout"} →</button></div>`;
    }

    // week strip (relative to today, positions 0..6 from cycle)
    html += `<div class="week">`;
    const base = posForDate(today);
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ce = P.cycle[(base + i) % 7];
      const nm = ce.type === "rest" ? "Rest" : P.sessions[ce.session].name.replace(" + Abs", "").split(" ")[0];
      html += `<div class="d ${i === 0 ? "today" : ""} ${ce.type === "rest" ? "rest" : ""}">
        ${d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)}<b>${esc(nm)}</b></div>`;
    }
    html += `</div>`;

    // quick stats
    const wk = DB.logs.filter(l => dayDiff(l.date, today) >= 0 && dayDiff(l.date, today) < 7).length;
    const bw = DB.body.length ? DB.body[DB.body.length - 1].weight : null;
    html += `<div class="grid2" style="margin-top:16px">
      <div class="stat"><div class="n">${wk}</div><div class="l">Sessions this week</div></div>
      <div class="stat"><div class="n">${bw != null ? bw + "<span style='font-size:14px'>kg</span>" : "—"}</div><div class="l">Bodyweight</div></div>
    </div>`;

    html += `<button class="linkbtn" data-act="ics" style="margin-top:14px">📅 Add gym-day reminders to iPhone Calendar
      <small>Downloads a calendar file with a weekly alert for each training day.</small></button>`;

    view().innerHTML = html;
  }

  /* ============================ TRAIN ============================ */
  function renderTrain() {
    const today = todayStr();
    const c = cycleFor(today);
    // default to today's session if it's a training day, else keep ACTIVE, else show picker
    if (!ACTIVE && c.type === "train") ACTIVE = c.session;

    if (!ACTIVE) return renderPicker();

    const s = P.sessions[ACTIVE];
    const existing = getLog(today, ACTIVE);
    let html = `<div class="section-label">Log workout · ${esc(shortDate(today))}</div>
      <h1 class="h-title">${esc(s.full)}</h1><p class="h-sub">${esc(s.sub)} — tap to change day below.</p>
      <button class="linkbtn" data-act="picker" style="padding:11px 15px;margin-bottom:16px">↔ Switch session</button>`;

    s.exercises.forEach(ex => {
      if (ex.cardio) { html += cardioCardHtml(ex, existing); return; }
      const last = lastSetsFor(ex.id, today);
      // Values only when continuing a workout already saved today;
      // otherwise last session's numbers appear as ghost placeholders to beat.
      const saved = existing ? existing.entries[ex.id] : null;
      const ghost = !existing && last ? last.sets : null;
      const nRows = Math.max(ex.sets, saved ? saved.length : 0, ghost ? ghost.length : 0);
      let rows = "";
      for (let i = 0; i < nRows; i++) {
        rows += setRowHtml(ex.id, i, saved && saved[i] ? saved[i] : null,
                           ghost && ghost[i] ? ghost[i] : null);
      }
      const lastTxt = last
        ? `Last (${esc(shortDate(last.date))}): <b>${last.sets.map(x => `${x.w}×${x.r}`).join("  ")}</b>`
        : `No history yet — set your baseline.`;
      html += `<div class="ex" data-ex="${ex.id}">
        <div class="ex-h">
          <div class="info"><b>${esc(ex.name)}${ex.isNew ? '<span class="tag-new">NEW</span>' : ""}</b>
            <div class="meta">${esc(ex.target)}</div></div>
          <div class="tgt">${esc(ex.reps)} reps<small>${ex.sets} sets</small></div>
        </div>
        <div class="last">${lastTxt}</div>
        <div class="sets">
          <div class="set-head"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span></span></div>
          <div class="rows">${rows}</div>
        </div>
        <div class="addset" data-act="addset" data-ex="${ex.id}">+ Add set</div>
      </div>`;
    });

    html += `<div style="height:70px"></div>
      <div class="savebar">
        <button class="btn" data-act="save" data-s="${ACTIVE}">Save workout ✓</button>
      </div>`;
    view().innerHTML = html;
  }

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
    return `<div class="ex cardio" data-ex="${ex.id}">
      <div class="ex-h">
        <div class="info"><b>🔥 ${esc(ex.name)}</b><div class="meta">${esc(P.cardio.protocol)}</div></div>
        <div class="tgt">${esc(ex.reps)}<small>cardio</small></div>
      </div>
      <div class="sets">
        <div class="set-head"><span></span><span>Minutes</span><span>Rounds</span><span></span></div>
        <div class="rows"><div class="set-row">
          <span class="sn">🔥</span>
          <input class="w" type="number" inputmode="numeric" placeholder="min" value="${pv ? pv.w : ""}">
          <input class="r" type="number" inputmode="numeric" placeholder="rds" value="${pv ? pv.r : ""}">
          <span class="del" style="visibility:hidden">✕</span></div></div>
      </div></div>`;
  }

  function renderPicker() {
    let html = `<div class="section-label">Choose session</div>
      <h1 class="h-title">Train</h1><p class="h-sub">Pick any session — train what you like, when you like.</p>`;
    SESSION_IDS.forEach(id => {
      const s = P.sessions[id];
      html += `<button class="pick" data-act="pick" data-s="${id}">
        <span class="num">D${NUMS[id]}</span>
        <span class="txt"><b>${esc(s.full)}</b><span>${esc(s.sub)}</span></span>
        <span class="arw">›</span></button>`;
    });
    view().innerHTML = html;
  }

  function saveWorkout(session) {
    const entries = {};
    let count = 0;
    document.querySelectorAll(`.ex[data-ex]`).forEach(card => {
      const exId = card.dataset.ex;
      const sets = [];
      card.querySelectorAll(".set-row").forEach(row => {
        const w = parseFloat(row.querySelector(".w").value);
        const r = parseInt(row.querySelector(".r").value, 10);
        if (!isNaN(w) || !isNaN(r)) { sets.push({ w: isNaN(w) ? 0 : w, r: isNaN(r) ? 0 : r }); }
      });
      if (sets.length) { entries[exId] = sets; count += sets.length; }
    });
    if (count === 0) { toast("Log at least one set"); return; }
    upsertLog(todayStr(), session, entries);
    const u = cachedUser();
    if (u) pushWorkout(u.id, { date: todayStr(), session, entries }).catch(() => {});
    toast("Workout saved 💪");
    go("progress");
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
      <button class="btn" data-act="weekly" style="margin:0 0 16px">📋 Weekly review — copy to share</button>
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
    const prs = lifted.map(id => ({ id, pr: prFor(id) })).filter(x => x.pr && x.pr.w > 0)
      .sort((a, b) => b.pr.w - a.pr.w);
    if (prs.length) {
      prs.forEach(x => {
        html += `<div class="pr-row"><span>${esc(exMeta(x.id).name)}</span>
          <span class="v">${x.pr.w} kg × ${x.pr.r}</span></div>`;
      });
    } else {
      html += `<div class="empty">Your heaviest set on each lift will appear here.</div>`;
    }
    html += `</div>`;
    html += `<button class="linkbtn" data-act="history" style="margin-top:14px">📅 View full workout history
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
      const s = P.sessions[l.session];
      const name = s ? (s.full || s.name) : l.session;
      const rows = Object.entries(l.entries).map(([id, sets]) => {
        const nm = exMeta(id).name;
        const top = sets.reduce((m, x) => (x.w > m.w ? x : m), sets[0]);
        const label = isCardio(id) ? `${top.w} min · ${top.r} rounds` : `${sets.length} × ${top.w}kg`;
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
    return svgLine(hist.map(h => ({ label: h.date, y: h.top.w })), "kg");
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
  function topSet(sets) { return sets.reduce((m, s) => (s.w > m.w ? s : m), sets[0]); }
  function allTimeTopBefore(id, beforeDate) {
    let best = null;
    DB.logs.forEach(l => { if (l.date < beforeDate) (l.entries[id] || []).forEach(s => { if (s.w > 0 && (!best || s.w > best.w)) best = s; }); });
    return best;
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

    // Training adherence
    let done = 0, sched = 0; const tl = [];
    days.forEach((d, i) => {
      const c = cycleFor(d);
      if (c.type === "rest") { tl.push(`—  ${dn[i]} · Rest`); return; }
      sched++;
      const log = getLog(d, c.session);
      const nm = P.sessions[c.session].name;
      if (log) { done++; const n = Object.keys(log.entries).filter(id => !isCardio(id)).length; tl.push(`✔  ${dn[i]} · ${nm} — ${n} exercises`); }
      else tl.push(`${d > today ? "·" : "✘"}  ${dn[i]} · ${nm} — ${d > today ? "upcoming" : "NOT logged"}`);
    });
    L.push(`TRAINING — ${done}/${sched} sessions done`);
    tl.forEach(x => L.push(x));
    L.push("");

    // Key lifts vs before + PRs
    const weekLogs = DB.logs.filter(l => days.indexOf(l.date) >= 0);
    const exWeek = {};
    weekLogs.forEach(l => Object.entries(l.entries).forEach(([id, sets]) => {
      if (isCardio(id) || !sets.length) return;
      const tp = topSet(sets);
      if (!exWeek[id] || tp.w > exWeek[id].w) exWeek[id] = tp;
    }));
    const lifts = Object.keys(exWeek);
    if (lifts.length) {
      L.push("KEY LIFTS (top set vs before)");
      const prs = [];
      lifts.forEach(id => {
        const tp = exWeek[id], prev = allTimeTopBefore(id, days[0]);
        let tag;
        if (!prev) { tag = "first time"; prs.push(`${exMeta(id).name} — ${tp.w}kg×${tp.r}`); }
        else if (tp.w > prev.w) { tag = `▲ up from ${prev.w}kg`; prs.push(`${exMeta(id).name} — ${tp.w}kg×${tp.r}`); }
        else if (tp.w < prev.w) tag = `▼ down from ${prev.w}kg`;
        else tag = "= held";
        L.push(`${exMeta(id).name}: ${tp.w}kg×${tp.r} (${tag})`);
      });
      L.push("");
      if (prs.length) { L.push("🏆 PERSONAL RECORDS THIS WEEK"); prs.forEach(p => L.push("• " + p)); L.push(""); }
    }

    // Cardio
    const cardio = weekLogs.filter(l => l.entries["hiit"] && l.entries["hiit"].length).length;
    L.push(`CARDIO — HIIT ${cardio}/3 sessions`);
    L.push("");

    // Bodyweight
    const bw = DB.body.filter(b => days.indexOf(b.date) >= 0).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (bw.length) {
      const s = bw[0].weight, e = bw[bw.length - 1].weight, dlt = +(e - s).toFixed(1);
      L.push(`BODYWEIGHT — ${s}kg → ${e}kg (${dlt >= 0 ? "+" : ""}${dlt}kg this week) · target 76kg`);
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
    if (done < sched) flags.push(`Missed ${sched - done} training session(s)`);
    if (cardio < 3) flags.push(`Cardio ${cardio}/3 — ${3 - cardio} short`);
    if (!bw.length) flags.push("No bodyweight logged");
    if (mac.length < 5) flags.push(`Only ${mac.length}/7 days of food logged`);
    if (flags.length) { L.push(""); L.push("⚠️ FLAGS"); flags.forEach(f => L.push("• " + f)); }

    L.push("");
    L.push("— Paste this into your coach chat to review the week —");
    return L.join("\n");
  }
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
      <button class="linkbtn" data-act="edittargets" style="margin-top:14px">✎ Edit my targets
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
    html += `<button class="linkbtn" data-act="gofuel" style="margin-top:12px">🍽 What should I eat today?
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
    const nums = NUMS;
    let html = `<div class="section-label">Reference</div><h1 class="h-title">The Plan</h1>
      <p class="h-sub">Your full programme, always in your pocket.</p>
      <button class="btn" data-act="editprog" style="margin:0 0 18px">✎ Edit my programme</button>`;

    html += `<div class="subhead">Warm-up · every session</div><div class="card"><ul class="clean">` +
      P.warmup.map(w => `<li>${esc(w)}</li>`).join("") + `</ul></div>`;

    html += `<div class="subhead">The five days</div>`;
    SESSION_IDS.forEach(id => {
      const s = P.sessions[id];
      html += `<div class="plan-day"><div class="ph"><span class="n">Day ${nums[id]}</span>
        <div><b>${esc(s.full)}</b><span>${esc(s.sub)}</span></div></div>` +
        s.exercises.map(e => `<div class="plan-ex"><span>${esc(e.name)}${e.isNew ? '<span class="tag-new">NEW</span>' : ""}</span>
          <span class="s">${esc(e.reps)} · ${e.sets}×</span></div>`).join("") + `</div>`;
    });

    html += `<div class="subhead">Training rules</div><div class="card"><ul class="clean">` +
      P.rules.map(r => `<li>${esc(r)}</li>`).join("") + `</ul></div>`;

    const t = getActiveTargets();
    html += `<div class="subhead">Nutrition · your targets</div><div class="card"><ul class="clean">
      <li><b>Calories:</b> ${t.kcal}</li>
      <li><b>Protein:</b> ${t.protein} g</li>
      <li><b>Carbs:</b> ${t.carbs} g · <b>Fats:</b> ${t.fats} g</li>
      <li><b>Breakfast:</b> oats + whey + berries + peanut butter</li>
      <li><b>Timing:</b> breakfast · lunch · post-workout shake · dinner</li></ul></div>`;

    html += renderFuel();

    html += `<div class="subhead">Supplements</div><div class="card"><ul class="clean">` +
      P.supplements.map(s => `<li><b>${esc(s[0])}</b> — ${esc(s[1])}, ${esc(s[2])}. ${esc(s[3])}.</li>`).join("") +
      `</ul><div class="note">${esc(P.aminoNote)}</div></div>`;

    // settings / data
    html += `<div class="subhead">Set-up &amp; data</div>`;
    const curPos = posForDate(todayStr());
    const opts = P.cycle.map((c, i) => {
      const nm = c.type === "rest" ? "Rest day" : P.sessions[c.session].full;
      return `<option value="${i}" ${i === curPos ? "selected" : ""}>${esc(nm)}</option>`;
    }).join("");
    html += `<div class="card"><div class="field"><label>What is today in your cycle? (sets your schedule)</label>
      <select class="sel" data-act="setanchor">${opts}</select></div></div>`;

    html += `<button class="linkbtn" data-act="ics">📅 Add gym-day reminders to Calendar
        <small>Weekly alerts for each training day (.ics file for iPhone Calendar).</small></button>
      <button class="linkbtn" data-act="export">⬇︎ Back up my data
        <small>Download all your logs as a file you can keep safe.</small></button>
      <button class="linkbtn" data-act="importbtn">⬆︎ Restore from backup
        <small>Load a previously saved backup file.</small></button>
      <input id="importfile" type="file" accept="application/json" style="display:none">
      <button class="linkbtn" data-act="reset" style="border-color:#5a3030">🗑 Reset all data
        <small>Erase every log and start fresh. Cannot be undone.</small></button>
      <div class="subhead">Account</div>
      <div class="card"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Signed in as</div>
        <div style="font-family:var(--cond);font-size:16px;margin-top:3px">${esc(cachedUser()?.email || "—")}</div></div>
      <button class="linkbtn" data-act="logout" style="border-color:#5a3030">↩ Log out</button>
      <div style="text-align:center;color:var(--dim);font-size:11px;margin-top:18px">
        No Limit — every muscle, every head, no excuses.</div>`;

    view().innerHTML = html;
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
    if (act === "start" || act === "pick") { ACTIVE = el.dataset.s; go("train"); }
    else if (act === "picker") { ACTIVE = null; renderPicker(); }
    else if (act === "save") saveWorkout(el.dataset.s);
    else if (act === "addset") {
      const rows = document.querySelector(`.ex[data-ex="${el.dataset.ex}"] .rows`);
      rows.insertAdjacentHTML("beforeend", setRowHtml(el.dataset.ex, rows.children.length, null));
    }
    else if (act === "delset") {
      const row = el.closest(".set-row"); const rows = row.parentElement;
      row.remove();
      [...rows.children].forEach((r, i) => r.querySelector(".sn").textContent = i + 1);
    }
    else if (act === "savebw") {
      const v = parseFloat(document.getElementById("bw").value);
      if (isNaN(v)) { toast("Enter a weight"); return; }
      const t = todayStr(); const ex = DB.body.find(b => b.date === t);
      if (ex) ex.weight = v; else DB.body.push({ date: t, weight: v });
      DB.body.sort((a, b) => (a.date < b.date ? -1 : 1)); save();
      { const u = cachedUser(); if (u) pushBodyweight(u.id, { date: t, weight: v }).catch(() => {}); }
      toast("Weight saved"); renderLog();
    }
    else if (act === "savemacro") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : v; };
      const t = todayStr(); let m = DB.macros.find(x => x.date === t);
      if (!m) { m = { date: t }; DB.macros.push(m); }
      m.kcal = num("kcal"); m.protein = num("prot"); m.carbs = num("carbs"); m.fats = num("fats");
      DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1)); save();
      { const u = cachedUser(); if (u) pushMacros(u.id, { date: t, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats }).catch(() => {}); }
      toast("Fuel logged"); renderLog();
    }
    else if (act === "addmeal") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : v; };
      const ml = { name: (document.getElementById("ml-name").value || "").trim() || "Meal",
        kcal: num("ml-kcal"), protein: num("ml-prot"), carbs: num("ml-carbs"), fats: num("ml-fats") };
      if (!ml.kcal && !ml.protein && !ml.carbs && !ml.fats) { toast("Enter the meal's macros"); return; }
      const t = todayStr(); let m = DB.macros.find(x => x.date === t);
      if (!m) { m = { date: t, kcal: 0, protein: 0, carbs: 0, fats: 0 }; DB.macros.push(m); }
      m.meals = m.meals || [];
      m.meals.push(ml);
      m.kcal = (m.kcal || 0) + ml.kcal; m.protein = (m.protein || 0) + ml.protein;
      m.carbs = (m.carbs || 0) + ml.carbs; m.fats = (m.fats || 0) + ml.fats;
      DB.macros.sort((a, b) => (a.date < b.date ? -1 : 1)); save();
      { const u = cachedUser(); if (u) pushMacros(u.id, { date: t, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats }).catch(() => {}); }
      toast("Meal added"); renderLog();
    }
    else if (act === "delmeal") {
      const idx = +el.dataset.idx, t = todayStr(), m = DB.macros.find(x => x.date === t);
      if (m && m.meals && m.meals[idx]) {
        const ml = m.meals.splice(idx, 1)[0];
        m.kcal = Math.max(0, (m.kcal || 0) - ml.kcal); m.protein = Math.max(0, (m.protein || 0) - ml.protein);
        m.carbs = Math.max(0, (m.carbs || 0) - ml.carbs); m.fats = Math.max(0, (m.fats || 0) - ml.fats);
        save();
        const u = cachedUser(); if (u) pushMacros(u.id, { date: t, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats }).catch(() => {});
        renderLog();
      }
    }
    else if (act === "edittargets") editTargets();
    else if (act === "savetargets") {
      const num = id => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? 0 : v; };
      const tg = { kcal: num("tg-kcal"), protein: num("tg-prot"), carbs: num("tg-carbs"), fats: num("tg-fats") };
      setActiveTargets(tg);
      const u = cachedUser(); if (u) saveTargets(u.id, tg).catch(() => {});
      const mo = el.closest(".modal"); if (mo) mo.remove();
      toast("Targets updated"); renderLog();
    }
    else if (act === "ics") { download("gym-reminders.ics", buildICS(), "text/calendar"); toast("Open the file to add to Calendar"); }
    else if (act === "export") { download("gym-backup-" + todayStr() + ".json", JSON.stringify(DB, null, 2), "application/json"); toast("Backup downloaded"); }
    else if (act === "importbtn") { document.getElementById("importfile").click(); }
    else if (act === "reset") {
      if (confirm("Erase ALL logs, bodyweight and macros? This cannot be undone.")) {
        localStorage.removeItem(KEY); DB = load(); ensureAnchor(); toast("All data reset"); go("today");
      }
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
    else if (act === "editprog") openEditor(() => go("plan"));
    else if (act === "history") renderHistory();
    else if (act === "backprogress") go("progress");
  });

  document.addEventListener("change", function (e) {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "liftsel") { ACTIVE_LIFT = el.value; document.getElementById("liftchart").innerHTML = liftChart(el.value); }
    else if (el.dataset.act === "setanchor") { setTodayAs(parseInt(el.value, 10)); toast("Schedule updated"); }
    else if (el.id === "importfile" && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          DB = Object.assign(blank(), d); save(); toast("Backup restored"); go("today");
        } catch (err) { toast("Couldn't read that file"); }
      };
      r.readAsText(el.files[0]);
    }
  });

  document.querySelectorAll(".tabbar button").forEach(b =>
    b.addEventListener("click", () => { if (b.dataset.tab === "train") ACTIVE = null; go(b.dataset.tab); }));

  /* ---------- boot ---------- */
  ensureAnchor();
  renderHeader();
  go("today");
}
