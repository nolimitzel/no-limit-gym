/* PWA polish — update prompt, offline indicator, and an install affordance.
   Update uses vite-plugin-pwa's prompt flow; offline/install are standard
   browser events (iOS Safari uses the in-app "Add to Home Screen" hint). */
import { registerSW } from "virtual:pwa-register";

function bottomBanner(id, html) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; el.className = "pwa-bottom"; document.body.appendChild(el); }
  el.innerHTML = html;
  requestAnimationFrame(() => el.classList.add("show"));
  return el;
}

export function setupPWA() {
  // 1) a new version was deployed → offer to refresh
  const updateSW = registerSW({
    onNeedRefresh() {
      const el = bottomBanner("pwa-update", `<span>New version available</span><button class="pwa-act" id="pwa-up">Update</button>`);
      el.querySelector("#pwa-up").onclick = () => updateSW(true);   // activates new SW + reloads
    },
  });

  // 2) offline indicator (top strip)
  let off = document.getElementById("pwa-offline");
  if (!off) {
    off = document.createElement("div"); off.id = "pwa-offline"; off.className = "pwa-top";
    off.textContent = "Offline — your logs save on-device and sync when you're back.";
    document.body.appendChild(off);
  }
  const syncOnline = () => off.classList.toggle("show", !navigator.onLine);
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();

  // 3) install affordance (Android / desktop Chrome fire beforeinstallprompt)
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const el = bottomBanner("pwa-install", `<span>Install NO LIMIT</span><button class="pwa-act" id="pwa-in">Install</button>`);
    el.querySelector("#pwa-in").onclick = async () => {
      el.classList.remove("show"); deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null;
    };
  });
  window.addEventListener("appinstalled", () => document.getElementById("pwa-install")?.classList.remove("show"));
}
