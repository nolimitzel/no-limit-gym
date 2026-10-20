/* Squad workout posts are derived from the workouts themselves (pure, unit-tested
   in tests/posts.test.js).

   The old flow posted once, on "Finish workout", and marked the workout posted
   even if the insert failed — so a workout auto-saved but never finished, one
   finished with no signal, or one logged before the squad had loaded never
   reached the squad (feed, leaderboard, challenges, accountability). Now every
   recent workout with at least one set should have exactly one post; anything
   missing is found by comparing against the posts already in the squad, and
   retried until the server confirms it. */

const hasSets = (l) => Object.values(l.entries || {}).some((s) => s && s.length);
const localDate = (iso) => {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

// keys a post already covers: exact (date|session) for new posts, date + title for older ones
export function postKeys(post) {
  const d = post.data || {};
  return d.date && d.key ? [d.date + "|" + d.key] : [localDate(post.created_at) + "|~" + (d.title || "")];
}

// recent workouts (on/after `since`) that have sets but no matching post
export function missingPosts(logs, posts, { since, nameOf }) {
  const have = new Set((posts || []).flatMap(postKeys));
  return (logs || []).filter((l) => l.date >= since && hasSets(l) &&
    !have.has(l.date + "|" + l.session) && !have.has(l.date + "|~" + nameOf(l.session)))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
