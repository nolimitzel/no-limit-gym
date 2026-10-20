# No Limit — to do

## Live squad listening (Spotify)
Added 20 Oct 2026. Not started: plan it first and decide before building.

**Goal:** the Squad tab shows what each squad-mate is playing on Spotify right now.

**Why it doesn't work today:** each person's Spotify login is stored only on their
own phone (`src/data/spotify.js`), so the app can only read your own "now playing".

**What it needs:**
1. Everyone in the squad connects Spotify in Settings.
2. Each person's Spotify refresh token is stored on the server (new table, owner-only
   RLS). Sensitive, so it needs a migration that Denzel applies.
3. A server job (e.g. a Supabase Edge Function on a schedule) checks each member's
   "currently playing" about once a minute and saves it for the squad to read.
4. A privacy toggle ("Share what I'm listening to"), off by default, like the
   existing Music and Workouts toggles.

**Catches:**
- Spotify Development mode allows at most 25 accounts, each added by hand in the
  Spotify dashboard (User Management). Going past that needs Spotify's approval.
- Tracks show up to about a minute late, not instantly.

**Free option meanwhile:** Spotify desktop's Friend Activity panel shows what
people you follow are playing, if they share their listening activity.
