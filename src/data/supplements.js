/* NO LIMIT — supplement library. General information, not medical advice: the
   app says so wherever a stack is chosen. Doses are common ranges; people on
   medication, pregnant, or with health conditions should check with a GP. */
export const SUPP_CATS = ["Essentials", "Performance", "Health", "Situational"];

const S = (key, name, cat, dose, when, why) => ({ key, name, cat, dose, when, why });

export const SUPP_LIBRARY = [
  /* Essentials — best evidence, broadly useful */
  S("creatine", "Creatine monohydrate", "Essentials", "3–5 g", "Daily, any time (rest days too)", "Best-evidenced supplement for strength and muscle"),
  S("whey", "Whey protein", "Essentials", "1–2 scoops", "When it helps you hit your protein", "Convenient protein — food first, shake to fill the gap"),
  S("vit-d3", "Vitamin D3", "Essentials", "10 µg (400 IU)+", "Daily with food, esp. Oct–Mar", "NHS advises it in autumn/winter — UK sun is weak"),
  S("omega-3", "Omega-3 fish oil", "Essentials", "1–2 g EPA+DHA", "With a meal", "Heart and joint health if you eat little oily fish"),
  /* Performance */
  S("caffeine", "Caffeine / pre-workout", "Performance", "100–200 mg", "30–60 min before training", "Focus and output — avoid late in the day"),
  S("beta-alanine", "Beta-alanine", "Performance", "3–6 g", "Daily, split doses", "Helps high-rep sets and short hard efforts (tingling is normal)"),
  S("electrolytes", "Electrolytes", "Performance", "1 serving", "Long or sweaty sessions", "Replace sodium/potassium lost in sweat"),
  S("casein", "Casein protein", "Performance", "1 scoop", "Before bed", "Slow-digesting protein overnight"),
  S("citrulline", "Citrulline malate", "Performance", "6–8 g", "Before training", "Pump and endurance — modest evidence"),
  /* Health */
  S("magnesium", "Magnesium (glycinate)", "Health", "200–400 mg", "Evening", "Sleep quality, cramps, recovery"),
  S("multivitamin", "Multivitamin", "Health", "1 tablet", "With breakfast", "Insurance against gaps in your diet"),
  S("zinc", "Zinc", "Health", "10–25 mg", "With food", "Immune support — don't megadose"),
  S("fibre", "Fibre (psyllium husk)", "Health", "5 g", "With plenty of water", "Digestion and fullness"),
  S("probiotic", "Probiotic", "Health", "1 capsule", "Daily", "Gut health — evidence varies by strain"),
  S("collagen", "Collagen", "Health", "10–15 g", "With vitamin C", "Joints/tendons — early evidence"),
  S("ashwagandha", "Ashwagandha", "Health", "300–600 mg", "Daily", "Stress and sleep — some evidence; not for everyone"),
  /* Situational */
  S("vit-b12", "Vitamin B12", "Situational", "As labelled", "Daily", "Essential if you're vegan or rarely eat animal foods"),
  S("iron", "Iron", "Situational", "Only if prescribed", "As advised", "Only when a blood test shows you're low"),
  S("vit-c", "Vitamin C", "Situational", "250–500 mg", "With food", "If you eat little fruit and veg"),
];

const BY_KEY = Object.fromEntries(SUPP_LIBRARY.map((s) => [s.key, s]));
export const libSupp = (key) => BY_KEY[key] || null;
export const ESSENTIALS = ["creatine", "vit-d3", "omega-3"];
