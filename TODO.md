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

## Wearables: Apple Watch, WHOOP, Garmin
Added 20 Oct 2026. Not started: don't build yet. Apple Watch fits with going native.

**Goal:** import workouts, heart rate and recovery from people's wearables, e.g. cardio
logged automatically, heart rate on lifting sessions, a "go hard or go light" hint from
recovery, and wearable workouts counting in squad challenges.

**Per device:**
- **Apple Watch:** Apple Health data has no web access; only a native iPhone app can
  read it, with the user's permission. Blocked until the app goes native (Expo route).
- **WHOOP:** public developer API (workouts, strain, recovery, sleep). Users sign in with
  WHOOP; a Supabase Edge Function keeps the login because WHOOP's sign-in needs a secret
  key. The only one doable now without anyone's approval.
- **Garmin:** Health/Activity API, server-side. Needs an application to Garmin's developer
  program and their approval (they review the business use), so not guaranteed or quick.

**Shortcut to price up:** aggregators like Terra cover Garmin, WHOOP, Fitbit, Oura and more
through one integration (Apple Health via their mobile kit), charged per user. Prices not
checked yet.

**Before building:** heart rate, sleep and recovery are health data, a special category
under UK data protection. Needs clear consent, a privacy policy that covers it, and a
squad-sharing toggle that is off by default.
