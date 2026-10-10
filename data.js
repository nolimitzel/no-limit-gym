/* ==========================================================================
   THE PLAN — single source of truth for the training programme.
   Exercise ids are shared across sessions so history/PRs aggregate per lift.
   ========================================================================== */
window.PLAN = {
  // Nutrition targets (lean gain 72 -> 76 kg)
  targets: { kcalMin: 2650, kcalMax: 2800, proteinMin: 150, proteinMax: 170,
             carbsMin: 280, carbsMax: 330, fatMin: 65, fatMax: 80 },

  // Intense cardio protocol (HIIT) — done after Push, Back and Arms days
  cardio: {
    name: "HIIT Intervals",
    protocol: "1 min hard (sprint / fast incline) → 1 min easy walk. Repeat 7–8 rounds ≈ 15 min.",
    note: "Do it AFTER lifting on Push, Back and Arms days (3×/week). Never after legs — they're already fried. Treadmill, bike, rower or outdoor sprints all work. Keep 8–10k daily steps on top for the rest of your fat loss.",
  },

  // Sessions keyed by id
  sessions: {
    push: { name: "Push", full: "Push", sub: "Chest · Shoulders · Triceps · HIIT",
      exercises: [
        { id: "incline-db-press", name: "Incline Dumbbell Press", sets: 4, reps: "8–10", target: "Upper chest", isNew: true },
        { id: "flat-db-press", name: "Flat Dumbbell Press", sets: 4, reps: "8–10", target: "Mid chest" },
        { id: "cable-pushdown", name: "Cable Push-Down (high→low)", sets: 3, reps: "12–15", target: "Lower chest" },
        { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", sets: 4, reps: "8–10", target: "Front delt" },
        { id: "db-lateral-raise", name: "Dumbbell Lateral Raises", sets: 3, reps: "12–15", target: "Side delt" },
        { id: "tricep-pushdown", name: "Tricep Push Down", sets: 3, reps: "12–15", target: "Lateral head" },
        { id: "overhead-tricep-ext", name: "Overhead Triceps Extension", sets: 3, reps: "10–12", target: "Long head" },
        { id: "hiit", name: "HIIT Intervals", sets: 1, reps: "15 min", target: "1 min hard / 1 min easy", cardio: true },
      ]},
    back: { name: "Back + Biceps", full: "Back + Biceps", sub: "Full back · 3 pulldowns · 2 rows · HIIT",
      exercises: [
        { id: "barbell-row", name: "Barbell Rows", sets: 4, reps: "6–8", target: "Mid-back thickness" },
        { id: "wide-lat-pulldown", name: "Wide Grip Lat Pulldown", sets: 3, reps: "8–12", target: "Lat width / upper lats" },
        { id: "close-lat-pulldown", name: "Close Grip Lat Pulldown", sets: 3, reps: "10–12", target: "Lower lats / mid-back", isNew: true },
        { id: "underarm-pulldown", name: "Underarm Lat Pulldown", sets: 3, reps: "10–12", target: "Lower lats" },
        { id: "wide-seated-row", name: "Wide Grip Seated Row", sets: 3, reps: "10–12", target: "Rhomboids / mid-back" },
        { id: "low-seated-row", name: "Low Grip Seated Row", sets: 3, reps: "10–12", target: "Lower / inner back" },
        { id: "reverse-fly", name: "Reverse Fly (Rear Delt)", sets: 3, reps: "15–20", target: "Rear delts" },
        { id: "incline-db-curl", name: "Incline Dumbbell Curls", sets: 3, reps: "10–12", target: "Biceps long head" },
        { id: "hammer-curl", name: "Hammer Curls", sets: 3, reps: "12–15", target: "Brachialis" },
        { id: "hiit", name: "HIIT Intervals", sets: 1, reps: "15 min", target: "1 min hard / 1 min easy", cardio: true },
      ]},
    legs: { name: "Legs + Abs", full: "Legs + Abs", sub: "Quads · Hams · Glutes · Calves · Core",
      exercises: [
        { id: "smith-squat", name: "Smith Machine Squats", sets: 4, reps: "8–10", target: "Quads / glutes" },
        { id: "rdl", name: "Romanian Deadlift", sets: 3, reps: "8–10", target: "Hamstrings + glutes", isNew: true },
        { id: "leg-press", name: "Leg Press", sets: 3, reps: "10–12", target: "Quads / glutes" },
        { id: "goblet-squat", name: "Goblet Squats", sets: 3, reps: "10–12", target: "Quads / adductors" },
        { id: "quad-extension", name: "Quad Extensions", sets: 3, reps: "12–15", target: "Quads (4 heads)" },
        { id: "leg-curl", name: "Leg Curl", sets: 3, reps: "10–15", target: "Hamstrings" },
        { id: "seated-calf-raise", name: "Seated Calf Raise", sets: 4, reps: "15–20", target: "Soleus" },
        { id: "standing-calf-raise", name: "Standing Calf Raise", sets: 4, reps: "12–15", target: "Gastrocnemius", isNew: true },
        { id: "back-extension", name: "Back Extension", sets: 3, reps: "12–15", target: "Lower back / erectors", isNew: true },
        { id: "leg-raises", name: "Leg Raises + Ab Crunch", sets: 3, reps: "15", target: "Lower + upper abs" },
      ]},
    chestshoulders: { name: "Chest + Delts", full: "Chest + Shoulders + Abs", sub: "2nd chest & shoulder hit",
      exercises: [
        { id: "machine-chest-press", name: "Machine Chest Press", sets: 4, reps: "8–10", target: "Overall chest" },
        { id: "cable-pullup", name: "Cable Pull-Up (low→high)", sets: 3, reps: "12–15", target: "Upper chest" },
        { id: "machine-chest-fly", name: "Machine Chest Fly (3 heights)", sets: 3, reps: "12–15", target: "Inner / full chest" },
        { id: "upright-row", name: "Upright Row", sets: 3, reps: "10–12", target: "Side delt / traps" },
        { id: "leaning-cable-side-raise", name: "Leaning Cable Side Raises", sets: 3, reps: "15–20", target: "Side delt" },
        { id: "cable-front-raise", name: "Cable Front Raises", sets: 3, reps: "12–15", target: "Front delt" },
        { id: "decline-situp", name: "Decline Sit-ups", sets: 3, reps: "15", target: "Upper abs" },
      ]},
    arms: { name: "Arms + Abs", full: "Arms + Abs", sub: "Biceps · Triceps · Core · HIIT",
      exercises: [
        { id: "single-arm-preacher-curl", name: "Single-Arm Preacher Curls", sets: 3, reps: "10–12", target: "Biceps short head" },
        { id: "single-arm-reverse-pulldown", name: "Single-Arm Reverse Pulldown", sets: 3, reps: "12–15", target: "Triceps medial head" },
        { id: "hammer-curl", name: "Hammer Curls", sets: 3, reps: "12–15", target: "Brachialis" },
        { id: "overhead-tricep-ext", name: "Overhead Triceps Extension", sets: 3, reps: "10–12", target: "Triceps long head" },
        { id: "russian-twist", name: "Weighted V-line Russian Twists", sets: 3, reps: "20", target: "Obliques" },
        { id: "hiit", name: "HIIT Intervals", sets: 1, reps: "15 min", target: "1 min hard / 1 min easy", cardio: true },
      ]},
  },

  // 7-day rolling cycle (position -> what happens that day)
  cycle: [
    { type: "train", session: "push" },
    { type: "train", session: "back" },
    { type: "train", session: "legs" },
    { type: "rest" },
    { type: "train", session: "chestshoulders" },
    { type: "train", session: "arms" },
    { type: "rest" },
  ],

  // Reference content for the Plan tab
  warmup: [
    "General (5 min): incline walk / bike / rower to raise body temp.",
    "Push / Chest / Shoulders: band pull-aparts ×20, shoulder dislocates ×10.",
    "Back: band pull-aparts ×20, dead hangs, cat-cow.",
    "Legs: bodyweight squats ×15, leg swings, hip openers, lunges ×10.",
    "Arms: one light pump set of curls + pushdowns.",
    "Ramp-up: before your first heavy lift only — 2–3 sets up to working weight.",
  ],
  rules: [
    "Progressive overload — beat last week: add a rep or a little weight. Hit top of the range on all sets → add weight.",
    "Effort — last 1–2 reps hard (RPE 8–9). Push isolation near failure; leave 1–2 in the tank on heavy barbell lifts.",
    "Rest — 2–3 min on big compounds, 60–90 sec on isolation.",
    "Cardio — HIIT after lifting on Push, Back & Arms days. Don't let it cut into your lifting effort.",
    "Log every set (that's what this app is for).",
    "Deload every 6–8 weeks — one lighter week (~40% less volume).",
  ],
  supplements: [
    ["Creatine monohydrate", "5 g", "Every day (incl. rest days)", "#1 proven — strength, size, fullness"],
    ["Whey protein", "1–2 scoops", "Post-workout / to hit target", "Reach 150–170 g protein/day"],
    ["Magnesium (glycinate)", "200–400 mg", "Evening", "Sleep, recovery, cramps"],
    ["Fish oil (omega-3)", "1–3 g EPA+DHA", "With a meal", "Joints, recovery, anti-inflammatory"],
    ["Vitamin D3", "1,000–4,000 IU", "With a fatty meal", "UK sun is low — most are deficient"],
  ],
  aminoNote: "Skip EAAs/BCAAs — redundant when protein is already 150–170 g from whole food + whey. Only useful if you ever train fasted first thing (then a scoop of EAAs).",

  // Personalised daily-fuel cheat-sheet (lean gain, mix of prep + quick meals)
  fuel: {
    totalKcal: "≈ 2,700", totalProtein: "175–190 g",
    note: "Protein landing a bit over 170 g is a bonus, not a problem — it only helps you build. If you want to pull calories back, drop the evening milk or shrink a meat portion. Weigh food where you can and log it in the Log tab.",
    meals: [
      { m: "Breakfast", tag: "quick", food: "Oats 100g + whey scoop + berries + 1 tbsp peanut butter", kcal: 675, p: 42 },
      { m: "Mid-morning", tag: "quick", food: "Greek yogurt 200g + berries + drizzle of honey", kcal: 210, p: 20 },
      { m: "Lunch", tag: "prep", food: "Chicken breast 150g + rice 250g + veg + tsp olive oil", kcal: 660, p: 52 },
      { m: "Post-workout", tag: "quick", food: "Whey scoop + berries", kcal: 200, p: 25 },
      { m: "Dinner", tag: "cook", food: "Beef mince 5% or salmon 150g + potato 300g + veg", kcal: 675, p: 45 },
      { m: "Evening", tag: "quick", food: "250ml milk + 30g almonds", kcal: 300, p: 15 },
    ],
    groceries: {
      "Proteins": ["Chicken breast", "Beef / lamb mince (5%)", "Salmon fillets", "Tinned tuna", "Eggs (large box)", "Greek yogurt 0% (big tub)", "Semi-skimmed milk", "Whey protein"],
      "Carbs": ["Oats", "Rice", "Potatoes / sweet potato", "Wholemeal bread", "Pasta", "Rice cakes"],
      "Fats": ["Peanut butter", "Olive oil", "Almonds", "Avocado"],
      "Fruit & veg": ["Berries", "Apples", "Frozen mixed veg", "Spinach", "Broccoli"],
      "Extras": ["Creatine", "Honey", "Spices / seasoning"],
    },
    ref: [
      ["Chicken breast (cooked)", "150 g", 250, 46],
      ["Beef mince 5% (cooked)", "150 g", 255, 39],
      ["Salmon fillet", "150 g", 310, 34],
      ["Tuna (tinned, drained)", "1 tin", 110, 25],
      ["Eggs", "2 large", 155, 12],
      ["Greek yogurt 0%", "200 g", 120, 20],
      ["Whey protein", "1 scoop", 120, 24],
      ["Semi-skimmed milk", "250 ml", 125, 9],
      ["Oats (dry)", "80 g", 300, 10],
      ["Rice (cooked)", "200 g", 260, 5],
      ["Potato / sweet potato", "250 g", 220, 5],
      ["Wholemeal bread", "2 slices", 180, 8],
      ["Mixed berries", "150 g", 80, 1],
      ["Peanut butter", "1 tbsp", 95, 4],
      ["Almonds", "30 g", 175, 6],
      ["Olive oil", "1 tbsp", 120, 0],
    ],
  },
};
