// The muscles an exercise trains, for the weekly set count: one main muscle, which a set counts toward in full,
// and up to a few it also works, which get half a set each. No DOM access here so it can be tested in Node.

export const MUSCLES = [
  'Chest', 'Front delts', 'Side delts', 'Rear delts', 'Triceps', 'Lats', 'Upper back', 'Lower back', 'Biceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Other',
];
// What a set gives each muscle the exercise also works: half, the usual way to count a compound lift's helpers.
export const ALSO_CREDIT = 0.5;
export const ALSO_MAX = 3;

// The main lifts' muscles.
export const LIFT_MUSCLES = {
  bench: { muscle: 'Chest', also: ['Triceps', 'Front delts'] },
  squat: { muscle: 'Quads', also: ['Glutes', 'Lower back'] },
  deadlift: { muscle: 'Lower back', also: ['Glutes', 'Hamstrings', 'Upper back'] },
};

// Names from before the back and shoulders were split up, and where an exercise the rules below don't know goes.
const SPLIT = { Back: 'Lats', Shoulders: 'Front delts' };
export const isOldMuscle = (muscle) => Object.hasOwn(SPLIT, muscle);

// What an exercise trains, by words in its name: the first rule that matches wins, so the narrower names come
// first (a close-grip bench before a bench, a leg curl before a curl, a calf raise on the leg press before the
// leg press). Each is [words, main muscle, the ones it also works].
const RULES = [
  [/calf|calves/, 'Calves'],
  [/leg curl|hamstring curl|nordic/, 'Hamstrings'],
  [/leg extension/, 'Quads'],
  [/romanian|\brdl\b|stiff.?leg|good ?morning/, 'Hamstrings', ['Glutes', 'Lower back']],
  [/back extension|hyperextension/, 'Lower back', ['Glutes', 'Hamstrings']],
  [/deadlift|rack pull/, 'Lower back', ['Glutes', 'Hamstrings', 'Upper back']],
  [/hip thrust|glute|hip abduct/, 'Glutes', ['Hamstrings']],
  [/squat|leg press|lunge|step.?up/, 'Quads', ['Glutes']],
  [/close.?grip.*(bench|press)/, 'Triceps', ['Chest', 'Front delts']],
  [/incline.*(bench|press)/, 'Chest', ['Front delts', 'Triceps']],
  [/bench press|chest press|push.?up|floor press|decline/, 'Chest', ['Triceps', 'Front delts']],
  [/reverse.*fly|rear delt|face pull/, 'Rear delts', ['Upper back']],
  [/fly|flye|pec deck|crossover/, 'Chest', ['Front delts']],
  [/dip/, 'Triceps', ['Chest', 'Front delts']],
  [/lateral raise|side raise/, 'Side delts'],
  [/front raise/, 'Front delts'],
  [/upright row/, 'Side delts', ['Upper back']],
  [/shrug/, 'Upper back'],
  [/pull.?down|pull.?up|chin.?up|pullover/, 'Lats', ['Biceps']],
  [/low row|(single|one).?arm.*row|dumbbell row/, 'Lats', ['Upper back', 'Biceps']],
  [/\brow\b/, 'Upper back', ['Lats', 'Biceps', 'Rear delts']],
  [/overhead press|shoulder press|military|arnold|push press|\bohp\b/, 'Front delts', ['Triceps', 'Side delts']],
  [/push.?down|skull|tricep|kickback/, 'Triceps'],
  [/curl/, 'Biceps'],
  [/\babs?\b|abdominal|crunch|sit.?up|plank|leg raise|knee raise|roll.?out/, 'Abs'],
];

// The muscles for an exercise by its name, as { muscle, also }: a null muscle when no rule knows it.
export function guessMuscles(name) {
  const rule = RULES.find(([words]) => words.test(String(name).toLowerCase()));
  return { muscle: rule?.[1] ?? null, also: [...(rule?.[2] ?? [])] };
}

// The muscles an exercise also works, tidied: ones there are, each once, never the main one or Other.
export function cleanAlso(also, muscle) {
  if (!Array.isArray(also)) return [];
  return [...new Set(also)].filter((m) => MUSCLES.includes(m) && m !== muscle && m !== 'Other').slice(0, ALSO_MAX);
}

// Brings an exercise saved before the back and shoulders were split, or before exercises named the muscles they
// also work, up to date from its name. A main muscle that still stands is kept (it may have been picked by hand),
// and one set to none on purpose (null) stays none. Run again, it changes nothing.
export function fillMuscles(exercise) {
  const guess = guessMuscles(exercise.name);
  if (exercise.muscle === undefined || isOldMuscle(exercise.muscle)) exercise.muscle = guess.muscle ?? SPLIT[exercise.muscle] ?? null;
  if (exercise.also === undefined) {
    // Where the main muscle isn't the one the name gives, the name's main one is one it also works.
    exercise.also = exercise.muscle === null ? [] : exercise.muscle === guess.muscle ? guess.also : [guess.muscle, ...guess.also];
  }
  exercise.also = cleanAlso(exercise.also, exercise.muscle);
  return exercise;
}

// What one set gives each muscle: [muscle, sets] pairs, the main one first. A null main muscle still counts, as
// "not set".
export function creditsOf({ muscle = null, also = [] } = {}) {
  return [[muscle, 1], ...cleanAlso(also, muscle).map((m) => [m, ALSO_CREDIT])];
}
