/* NO LIMIT — app entry & auth gate.
   Flow: session? → (needs onboarding? → onboarding) → sync with cloud → tracker.
   Local-first: each user has a namespaced localStorage cache. At boot the cloud
   copy is MERGED into it (core/sync.js) — never written over it — so anything
   saved on this device but not yet synced survives the launch and is re-pushed
   (AUDIT C1). A one-time migration lifts pre-2.0 local data into the first
   account that logs in on this device. Cloud failures never block the app. */
import "./dev/simOffline.js";                             // dev-only offline test switch (no-op in production)
import "./styles.css";
import { initTracker } from "./app.js";
import { supabase, isRecoveryLink } from "./data/supabaseClient.js";
import { getSession } from "./auth/auth.js";
import { mountAuth, mountSetPassword } from "./auth/authUI.js";
import { needsOnboarding } from "./auth/profile.js";
import { mountOnboarding } from "./auth/onboarding.js";
import { loadAll, migrateLocal } from "./data/cloudStore.js";
import { loadProgramme, saveProgramme } from "./data/programmeStore.js";
import { setActiveProgramme } from "./data/programme.js";
import { loadTargets, setActiveTargets } from "./data/targets.js";
import { getMySquad } from "./data/squad.js";
import { setCurrentSquad } from "./data/social.js";
import { loadPrivacy } from "./data/privacy.js";
import { loadMusic } from "./data/music.js";
import { loadCustomExercises } from "./data/customExercises.js";
import { handleSpotifyRedirect } from "./data/spotify.js";
import { mergeDB } from "./core/sync.js";
import { sanitizeProgramme } from "./core/programme.js";
import { setupPWA } from "./pwa.js";

const LEGACY_KEY = "gymtracker.v1";                       // pre-2.0 single-user blob

async function bootApp(user) {
  const [rawProg, tg] = await Promise.all([loadProgramme(user.id), loadTargets(user.id)]);
  const { programme, changed } = sanitizeProgramme(rawProg);
  if (changed) saveProgramme(user.id, programme);         // heal a broken schedule everywhere (AUDIT C4)
  setActiveProgramme(programme);
  setActiveTargets(tg);
  loadPrivacy(user.id);
  loadMusic(user.id);
  loadCustomExercises(user.id);
  getMySquad(user.id).then(sq => setCurrentSquad(sq?.id)).catch(() => {});
  const cacheKey = LEGACY_KEY + ":" + user.id;
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
    // 2) merge the cloud copy into this device's cache (complete read or throws)
    const cloud = await loadAll(user.id);
    let local = {};
    try { local = JSON.parse(localStorage.getItem(cacheKey) || "{}") || {}; } catch {}
    localStorage.setItem(cacheKey, JSON.stringify(mergeDB(local, cloud)));
  } catch (e) {
    console.warn("[NO LIMIT] cloud unavailable — using this device's data.", e?.message || e);
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
  // a password-reset email link signs the user in — make them choose a new password (AUDIT M9)
  let recovering = isRecoveryLink;
  supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") recovering = true; });
  const session = await getSession();
  if (recovering && session) { mountSetPassword(() => location.replace("/")); return; }
  if (session) routeAuthed(session);
  else mountAuth(routeAuthed);
}

start();
