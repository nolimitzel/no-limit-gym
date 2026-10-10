/* The persistence SEAM.
   Today it reads/writes the same localStorage blob the app has always used.
   In the next slice, app.js is routed through this module, then the localStorage
   implementation is swapped for Supabase (with an offline write-queue) WITHOUT
   touching any render or calculation code.

   NOTE: not yet wired into app.js — this is the interface the migration targets. */
const KEY = "gymtracker.v1";
const blank = () => ({ logs: [], body: [], macros: [], settings: {} });

export const localStore = {
  load() {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return blank(); }
  },
  save(db) { localStorage.setItem(KEY, JSON.stringify(db)); },
  clear() { localStorage.removeItem(KEY); },
  exportJSON() { return JSON.stringify(this.load(), null, 2); },
  hasLocalData() {
    const d = this.load();
    return d.logs.length > 0 || d.body.length > 0 || d.macros.length > 0;
  }
};

// Active backend — swapped to a Supabase-backed implementation in the next slice.
export const dataService = localStore;
