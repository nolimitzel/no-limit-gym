/* NO LIMIT — built-in food library (approximate values per 100 g, typical UK/US
   reference figures; labels vary by brand, so users can add their own foods
   from a packet). `portion` is a sensible default serving in grams.
   Fields: key · name · cat · kcal · p · c · f (per 100 g) · portion · unit? */
export const FOOD_CATS = ["Protein", "Dairy & eggs", "Carbs", "Fruit & veg", "Fats & nuts", "Snacks & drinks"];

const F = (key, name, cat, kcal, p, c, f, portion, unit) => ({ key, name, cat, kcal, p, c, f, portion, ...(unit ? { unit } : {}) });

export const FOOD_LIBRARY = [
  /* Protein */
  F("chicken-breast", "Chicken breast (cooked)", "Protein", 165, 31, 0, 3.6, 150),
  F("chicken-thigh", "Chicken thigh, skinless (cooked)", "Protein", 209, 26, 0, 10.9, 150),
  F("turkey-mince", "Turkey mince 5% (cooked)", "Protein", 170, 28, 0, 6, 150),
  F("beef-mince-5", "Beef mince 5% (cooked)", "Protein", 170, 26, 0, 7, 150),
  F("beef-mince-20", "Beef mince 20% (cooked)", "Protein", 254, 26, 0, 17, 150),
  F("steak", "Sirloin steak (cooked)", "Protein", 190, 29, 0, 8, 200),
  F("salmon", "Salmon fillet (cooked)", "Protein", 206, 22, 0, 12, 150),
  F("cod", "Cod / white fish (cooked)", "Protein", 105, 23, 0, 0.9, 150),
  F("tuna-tin", "Tuna, tinned in water (drained)", "Protein", 110, 25, 0, 1, 100, "1 tin"),
  F("prawns", "Prawns (cooked)", "Protein", 99, 24, 0.2, 0.3, 120),
  F("ham", "Ham, sliced", "Protein", 107, 18, 1.4, 3.3, 50),
  F("whey", "Whey protein powder", "Protein", 400, 78, 8, 6, 30, "1 scoop"),
  F("protein-bar", "Protein bar (typical)", "Protein", 350, 33, 33, 12, 60, "1 bar"),
  F("tofu", "Tofu, firm", "Protein", 144, 15, 2, 8.7, 150),
  F("lentils", "Lentils (cooked)", "Protein", 116, 9, 20, 0.4, 150),
  F("chickpeas", "Chickpeas, tinned (drained)", "Protein", 120, 7.2, 16, 2.6, 120),
  F("kidney-beans", "Kidney beans, tinned (drained)", "Protein", 100, 7, 15, 0.5, 120),
  F("baked-beans", "Baked beans", "Protein", 78, 4.7, 12.5, 0.2, 200, "½ tin"),

  /* Dairy & eggs */
  F("egg", "Eggs, large", "Dairy & eggs", 143, 12.6, 0.7, 9.5, 55, "1 egg"),
  F("egg-whites", "Egg whites (liquid)", "Dairy & eggs", 52, 11, 0.7, 0.2, 150),
  F("greek-yogurt-0", "Greek yogurt 0%", "Dairy & eggs", 57, 10, 3.6, 0.4, 200),
  F("greek-yogurt-full", "Greek yogurt, full fat", "Dairy & eggs", 97, 9, 4, 5, 150),
  F("skyr", "Skyr", "Dairy & eggs", 63, 11, 4, 0.2, 150),
  F("cottage-cheese", "Cottage cheese", "Dairy & eggs", 98, 11, 3.4, 4.3, 150),
  F("milk-semi", "Semi-skimmed milk", "Dairy & eggs", 47, 3.5, 4.8, 1.7, 250, "1 glass"),
  F("milk-whole", "Whole milk", "Dairy & eggs", 63, 3.3, 4.7, 3.6, 250, "1 glass"),
  F("cheddar", "Cheddar cheese", "Dairy & eggs", 416, 25, 0.1, 35, 30),
  F("mozzarella", "Mozzarella", "Dairy & eggs", 254, 18, 2, 19, 60),

  /* Carbs */
  F("oats", "Oats (dry)", "Carbs", 375, 12, 60, 8, 80),
  F("rice-white", "White rice (cooked)", "Carbs", 130, 2.7, 28, 0.3, 200),
  F("rice-brown", "Brown rice (cooked)", "Carbs", 123, 2.7, 25.6, 1, 200),
  F("pasta-cooked", "Pasta (cooked)", "Carbs", 158, 5.8, 31, 0.9, 220),
  F("pasta-dry", "Pasta (dry)", "Carbs", 359, 12.5, 72, 1.5, 85),
  F("potato", "Potatoes (boiled)", "Carbs", 87, 1.9, 20, 0.1, 300),
  F("sweet-potato", "Sweet potato (baked)", "Carbs", 90, 2, 20.7, 0.2, 250),
  F("bread-wholemeal", "Wholemeal bread", "Carbs", 230, 10, 40, 2.5, 40, "1 slice"),
  F("bread-white", "White bread", "Carbs", 240, 8.5, 46, 1.8, 40, "1 slice"),
  F("bagel", "Bagel", "Carbs", 257, 10, 50, 1.5, 85, "1 bagel"),
  F("wrap", "Tortilla wrap", "Carbs", 310, 8, 52, 7, 64, "1 wrap"),
  F("rice-cakes", "Rice cakes", "Carbs", 387, 8, 81, 2.8, 9, "1 cake"),
  F("granola", "Granola", "Carbs", 470, 10, 60, 20, 50),
  F("cornflakes", "Cornflakes", "Carbs", 378, 7, 84, 0.9, 40),
  F("couscous", "Couscous (cooked)", "Carbs", 112, 3.8, 23, 0.2, 200),
  F("quinoa", "Quinoa (cooked)", "Carbs", 120, 4.4, 21, 1.9, 185),
  F("noodles", "Egg noodles (cooked)", "Carbs", 138, 4.5, 25, 2.1, 200),

  /* Fruit & veg */
  F("banana", "Banana", "Fruit & veg", 89, 1.1, 23, 0.3, 120, "1 banana"),
  F("apple", "Apple", "Fruit & veg", 52, 0.3, 14, 0.2, 180, "1 apple"),
  F("berries", "Mixed berries", "Fruit & veg", 50, 0.8, 11, 0.3, 100),
  F("orange", "Orange", "Fruit & veg", 47, 0.9, 12, 0.1, 150, "1 orange"),
  F("grapes", "Grapes", "Fruit & veg", 69, 0.7, 18, 0.2, 100),
  F("avocado", "Avocado", "Fruit & veg", 160, 2, 8.5, 14.7, 75, "½ avocado"),
  F("broccoli", "Broccoli", "Fruit & veg", 34, 2.8, 7, 0.4, 100),
  F("spinach", "Spinach", "Fruit & veg", 23, 2.9, 3.6, 0.4, 50),
  F("mixed-veg", "Frozen mixed veg", "Fruit & veg", 60, 3, 10, 0.5, 100),
  F("peppers", "Peppers", "Fruit & veg", 26, 1, 6, 0.3, 100),
  F("tomatoes", "Tomatoes", "Fruit & veg", 18, 0.9, 3.9, 0.2, 100),
  F("onion", "Onion", "Fruit & veg", 40, 1.1, 9.3, 0.1, 80),
  F("carrots", "Carrots", "Fruit & veg", 41, 0.9, 9.6, 0.2, 80),
  F("salad", "Salad leaves", "Fruit & veg", 15, 1.4, 2.9, 0.2, 50),

  /* Fats & nuts */
  F("peanut-butter", "Peanut butter", "Fats & nuts", 588, 25, 20, 50, 16, "1 tbsp"),
  F("almonds", "Almonds", "Fats & nuts", 579, 21, 22, 50, 30),
  F("mixed-nuts", "Mixed nuts", "Fats & nuts", 607, 20, 21, 54, 30),
  F("olive-oil", "Olive oil", "Fats & nuts", 884, 0, 0, 100, 14, "1 tbsp"),
  F("butter", "Butter", "Fats & nuts", 717, 0.9, 0.1, 81, 10),
  F("hummus", "Hummus", "Fats & nuts", 250, 7.5, 12, 19, 50),
  F("dark-choc", "Dark chocolate 70%", "Fats & nuts", 598, 7.8, 46, 43, 20),

  /* Snacks & drinks */
  F("honey", "Honey", "Snacks & drinks", 304, 0.3, 82, 0, 21, "1 tbsp"),
  F("orange-juice", "Orange juice", "Snacks & drinks", 45, 0.7, 10.4, 0.2, 250, "1 glass"),
  F("crisps", "Crisps", "Snacks & drinks", 530, 6, 53, 32, 25, "1 bag"),
  F("cola", "Cola (full sugar)", "Snacks & drinks", 42, 0, 10.6, 0, 330, "1 can"),
];

const BY_KEY = Object.fromEntries(FOOD_LIBRARY.map((f) => [f.key, f]));
export const libFood = (key) => BY_KEY[key] || null;

// a user's starter set — the staples behind the original lean-gain meal template
export const STARTER_MEALS = [
  { name: "Breakfast oats", items: [["oats", 100], ["whey", 30], ["berries", 100], ["peanut-butter", 16]] },
  { name: "Yogurt bowl", items: [["greek-yogurt-0", 200], ["berries", 80], ["honey", 10]] },
  { name: "Chicken & rice", items: [["chicken-breast", 150], ["rice-white", 250], ["broccoli", 100], ["olive-oil", 5]] },
  { name: "Post-workout shake", items: [["whey", 30], ["banana", 120]] },
  { name: "Mince & potatoes", items: [["beef-mince-5", 150], ["potato", 300], ["mixed-veg", 100]] },
  { name: "Evening snack", items: [["milk-semi", 250], ["almonds", 30]] },
];
