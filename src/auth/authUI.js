/* Login / Sign-up / Forgot-password screens. Renders into #view, hides app chrome.
   On a live session it calls onAuthed(session); the caller routes to onboarding or app. */
import { signIn, signUp, resetPassword } from "./auth.js";
import { esc } from "../ui/safeRender.js";

const view = () => document.getElementById("view");
let mode = "login"; // 'login' | 'signup' | 'forgot'

export function mountAuth(onAuthed) {
  document.body.classList.add("chrome-hidden");
  render(onAuthed);
}

function render(onAuthed, msg) {
  const v = view();
  v.innerHTML = `
    <div class="auth">
      <div class="auth-brand"><img class="auth-logo" src="/brand/logo-mark.png" alt="NO LIMIT Gym"></div>
      ${screen(msg)}
    </div>`;
  wire(onAuthed);
}

function field(id, label, type, extra = "") {
  return `<label class="auth-f"><span>${label}</span>
    <input id="${id}" type="${type}" autocomplete="${extra}" autocapitalize="none" spellcheck="false"></label>`;
}

function screen(msg) {
  const note = msg ? `<div class="auth-note ${msg.ok ? "ok" : "err"}">${esc(msg.text)}</div>` : "";
  if (mode === "signup") {
    return `<h1 class="auth-h">Create account</h1>
      <p class="auth-sub">Start your journey.</p>${note}
      ${field("su-name", "Name", "text", "name")}
      ${field("su-user", "Username", "text", "username")}
      ${field("su-email", "Email", "email", "email")}
      ${field("su-pass", "Password", "password", "new-password")}
      <button class="btn" id="su-go">Create account</button>
      <p class="auth-alt">Already have an account? <a data-mode="login">Log in</a></p>`;
  }
  if (mode === "forgot") {
    return `<h1 class="auth-h">Reset password</h1>
      <p class="auth-sub">We'll email you a reset link.</p>${note}
      ${field("fp-email", "Email", "email", "email")}
      <button class="btn" id="fp-go">Send reset link</button>
      <p class="auth-alt"><a data-mode="login">Back to log in</a></p>`;
  }
  return `<h1 class="auth-h">Welcome back</h1>
    <p class="auth-sub">Log in to continue your journey.</p>${note}
    ${field("li-email", "Email", "email", "email")}
    ${field("li-pass", "Password", "password", "current-password")}
    <button class="btn" id="li-go">Log in</button>
    <p class="auth-alt"><a data-mode="forgot">Forgot password?</a></p>
    <div class="auth-div"><span>or</span></div>
    <button class="btn ghost" data-mode="signup">Create account</button>`;
}

function wire(onAuthed) {
  const v = view();
  v.querySelectorAll("[data-mode]").forEach(a =>
    a.addEventListener("click", () => { mode = a.dataset.mode; render(onAuthed); }));

  const go = async (id, fn) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true; const label = btn.textContent; btn.textContent = "…";
      try { await fn(); }
      finally { btn.disabled = false; btn.textContent = label; }
    });
  };

  go("li-go", async () => {
    const email = val("li-email"), password = val("li-pass");
    const { data, error } = await signIn({ email, password });
    if (error) return render(onAuthed, { text: error.message, ok: false });
    onAuthed(data.session);
  });

  go("su-go", async () => {
    const name = val("su-name"), username = val("su-user"),
          email = val("su-email"), password = val("su-pass");
    if (!email || password.length < 6) return render(onAuthed, { text: "Enter an email and a password of 6+ characters.", ok: false });
    const { data, error } = await signUp({ email, password, name, username });
    if (error) return render(onAuthed, { text: error.message, ok: false });
    if (data.session) { onAuthed(data.session); }       // confirmation OFF → straight in
    else { mode = "login"; render(onAuthed, { text: "Account created. Check your email to confirm, then log in.", ok: true }); }
  });

  go("fp-go", async () => {
    const email = val("fp-email");
    const { error } = await resetPassword(email);
    render(onAuthed, error
      ? { text: error.message, ok: false }
      : { text: "If that email exists, a reset link is on its way.", ok: true });
    mode = "login";
  });
}

const val = (id) => (document.getElementById(id)?.value || "").trim();
