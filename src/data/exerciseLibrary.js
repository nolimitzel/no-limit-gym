/* NO LIMIT — built-in exercise library.
   The pool the programme editor picks from. Includes EVERY exercise from your
   existing plan (same keys, so logged history carries over) + a broad set of new
   options across all muscle groups. Users can also add custom exercises later.
   Fields: key (stable slug) · name · group · equipment · sets · reps · cardio? */
export const EXERCISE_LIBRARY = [
  /* ============ CHEST ============ */
  { key: "incline-db-press",      name: "Incline Dumbbell Press",     group: "Chest", equipment: "Dumbbell", sets: 4, reps: "8–10" },   // yours
  { key: "flat-db-press",         name: "Flat Dumbbell Press",        group: "Chest", equipment: "Dumbbell", sets: 4, reps: "8–10" },   // yours
  { key: "machine-chest-press",   name: "Machine Chest Press",        group: "Chest", equipment: "Machine",  sets: 4, reps: "8–10" },   // yours
  { key: "cable-pushdown",        name: "Cable Push-Down (high→low)",  group: "Chest", equipment: "Cable",    sets: 3, reps: "12–15" },  // yours
  { key: "cable-pullup",          name: "Cable Pull-Up (low→high)",    group: "Chest", equipment: "Cable",    sets: 3, reps: "12–15" },  // yours
  { key: "machine-chest-fly",     name: "Machine Chest Fly",           group: "Chest", equipment: "Machine",  sets: 3, reps: "12–15" },  // yours
  { key: "barbell-bench-press",   name: "Barbell Bench Press",         group: "Chest", equipment: "Barbell",  sets: 4, reps: "5–8" },
  { key: "incline-barbell-press", name: "Incline Barbell Press",       group: "Chest", equipment: "Barbell",  sets: 4, reps: "6–10" },
  { key: "cable-crossover",       name: "Cable Crossover",             group: "Chest", equipment: "Cable",    sets: 3, reps: "12–15" },
  { key: "pec-deck",              name: "Pec Deck",                    group: "Chest", equipment: "Machine",  sets: 3, reps: "12–15" },
  { key: "chest-dips",            name: "Chest Dips",                  group: "Chest", equipment: "Bodyweight", sets: 3, reps: "8–12" },
  { key: "push-ups",              name: "Push-Ups",                    group: "Chest", equipment: "Bodyweight", sets: 3, reps: "15–25" },

  /* ============ BACK ============ */
  { key: "barbell-row",           name: "Barbell Rows",                group: "Back", equipment: "Barbell",  sets: 4, reps: "6–8" },     // yours
  { key: "wide-lat-pulldown",     name: "Wide Grip Lat Pulldown",      group: "Back", equipment: "Cable",    sets: 3, reps: "8–12" },    // yours
  { key: "close-lat-pulldown",    name: "Close Grip Lat Pulldown",     group: "Back", equipment: "Cable",    sets: 3, reps: "10–12" },   // yours
  { key: "underarm-pulldown",     name: "Underarm Lat Pulldown",       group: "Back", equipment: "Cable",    sets: 3, reps: "10–12" },   // yours
  { key: "wide-seated-row",       name: "Wide Grip Seated Row",        group: "Back", equipment: "Cable",    sets: 3, reps: "10–12" },   // yours
  { key: "low-seated-row",        name: "Low Grip Seated Row",         group: "Back", equipment: "Cable",    sets: 3, reps: "10–12" },   // yours
  { key: "reverse-fly",           name: "Reverse Fly (Rear Delt)",     group: "Back", equipment: "Dumbbell", sets: 3, reps: "15–20" },   // yours
  { key: "deadlift",              name: "Deadlift",                    group: "Back", equipment: "Barbell",  sets: 3, reps: "3–5" },
  { key: "pull-up",               name: "Pull-Up",                     group: "Back", equipment: "Bodyweight", sets: 3, reps: "6–10" },
  { key: "chin-up",               name: "Chin-Up",                     group: "Back", equipment: "Bodyweight", sets: 3, reps: "6–10" },
  { key: "t-bar-row",             name: "T-Bar Row",                   group: "Back", equipment: "Barbell",  sets: 4, reps: "8–10" },
  { key: "single-arm-db-row",     name: "Single-Arm Dumbbell Row",     group: "Back", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "chest-supported-row",   name: "Chest-Supported Row",         group: "Back", equipment: "Machine",  sets: 3, reps: "10–12" },
  { key: "straight-arm-pulldown", name: "Straight-Arm Pulldown",       group: "Back", equipment: "Cable",    sets: 3, reps: "12–15" },
  { key: "face-pull",             name: "Face Pull",                   group: "Back", equipment: "Cable",    sets: 3, reps: "15–20" },

  /* ============ SHOULDERS ============ */
  { key: "db-shoulder-press",     name: "Dumbbell Shoulder Press",     group: "Shoulders", equipment: "Dumbbell", sets: 4, reps: "8–10" },  // yours
  { key: "db-lateral-raise",      name: "Dumbbell Lateral Raises",     group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "12–15" }, // yours
  { key: "upright-row",           name: "Upright Row",                 group: "Shoulders", equipment: "Barbell",  sets: 3, reps: "10–12" }, // yours
  { key: "leaning-cable-side-raise", name: "Leaning Cable Side Raises", group: "Shoulders", equipment: "Cable",   sets: 3, reps: "15–20" }, // yours
  { key: "cable-front-raise",     name: "Cable Front Raises",          group: "Shoulders", equipment: "Cable",    sets: 3, reps: "12–15" }, // yours
  { key: "barbell-ohp",           name: "Barbell Overhead Press",      group: "Shoulders", equipment: "Barbell",  sets: 4, reps: "5–8" },
  { key: "arnold-press",          name: "Arnold Press",                group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "machine-shoulder-press",name: "Machine Shoulder Press",      group: "Shoulders", equipment: "Machine",  sets: 3, reps: "8–12" },
  { key: "rear-delt-fly-machine", name: "Rear Delt Fly (Machine)",     group: "Shoulders", equipment: "Machine",  sets: 3, reps: "15–20" },
  { key: "shrugs",                name: "Shrugs",                      group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "12–15" },

  /* ============ ARMS — BICEPS ============ */
  { key: "incline-db-curl",       name: "Incline Dumbbell Curls",      group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },   // yours
  { key: "hammer-curl",           name: "Hammer Curls",                group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "12–15" },   // yours
  { key: "single-arm-preacher-curl", name: "Single-Arm Preacher Curls", group: "Biceps", equipment: "Cable",  sets: 3, reps: "10–12" },   // yours
  { key: "barbell-curl",          name: "Barbell Curl",                group: "Biceps", equipment: "Barbell",  sets: 3, reps: "8–12" },
  { key: "ez-bar-curl",           name: "EZ-Bar Curl",                 group: "Biceps", equipment: "EZ-Bar",   sets: 3, reps: "8–12" },
  { key: "cable-curl",            name: "Cable Curl",                  group: "Biceps", equipment: "Cable",    sets: 3, reps: "12–15" },
  { key: "concentration-curl",    name: "Concentration Curl",          group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–15" },
  { key: "preacher-curl-machine", name: "Preacher Curl (Machine)",     group: "Biceps", equipment: "Machine",  sets: 3, reps: "10–12" },

  /* ============ ARMS — TRICEPS ============ */
  { key: "tricep-pushdown",       name: "Tricep Push Down",            group: "Triceps", equipment: "Cable",    sets: 3, reps: "12–15" },   // yours
  { key: "overhead-tricep-ext",   name: "Overhead Triceps Extension",  group: "Triceps", equipment: "Cable",    sets: 3, reps: "10–12" },   // yours
  { key: "single-arm-reverse-pulldown", name: "Single-Arm Reverse Pulldown", group: "Triceps", equipment: "Cable", sets: 3, reps: "12–15" }, // yours
  { key: "close-grip-bench",      name: "Close-Grip Bench Press",      group: "Triceps", equipment: "Barbell",  sets: 3, reps: "6–10" },
  { key: "skull-crushers",        name: "Skull Crushers",              group: "Triceps", equipment: "EZ-Bar",   sets: 3, reps: "8–12" },
  { key: "rope-pushdown",         name: "Rope Pushdown",               group: "Triceps", equipment: "Cable",    sets: 3, reps: "12–15" },
  { key: "tricep-dips",           name: "Tricep Dips",                 group: "Triceps", equipment: "Bodyweight", sets: 3, reps: "8–12" },

  /* ============ LEGS ============ */
  { key: "smith-squat",           name: "Smith Machine Squats",        group: "Legs", equipment: "Smith",    sets: 4, reps: "8–10" },    // yours
  { key: "rdl",                   name: "Romanian Deadlift",           group: "Legs", equipment: "Barbell",  sets: 3, reps: "8–10" },    // yours
  { key: "leg-press",             name: "Leg Press",                   group: "Legs", equipment: "Machine",  sets: 3, reps: "10–12" },   // yours
  { key: "goblet-squat",          name: "Goblet Squats",               group: "Legs", equipment: "Dumbbell", sets: 3, reps: "10–12" },   // yours
  { key: "quad-extension",        name: "Quad Extensions",             group: "Legs", equipment: "Machine",  sets: 3, reps: "12–15" },   // yours
  { key: "leg-curl",              name: "Leg Curl",                    group: "Legs", equipment: "Machine",  sets: 3, reps: "10–15" },   // yours
  { key: "seated-calf-raise",     name: "Seated Calf Raise",           group: "Legs", equipment: "Machine",  sets: 4, reps: "15–20" },   // yours
  { key: "standing-calf-raise",   name: "Standing Calf Raise",         group: "Legs", equipment: "Machine",  sets: 4, reps: "12–15" },   // yours
  { key: "back-extension",        name: "Back Extension",              group: "Legs", equipment: "Bodyweight", sets: 3, reps: "12–15" }, // yours
  { key: "back-squat",            name: "Barbell Back Squat",          group: "Legs", equipment: "Barbell",  sets: 4, reps: "5–8" },
  { key: "front-squat",           name: "Front Squat",                 group: "Legs", equipment: "Barbell",  sets: 4, reps: "6–8" },
  { key: "hack-squat",            name: "Hack Squat",                  group: "Legs", equipment: "Machine",  sets: 4, reps: "8–12" },
  { key: "bulgarian-split-squat", name: "Bulgarian Split Squat",       group: "Legs", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "walking-lunge",         name: "Walking Lunges",              group: "Legs", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "hip-thrust",            name: "Hip Thrust",                  group: "Legs", equipment: "Barbell",  sets: 3, reps: "8–12" },
  { key: "lying-leg-curl",        name: "Lying Leg Curl",              group: "Legs", equipment: "Machine",  sets: 3, reps: "10–15" },

  /* ============ CORE ============ */
  { key: "leg-raises",            name: "Leg Raises + Ab Crunch",      group: "Core", equipment: "Bodyweight", sets: 3, reps: "15" },    // yours
  { key: "decline-situp",         name: "Decline Sit-ups",             group: "Core", equipment: "Bodyweight", sets: 3, reps: "15" },    // yours
  { key: "russian-twist",         name: "Weighted V-line Russian Twists", group: "Core", equipment: "Dumbbell", sets: 3, reps: "20" },   // yours
  { key: "plank",                 name: "Plank",                       group: "Core", equipment: "Bodyweight", sets: 3, reps: "45–60s" },
  { key: "cable-crunch",          name: "Cable Crunch",                group: "Core", equipment: "Cable",    sets: 3, reps: "15–20" },
  { key: "hanging-leg-raise",     name: "Hanging Leg Raise",           group: "Core", equipment: "Bodyweight", sets: 3, reps: "10–15" },
  { key: "ab-wheel",              name: "Ab Wheel Rollout",            group: "Core", equipment: "Bodyweight", sets: 3, reps: "8–12" },
  { key: "cable-woodchop",        name: "Cable Woodchop",              group: "Core", equipment: "Cable",    sets: 3, reps: "12–15" },

  /* ============ CARDIO ============ */
  { key: "hiit",                  name: "HIIT Intervals",              group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "15 min" }, // yours
  { key: "incline-walk",          name: "Incline Walk",                group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "20 min" },
  { key: "treadmill-run",         name: "Treadmill Run",               group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "20 min" },
  { key: "stair-master",          name: "Stair Master",                group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "15 min" },
  { key: "rowing-machine",        name: "Rowing Machine",              group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "15 min" },
  { key: "assault-bike",          name: "Assault Bike",                group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 min" },
  { key: "cycling",               name: "Cycling",                     group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "25 min" },
  { key: "jump-rope",             name: "Jump Rope",                   group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 min" },
  { key: "sprints",               name: "Sprints",                     group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 rounds" }
];

export const MUSCLE_GROUPS = ["Chest", "Shoulders", "Back", "Legs", "Biceps", "Triceps", "Core", "Cardio"];

// Fast lookup by key, and a normalized entry suitable for a programme day.
const BY_KEY = Object.fromEntries(EXERCISE_LIBRARY.map((e) => [e.key, e]));
export function libExercise(key) { return BY_KEY[key] || null; }

// Build a programme-day exercise entry (the shape app.js/logging expects).
export function toProgrammeExercise(key, overrides = {}) {
  const e = libExercise(key);
  if (!e) return null;
  return {
    id: e.key, name: e.name, target: e.group,
    sets: overrides.sets ?? e.sets, reps: overrides.reps ?? e.reps,
    ...(e.cardio ? { cardio: true } : {})
  };
}
