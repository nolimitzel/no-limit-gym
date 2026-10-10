/* NO LIMIT — app entry & auth gate.
   Flow: session? → (needs onboarding? → onboarding) → tracker.  No session → auth screens.
   The existing tracker still runs on localStorage in this slice; cloud sync lands next. */
import "./styles.css";
import { initTracker } from "./app.js";
import { supabase } from "./data/supabaseClient.js";
import { getSession } from "./auth/auth.js";
import { mountAuth } from "./auth/authUI.js";
import { needsOnboarding } from "./auth/profile.js";
import { mountOnboarding } from "./auth/onboarding.js";

function bootApp() {
  document.body.classList.remove("chrome-hidden");
  initTracker();
}

async function routeAuthed(session) {
  if (await needsOnboarding(session.user.id)) mountOnboarding(session.user, bootApp);
  else bootApp();
}

async function start() {
  if (!supabase) { bootApp(); return; }          // no backend configured → local-only fallback
  const session = await getSession();
  if (session) routeAuthed(session);
  else mountAuth(routeAuthed);
}

start();
