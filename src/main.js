/* NO LIMIT — app entry & auth gate.
   Flow: session? → (needs onboarding? → onboarding) → hydrate cloud → tracker.
   Local-first: each user has a namespaced localStorage cache; the cloud is the
   source of truth. A one-time migration lifts pre-2.0 local data into the first
   account that logs in on this device. Cloud failures never block the app. */
import "./styles.css";
import { initTracker } from "./app.js";
import { supabase } from "./data/supabaseClient.js";
import { getSession } from "./auth/auth.js";
import { mountAuth } from "./auth/authUI.js";
import { needsOnboarding } from "./auth/profile.js";
import { mountOnboarding } from "./auth/onboarding.js";
import { loadAll, migrateLocal } from "./data/cloudStore.js";
import { loadProgramme } from "./data/programmeStore.js";
import { setActiveProgramme } from "./data/programme.js";
import { loadTargets } from "./data/targets.js";
import { setActiveTargets } from "./data/targets.js";
import { getMySquad } from "./data/squad.js";
import { setCurrentSquad } from "./data/social.js";
import { loadPrivacy } from "./data/privacy.js";
import { loadMusic } from "./data/music.js";
import { loadCustomExercises } from "./data/customExercises.js";
import { handleSpotifyRedirect } from "./data/spotify.js";
import { setupPWA } from "./pwa.js";

const LEGACY_KEY = "gymtracker.v1";                       // pre-2.0 single-user blob

async function bootApp(user) {
  const [prog, tg] = await Promise.all([loadProgramme(user.id), loadTargets(user.id)]);
  setActiveProgramme(prog);                                // this user's programme (local-first)
  setActiveTargets(tg);                                    // this user's nutrition targets
  loadPrivacy(user.id);                                    // what this user shares with their squad
  loadMusic(user.id);                                      // this user's training soundtrack
  loadCustomExercises(user.id);                            // this user's custom exercise library
  getMySquad(user.id).then(sq => setCurrentSquad(sq?.id)).catch(() => {}); // cache squad for activity posts
  try {
    // 1) one-time legacy migration — the first account on this device claims it
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw && !localStorage.getItem("nl-legacy-claimed")) {
      const legacy = JSON.parse(legacyRaw);
      if ((legacy.logs || []).length || (legacy.body || []).length || (legacy.macros || []).length) {
        const r = await migrateLocal(user.id, legacy);
        console.info("[NO LIMIT] migrated local data →", r);
      }
      localStorage.setItem("nl-legacy-claimed", user.id);
    }
    // 2) hydrate this user's namespaced cache from the cloud
    const cloud = await loadAll(user.id);
    localStorage.setItem(LEGACY_KEY + ":" + user.id, JSON.stringify(cloud));
  } catch (e) {
    console.warn("[NO LIMIT] cloud unavailable — using local cache.", e);
  }
  document.body.classList.remove("chrome-hidden");
  initTracker();
}

async function routeAuthed(session) {
  const user = session.user;
  if (await needsOnboarding(user.id)) mountOnboarding(user, () => bootApp(user));
  else bootApp(user);
}

async function start() {
  setupPWA();                                              // update prompt + offline + install affordances
  await handleSpotifyRedirect();                           // returning from Spotify? exchange + clean URL
  if (!supabase) { document.body.classList.remove("chrome-hidden"); initTracker(); return; }
  const session = await getSession();
  if (session) routeAuthed(session);
  else mountAuth(routeAuthed);
}

start();
