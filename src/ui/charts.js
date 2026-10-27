/* Progress charts — plain SVG strings, no library.
   Rules (dataviz skill): one series per chart in the accent, context in gray
   (emphasis); 2px lines, ~10% area wash, ≥8px end dot with a 2px surface ring,
   columns ≤24px with a 4px rounded top on a square baseline, solid hairline
   grid, text in ink tokens never the data colour, labels only at the end / the
   one point that matters. Every chart gets a tap/hover readout (crosshair on
   lines, per-column targets on bars) and a table twin built by the caller.
   Accent #CCFF00 + gray #73776F checked with validate_palette.js on the dark
   card surface #141613: CVD ΔE 40.6, contrast ≥3:1 for both. */
import { esc } from "./safeRender.js";

const ACCENT = "#CCFF00", REST = "#73776F", GRID = "rgba(255,255,255,.08)";
const INK = "#F2F3EF", INK2 = "#8B8F87", SURFACE = "#141613";
const W = 320;

function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
function ticks(min, max, count = 3) {
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
const compact = (v) => (Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10) + "K" : String(v));
// readout data rides on the wrapper; bindCharts() turns it into the tooltip
const vizAttr = (kind, pts) => ` data-viz="${esc(JSON.stringify({ kind, pts }))}"`;

/* Line for change over time. points: [{ y, label, tip: [value line, detail line] }].
   target: optional reference value (e.g. bodyweight goal) drawn as a labelled hairline. */
export function lineChart(points, { unit = "", target = null, targetLabel = "", markMax = false } = {}) {
  if (!points || points.length < 2) return "";
  const H = 170, pL = 34, pR = 44, pT = 16, pB = 24;
  const ys = points.map((p) => p.y).concat(target != null ? [target] : []);
  const tk = ticks(Math.min(...ys), Math.max(...ys));
  const mn = tk[0], mx = tk[tk.length - 1];
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const X = (i) => pL + (i / (points.length - 1)) * plotW;
  const Y = (v) => pT + (1 - (v - mn) / (mx - mn || 1)) * plotH;
  const grid = tk.map((v) => `<line x1="${pL}" y1="${Y(v).toFixed(1)}" x2="${W - pR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>
    <text x="${pL - 6}" y="${(Y(v) + 3).toFixed(1)}" fill="${INK2}" font-size="9" text-anchor="end" class="tnum">${esc(compact(v))}</text>`).join("");
  const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const area = `${pL},${pT + plotH} ${line} ${X(points.length - 1).toFixed(1)},${pT + plotH}`;
  const last = points[points.length - 1], li = points.length - 1;
  let maxI = -1;
  if (markMax) { maxI = points.reduce((m, p, i) => (p.y > points[m].y ? i : m), 0); if (maxI === li) maxI = -1; }
  const tgt = target != null ? `<line x1="${pL}" y1="${Y(target).toFixed(1)}" x2="${W - pR}" y2="${Y(target).toFixed(1)}" stroke="${INK}" stroke-opacity=".35" stroke-width="1"/>
    <text x="${W - pR + 4}" y="${(Y(target) + 3).toFixed(1)}" fill="${INK2}" font-size="9">${esc(targetLabel)}</text>` : "";
  const ring = (i, r) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(points[i].y).toFixed(1)}" r="${r}" fill="${ACCENT}" stroke="${SURFACE}" stroke-width="2"/>`;
  const pts = points.map((p, i) => ({ x: +X(i).toFixed(1), y: +Y(p.y).toFixed(1), tip: p.tip }));
  return `<div class="viz"${vizAttr("line", pts)}><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(points.length + " sessions, latest " + last.y + unit)}">
      ${grid}${tgt}
      <polygon points="${area}" fill="${ACCENT}" fill-opacity=".1"/>
      <polyline points="${line}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${maxI >= 0 ? ring(maxI, 3.5) + `<text x="${X(maxI).toFixed(1)}" y="${(Y(points[maxI].y) - 9).toFixed(1)}" fill="${INK2}" font-size="9" text-anchor="middle">best</text>` : ""}
      ${ring(li, 4.5)}
      <text x="${(X(li) + 8).toFixed(1)}" y="${(Y(last.y) + 4).toFixed(1)}" fill="${INK}" font-size="11" font-weight="700">${esc(last.y + unit)}</text>
      <text x="${pL}" y="${H - 6}" fill="${INK2}" font-size="9">${esc(points[0].label)}</text>
      <text x="${X(li).toFixed(1)}" y="${H - 6}" fill="${INK2}" font-size="9" text-anchor="end">${esc(last.label)}</text>
      <line class="viz-x" x1="0" y1="${pT}" x2="0" y2="${pT + plotH}" stroke="${INK}" stroke-opacity=".5" stroke-width="1" visibility="hidden"/>
    </svg><div class="viz-tip" hidden></div></div>`;
}

/* Columns for a count per period. bars: [{ y, label, tip, current }]; the current
   period is the accent, the rest gray. goal: optional reference line. */
