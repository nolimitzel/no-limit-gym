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
  { key: "sprints",               name: "Sprints",                     group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 rounds" },

  /* ============ EXPANDED LIBRARY (Oct 2026) — common gym movements ============ */
  /* Chest */
  { key: "decline-barbell-press", name: "Decline Barbell Press", group: "Chest", equipment: "Barbell", sets: 4, reps: "6–10" },
  { key: "decline-db-press", name: "Decline Dumbbell Press", group: "Chest", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "incline-db-fly", name: "Incline Dumbbell Fly", group: "Chest", equipment: "Dumbbell", sets: 3, reps: "10–15" },
  { key: "flat-db-fly", name: "Flat Dumbbell Fly", group: "Chest", equipment: "Dumbbell", sets: 3, reps: "10–15" },
  { key: "smith-bench-press", name: "Smith Machine Bench Press", group: "Chest", equipment: "Smith", sets: 4, reps: "8–10" },
  { key: "smith-incline-press", name: "Smith Machine Incline Press", group: "Chest", equipment: "Smith", sets: 4, reps: "8–10" },
  { key: "incline-machine-press", name: "Incline Machine Press", group: "Chest", equipment: "Machine", sets: 3, reps: "8–12" },
  { key: "hammer-strength-press", name: "Plate-Loaded Chest Press", group: "Chest", equipment: "Machine", sets: 4, reps: "8–10" },
  { key: "low-cable-fly", name: "Low-to-High Cable Fly", group: "Chest", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "high-cable-fly", name: "High-to-Low Cable Fly", group: "Chest", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "single-arm-cable-press", name: "Single-Arm Cable Press", group: "Chest", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "db-pullover", name: "Dumbbell Pullover", group: "Chest", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "landmine-press", name: "Landmine Press", group: "Chest", equipment: "Barbell", sets: 3, reps: "8–12" },
  { key: "svend-press", name: "Svend Press", group: "Chest", equipment: "Plate", sets: 3, reps: "12–15" },
  { key: "incline-push-ups", name: "Incline Push-Ups", group: "Chest", equipment: "Bodyweight", sets: 3, reps: "15–20" },
  { key: "decline-push-ups", name: "Decline Push-Ups", group: "Chest", equipment: "Bodyweight", sets: 3, reps: "10–15" },
  { key: "weighted-dips", name: "Weighted Dips", group: "Chest", equipment: "Bodyweight", sets: 3, reps: "6–10" },
  /* Back */
  { key: "reverse-grip-pulldown", name: "Reverse-Grip Lat Pulldown", group: "Back", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "single-arm-lat-pulldown", name: "Single-Arm Cable Pulldown", group: "Back", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "assisted-pull-up", name: "Assisted Pull-Up", group: "Back", equipment: "Machine", sets: 3, reps: "8–12" },
  { key: "weighted-pull-up", name: "Weighted Pull-Up", group: "Back", equipment: "Bodyweight", sets: 3, reps: "5–8" },
  { key: "pendlay-row", name: "Pendlay Row", group: "Back", equipment: "Barbell", sets: 4, reps: "5–8" },
  { key: "seal-row", name: "Seal Row", group: "Back", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "meadows-row", name: "Meadows Row", group: "Back", equipment: "Barbell", sets: 3, reps: "8–12" },
  { key: "machine-row", name: "Plate-Loaded Row", group: "Back", equipment: "Machine", sets: 3, reps: "8–12" },
  { key: "single-arm-cable-row", name: "Single-Arm Cable Row", group: "Back", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "kroc-row", name: "Kroc Row", group: "Back", equipment: "Dumbbell", sets: 2, reps: "12–20" },
  { key: "inverted-row", name: "Inverted Row", group: "Back", equipment: "Bodyweight", sets: 3, reps: "8–12" },
  { key: "rack-pull", name: "Rack Pull", group: "Back", equipment: "Barbell", sets: 3, reps: "3–6" },
  { key: "trap-bar-deadlift", name: "Trap Bar Deadlift", group: "Back", equipment: "Trap Bar", sets: 3, reps: "4–6" },
  { key: "cable-pullover", name: "Rope Cable Pullover", group: "Back", equipment: "Cable", sets: 3, reps: "12–15" },
  /* Shoulders */
  { key: "smith-shoulder-press", name: "Smith Machine Shoulder Press", group: "Shoulders", equipment: "Smith", sets: 3, reps: "8–10" },
  { key: "push-press", name: "Push Press", group: "Shoulders", equipment: "Barbell", sets: 4, reps: "5–8" },
  { key: "z-press", name: "Z-Press", group: "Shoulders", equipment: "Barbell", sets: 3, reps: "6–10" },
  { key: "cable-lateral-raise", name: "Cable Lateral Raise", group: "Shoulders", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "machine-lateral-raise", name: "Machine Lateral Raise", group: "Shoulders", equipment: "Machine", sets: 3, reps: "12–15" },
  { key: "seated-lateral-raise", name: "Seated Lateral Raise", group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "12–15" },
  { key: "db-front-raise", name: "Dumbbell Front Raise", group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "12–15" },
  { key: "plate-front-raise", name: "Plate Front Raise", group: "Shoulders", equipment: "Plate", sets: 3, reps: "12–15" },
  { key: "cable-rear-delt-fly", name: "Cable Rear Delt Fly", group: "Shoulders", equipment: "Cable", sets: 3, reps: "15–20" },
  { key: "incline-y-raise", name: "Incline Y-Raise", group: "Shoulders", equipment: "Dumbbell", sets: 3, reps: "12–15" },
  { key: "cable-upright-row", name: "Cable Upright Row", group: "Shoulders", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "barbell-shrug", name: "Barbell Shrug", group: "Shoulders", equipment: "Barbell", sets: 3, reps: "10–12" },
  { key: "band-pull-apart", name: "Band Pull-Apart", group: "Shoulders", equipment: "Band", sets: 3, reps: "20" },
  { key: "pike-push-up", name: "Pike / Handstand Push-Up", group: "Shoulders", equipment: "Bodyweight", sets: 3, reps: "6–12" },
  /* Biceps */
  { key: "db-curl", name: "Dumbbell Curl", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "spider-curl", name: "Spider Curl", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "bayesian-curl", name: "Bayesian Cable Curl", group: "Biceps", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "rope-hammer-curl", name: "Rope Hammer Curl", group: "Biceps", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "cross-body-hammer-curl", name: "Cross-Body Hammer Curl", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "reverse-curl", name: "Reverse-Grip Curl", group: "Biceps", equipment: "EZ-Bar", sets: 3, reps: "10–12" },
  { key: "drag-curl", name: "Drag Curl", group: "Biceps", equipment: "Barbell", sets: 3, reps: "8–12" },
  { key: "zottman-curl", name: "Zottman Curl", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "high-cable-curl", name: "High Cable Curl", group: "Biceps", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "ez-preacher-curl", name: "EZ-Bar Preacher Curl", group: "Biceps", equipment: "EZ-Bar", sets: 3, reps: "8–12" },
  { key: "wrist-curl", name: "Wrist Curl (Forearms)", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "15–20" },
  { key: "reverse-wrist-curl", name: "Reverse Wrist Curl (Forearms)", group: "Biceps", equipment: "Dumbbell", sets: 3, reps: "15–20" },
  /* Triceps */
  { key: "vbar-pushdown", name: "V-Bar Pushdown", group: "Triceps", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "single-arm-pushdown", name: "Single-Arm Cable Pushdown", group: "Triceps", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "overhead-db-ext", name: "Overhead Dumbbell Extension", group: "Triceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "ez-overhead-ext", name: "EZ-Bar Overhead Extension", group: "Triceps", equipment: "EZ-Bar", sets: 3, reps: "8–12" },
  { key: "db-skull-crusher", name: "Dumbbell Skull Crusher", group: "Triceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "jm-press", name: "JM Press", group: "Triceps", equipment: "Barbell", sets: 3, reps: "6–10" },
  { key: "db-kickback", name: "Dumbbell Kickback", group: "Triceps", equipment: "Dumbbell", sets: 3, reps: "12–15" },
  { key: "cable-kickback", name: "Cable Kickback", group: "Triceps", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "machine-tricep-ext", name: "Machine Triceps Extension", group: "Triceps", equipment: "Machine", sets: 3, reps: "10–12" },
  { key: "tate-press", name: "Tate Press", group: "Triceps", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "diamond-push-ups", name: "Diamond Push-Ups", group: "Triceps", equipment: "Bodyweight", sets: 3, reps: "10–20" },
  { key: "bench-dips", name: "Bench Dips", group: "Triceps", equipment: "Bodyweight", sets: 3, reps: "12–15" },
  /* Legs */
  { key: "reverse-lunge", name: "Reverse Lunge", group: "Legs", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "step-up", name: "Step-Ups", group: "Legs", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "pendulum-squat", name: "Pendulum Squat", group: "Legs", equipment: "Machine", sets: 3, reps: "8–12" },
  { key: "belt-squat", name: "Belt Squat", group: "Legs", equipment: "Machine", sets: 3, reps: "8–12" },
  { key: "smith-split-squat", name: "Smith Machine Split Squat", group: "Legs", equipment: "Smith", sets: 3, reps: "8–12" },
  { key: "sumo-squat", name: "Sumo Squat", group: "Legs", equipment: "Dumbbell", sets: 3, reps: "10–12" },
  { key: "single-leg-press", name: "Single-Leg Press", group: "Legs", equipment: "Machine", sets: 3, reps: "10–12" },
  { key: "seated-leg-curl", name: "Seated Leg Curl", group: "Legs", equipment: "Machine", sets: 3, reps: "10–15" },
  { key: "nordic-curl", name: "Nordic Hamstring Curl", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "5–8" },
  { key: "db-rdl", name: "Dumbbell Romanian Deadlift", group: "Legs", equipment: "Dumbbell", sets: 3, reps: "8–12" },
  { key: "single-leg-rdl", name: "Single-Leg RDL", group: "Legs", equipment: "Dumbbell", sets: 3, reps: "8–10" },
  { key: "good-morning", name: "Good Morning", group: "Legs", equipment: "Barbell", sets: 3, reps: "8–10" },
  { key: "sumo-deadlift", name: "Sumo Deadlift", group: "Legs", equipment: "Barbell", sets: 3, reps: "3–6" },
  { key: "glute-bridge", name: "Glute Bridge", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "12–15" },
  { key: "cable-glute-kickback", name: "Cable Glute Kickback", group: "Legs", equipment: "Cable", sets: 3, reps: "12–15" },
  { key: "hip-abduction", name: "Hip Abduction Machine", group: "Legs", equipment: "Machine", sets: 3, reps: "12–20" },
  { key: "hip-adduction", name: "Hip Adduction Machine", group: "Legs", equipment: "Machine", sets: 3, reps: "12–20" },
  { key: "kb-swing", name: "Kettlebell Swing", group: "Legs", equipment: "Kettlebell", sets: 3, reps: "15–20" },
  { key: "leg-press-calf-raise", name: "Leg Press Calf Raise", group: "Legs", equipment: "Machine", sets: 4, reps: "12–15" },
  { key: "smith-calf-raise", name: "Smith Machine Calf Raise", group: "Legs", equipment: "Smith", sets: 4, reps: "12–15" },
  { key: "tibialis-raise", name: "Tibialis Raise", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "15–20" },
  { key: "box-jump", name: "Box Jumps", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "8–10" },
  { key: "jump-squat", name: "Jump Squats", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "10–15" },
  { key: "wall-sit", name: "Wall Sit", group: "Legs", equipment: "Bodyweight", sets: 3, reps: "45–60s" },
  /* Core */
  { key: "crunch", name: "Crunch", group: "Core", equipment: "Bodyweight", sets: 3, reps: "15–20" },
  { key: "reverse-crunch", name: "Reverse Crunch", group: "Core", equipment: "Bodyweight", sets: 3, reps: "12–15" },
  { key: "bicycle-crunch", name: "Bicycle Crunch", group: "Core", equipment: "Bodyweight", sets: 3, reps: "20" },
  { key: "side-plank", name: "Side Plank", group: "Core", equipment: "Bodyweight", sets: 3, reps: "30–45s" },
  { key: "dead-bug", name: "Dead Bug", group: "Core", equipment: "Bodyweight", sets: 3, reps: "10–12" },
  { key: "hollow-hold", name: "Hollow Body Hold", group: "Core", equipment: "Bodyweight", sets: 3, reps: "20–40s" },
  { key: "mountain-climbers", name: "Mountain Climbers", group: "Core", equipment: "Bodyweight", sets: 3, reps: "30–45s" },
  { key: "toes-to-bar", name: "Toes-to-Bar", group: "Core", equipment: "Bodyweight", sets: 3, reps: "8–12" },
  { key: "captains-chair", name: "Captain's Chair Leg Raise", group: "Core", equipment: "Machine", sets: 3, reps: "10–15" },
  { key: "ab-crunch-machine", name: "Ab Crunch Machine", group: "Core", equipment: "Machine", sets: 3, reps: "12–15" },
  { key: "pallof-press", name: "Pallof Press", group: "Core", equipment: "Cable", sets: 3, reps: "10–12" },
  { key: "landmine-rotation", name: "Landmine Rotation", group: "Core", equipment: "Barbell", sets: 3, reps: "10–12" },
  { key: "superman-hold", name: "Superman Hold", group: "Core", equipment: "Bodyweight", sets: 3, reps: "30s" },
  { key: "farmers-walk", name: "Farmer's Walk", group: "Core", equipment: "Dumbbell", sets: 3, reps: "40 m" },
  { key: "suitcase-carry", name: "Suitcase Carry", group: "Core", equipment: "Dumbbell", sets: 3, reps: "30 m" },
  /* Cardio */
  { key: "elliptical", name: "Elliptical", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "20 min" },
  { key: "ski-erg", name: "SkiErg", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 min" },
  { key: "sled-push", name: "Sled Push", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "6 rounds" },
  { key: "battle-ropes", name: "Battle Ropes", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "8 rounds" },
  { key: "burpees", name: "Burpees", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "10 min" },
  { key: "outdoor-run", name: "Outdoor Run", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "30 min" },
  { key: "swimming", name: "Swimming", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "30 min" },
  { key: "walk", name: "Walk", group: "Cardio", equipment: "Cardio", cardio: true, sets: 1, reps: "30 min" }
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
