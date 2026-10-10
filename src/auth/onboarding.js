/* Fast, one-screen onboarding. Captures goal, experience, bodyweight and training
   days, writes them to profiles + nutrition_targets, then boots the app. */
import { getProfile, saveOnboarding } from "./profile.js";
import { esc } from "../ui/safeRender.js";

const view = () => document.getElementById("view");
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GOALS = [["lean_gain", "Lean gain"], ["fat_loss", "Fat loss"], ["strength", "Strength"], ["maintain", "Maintain"]];
const EXP = [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]];

let state = { goal: "lean_gain", experience: "intermediate", training_days: ["Mon", "Tue", "Wed", "Fri", "Sat"] };

export async function mountOnboarding(user, onDone) {
  document.body.classList.add("chrome-hidden");
  const p = (await getProfile(user.id)) || {};
  state.name = p.name || user.user_metadata?.name || "";
  state.username = p.username || user.user_metadata?.username || "";
  render(user, onDone);
}

function chips(group, options, selected, multi) {
  return `<div class="ob-chips" data-group="${group}" data-multi="${multi ? 1 : 0}">` +
    options.map(([v, label]) => {
      const on = multi ? selected.includes(v) : selected === v;
      return `<button type="button" class="ob-chip ${on ? "on" : ""}" data-v="${v}">${esc(label)}</button>`;
    }).join("") + `</div>`;
}

function render(user, onDone, msg) {
  view().innerHTML = `
    <div class="ob">
      <div class="auth-brand"><span class="dot">N</span><span class="wm">NO&nbsp;LIMIT</span></div>
      <h1 class="auth-h">Set up your training</h1>
      <p class="auth-sub">Takes 30 seconds. You can change it later.</p>
      ${msg ? `<div class="auth-note err">${esc(msg)}</div>` : ""}

      <div class="ob-label">Your goal</div>
      ${chips("goal", GOALS, state.goal, false)}

      <div class="ob-label">Experience</div>
      ${chips("experience", EXP, state.experience, false)}

      <div class="ob-row">
        <label class="auth-f"><span>Bodyweight (kg)</span>
          <input id="ob-bw" type="number" inputmode="decimal" step="0.1" value="${state.bw_current ?? ""}"></label>
        <label class="auth-f"><span>Target (kg)</span>
          <input id="ob-tg" type="number" inputmode="decimal" step="0.1" value="${state.bw_target ?? ""}"></label>
      </div>

      <div class="ob-label">Training days</div>
      ${chips("training_days", DAYS.map(d => [d, d]), state.training_days, true)}

      <button class="btn" id="ob-go" style="margin-top:20px">Enter No Limit →</button>
    </div>`;
  wire(user, onDone);
}

function wire(user, onDone) {
  view().querySelectorAll(".ob-chips").forEach(grp => {
    const group = grp.dataset.group, multi = grp.dataset.multi === "1";
    grp.querySelectorAll(".ob-chip").forEach(c => c.addEventListener("click", () => {
      const v = c.dataset.v;
      if (multi) {
        const set = new Set(state[group]); set.has(v) ? set.delete(v) : set.add(v);
        state[group] = DAYS.filter(d => set.has(d));
      } else state[group] = v;
      render(user, onDone);
    }));
  });

  document.getElementById("ob-go").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    state.bw_current = parseFloat(document.getElementById("ob-bw").value) || null;
    state.bw_target = parseFloat(document.getElementById("ob-tg").value) || null;
    if (!state.training_days.length) return render(user, onDone, "Pick at least one training day.");
    btn.disabled = true; btn.textContent = "Saving…";
    const { error } = await saveOnboarding(user.id, state);
    if (error) { btn.disabled = false; btn.textContent = "Enter No Limit →"; return render(user, onDone, error.message); }
    document.body.classList.remove("chrome-hidden");
    onDone();
  });
}