export function columnChart(bars, { goal = null, goalLabel = "" } = {}) {
  if (!bars || !bars.length) return "";
  const H = 150, pL = 22, pR = 40, pT = 16, pB = 24;
  const top = Math.max(1, goal || 0, ...bars.map((b) => b.y));
  const tk = ticks(0, top, 3).filter((v) => Number.isInteger(v));
  const mx = tk[tk.length - 1];
  const plotW = W - pL - pR, plotH = H - pT - pB, slot = plotW / bars.length;
  const bw = Math.min(24, slot * 0.62);
  const Y = (v) => pT + (1 - v / mx) * plotH;
  const grid = tk.map((v) => `<line x1="${pL}" y1="${Y(v).toFixed(1)}" x2="${W - pR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>
    <text x="${pL - 6}" y="${(Y(v) + 3).toFixed(1)}" fill="${INK2}" font-size="9" text-anchor="end" class="tnum">${v}</text>`).join("");
  const col = (b, i) => {
    if (!b.y) return "";
    const x = pL + slot * i + (slot - bw) / 2, y = Y(b.y), h = pT + plotH - y, r = Math.min(4, h, bw / 2);
    // rounded top, square at the baseline
    return `<path d="M${x.toFixed(1)},${(y + h).toFixed(1)} V${(y + r).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)},${y.toFixed(1)} ${(x + bw).toFixed(1)},${(y + r).toFixed(1)} V${(y + h).toFixed(1)} Z" fill="${b.current ? ACCENT : REST}"/>`;
  };
  const cur = bars.findIndex((b) => b.current);
  const curLbl = cur >= 0 && bars[cur].y ? `<text x="${(pL + slot * cur + slot / 2).toFixed(1)}" y="${(Y(bars[cur].y) - 5).toFixed(1)}" fill="${INK}" font-size="10" font-weight="700" text-anchor="middle">${bars[cur].y}</text>` : "";
  const gl = goal ? `<line x1="${pL}" y1="${Y(goal).toFixed(1)}" x2="${W - pR}" y2="${Y(goal).toFixed(1)}" stroke="${INK}" stroke-opacity=".35" stroke-width="1"/>
    <text x="${W - pR + 4}" y="${(Y(goal) + 3).toFixed(1)}" fill="${INK2}" font-size="9">${esc(goalLabel)}</text>` : "";
  const pts = bars.map((b, i) => ({ x: +(pL + slot * i + slot / 2).toFixed(1), y: +Y(b.y || 0).toFixed(1), w: +slot.toFixed(1), tip: b.tip }));
  return `<div class="viz"${vizAttr("bar", pts)}><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Workouts per week">
      ${grid}${gl}${bars.map(col).join("")}${curLbl}
      <text x="${pL}" y="${H - 6}" fill="${INK2}" font-size="9">${esc(bars[0].label)}</text>
      <text x="${W - pR}" y="${H - 6}" fill="${INK2}" font-size="9" text-anchor="end">${esc(bars[bars.length - 1].label)}</text>
      <rect class="viz-hl" x="0" y="${pT}" width="0" height="${plotH}" fill="${INK}" fill-opacity=".06" visibility="hidden"/>
    </svg><div class="viz-tip" hidden></div></div>`;
}

/* Tiny trend line for a stat tile: gray history, accent current point. */
export function sparkline(values) {
  if (!values || values.length < 2 || values.every((v) => !v)) return "";
  const w = 88, h = 26, mx = Math.max(...values) || 1;
  const X = (i) => 2 + (i / (values.length - 1)) * (w - 6), Y = (v) => h - 3 - (v / mx) * (h - 7);
  const pts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const li = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${REST}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(li).toFixed(1)}" cy="${Y(values[li]).toFixed(1)}" r="3" fill="${ACCENT}" stroke="${SURFACE}" stroke-width="1.5"/></svg>`;
}

/* Tap / hover readout for every .viz inside root. The crosshair (lines) or the
   column highlight (bars) snaps to the nearest point; tooltip text goes in with
   textContent, never innerHTML. */
export function bindCharts(root) {
  root.querySelectorAll(".viz[data-viz]").forEach((el) => {
    let data;
    try { data = JSON.parse(el.dataset.viz); } catch { return; }
    const svg = el.querySelector("svg"), tip = el.querySelector(".viz-tip");
    const xl = svg.querySelector(".viz-x"), hl = svg.querySelector(".viz-hl");
    const show = (clientX) => {
      const box = svg.getBoundingClientRect(), k = box.width / W;
      const vx = (clientX - box.left) / k;
      let i = 0;
      data.pts.forEach((p, j) => { if (Math.abs(p.x - vx) < Math.abs(data.pts[i].x - vx)) i = j; });
      const p = data.pts[i];
      if (xl) { xl.setAttribute("x1", p.x); xl.setAttribute("x2", p.x); xl.setAttribute("visibility", "visible"); }
      if (hl) { hl.setAttribute("x", p.x - p.w / 2); hl.setAttribute("width", p.w); hl.setAttribute("visibility", "visible"); }
      tip.replaceChildren(...(p.tip || []).map((t, j) => { const d = document.createElement(j ? "small" : "b"); d.textContent = t; return d; }));
      tip.hidden = false;
      const left = Math.min(Math.max(p.x * k - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
      tip.style.left = left + "px";
      tip.style.top = Math.max(0, p.y * k - tip.offsetHeight - 12) + "px";
    };
    const hide = () => { tip.hidden = true; xl?.setAttribute("visibility", "hidden"); hl?.setAttribute("visibility", "hidden"); };
    el.addEventListener("pointermove", (e) => show(e.clientX));
    el.addEventListener("pointerdown", (e) => show(e.clientX));
    el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    el.tabIndex = 0;
    el.addEventListener("focus", () => { const b = svg.getBoundingClientRect(); show(b.left + data.pts[data.pts.length - 1].x * (b.width / W)); });
    el.addEventListener("blur", hide);
  });
}

/* Table twin: the same numbers without needing the chart (accessibility). */
export function tableView(head, rows) {
  return `<details class="viz-table"><summary>See the numbers</summary><table>
    <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
}
