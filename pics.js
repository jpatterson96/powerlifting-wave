// The picture beside each accessory: stick-figure pictograms by Leremy (Gan Khoon Lay), from his Flaticon packs,
// kept in pics/ as small PNGs and shown as CSS masks so they take the chalk colour. An exercise can name its own
// picture (`pic`); otherwise one is picked from its name and the variant in use. Nothing here touches the page.

// key, label, and what names it matches. The first match wins, so the specific come before the general.
export const PICS = [
  ['leg-press-calf', 'Calf press', /calf.*leg press|leg press.*calf|calf press/],
  ['leg-press', 'Leg press', /leg press/],
  ['seated-calf-raise', 'Seated calf raise', /seated calf/],
  ['standing-calf-raise', 'Calf raise', /calf/],
  ['hack-squat', 'Hack squat', /hack/],
  ['lunge', 'Lunge', /lunge|split squat|step[- ]?up|bulgarian/],
  ['squat', 'Squat', /squat/],
  ['leg-extension', 'Leg extension', /leg extension/],
  ['lying-leg-curl', 'Lying leg curl', /lying leg curl|leg curl.*lying|prone leg curl/],
  ['seated-leg-curl', 'Seated leg curl', /leg curl|hamstring curl/],
  ['hip-thrust', 'Hip thrust', /hip thrust|glute bridge/],
  ['deadlift', 'Deadlift', /deadlift|\brdl\b|romanian|good morning|hinge|back extension|hyperextension/],
  ['preacher-curl', 'Preacher curl', /preacher/],
  ['barbell-curl', 'Bar curl', /(ez|barbell|bar) curl|curl.*(ez|barbell)/],
  ['dumbbell-curl', 'Dumbbell curl', /curl/],
  ['skull-crusher', 'Skull crusher', /skull|lying.*extension|overhead.*extension|triceps? extension/],
  ['pushdown', 'Pushdown', /pushdown|push[- ]down|kickback/],
  ['dips', 'Dips', /\bdips?\b/],
  ['lat-pulldown-behind', 'Behind the neck pulldown', /behind the neck/],
  ['lat-pulldown-underhand', 'Underhand pulldown', /underhand|reverse grip|supinated/],
  ['lat-pulldown-machine', 'Pulldown machine', /neutral grip lat pulldown|pulldown machine/],
  ['lat-pulldown', 'Lat pulldown', /pull[- ]?down/],
  ['pull-up', 'Pull-up', /pull[- ]?up|chin[- ]?up/],
  ['inverted-row', 'Inverted row', /inverted row|body row|australian/],
  ['one-arm-row', 'One-arm row', /(single|one)[- ]arm.*row|row.*(single|one)[- ]arm/],
  ['chest-supported-row', 'Chest-supported row', /chest supported|supported row|seal row|incline row|machine row/],
  ['seated-cable-row', 'Seated cable row', /cable row|seated row|low row/],
  ['bent-over-row', 'Bent-over row', /row/],
  ['reverse-fly', 'Rear delt raise', /reverse fly|rear delt|face pull|reverse pec/],
  ['cable-fly', 'Cable fly', /fly|flye|pec deck|crossover/],
  ['lateral-raise', 'Lateral raise', /lateral raise|side raise|front raise/],
  ['shrug', 'Shrug', /shrug/],
  ['shoulder-press-dumbbell', 'Dumbbell shoulder press', /dumbbell.*(shoulder|overhead) press|(shoulder|overhead) press.*dumbbell|arnold/],
  ['overhead-press-barbell', 'Barbell overhead press', /overhead press|military|barbell shoulder press|\bohp\b/],
  ['shoulder-press-machine', 'Machine shoulder press', /shoulder press/],
  ['incline-dumbbell-press', 'Incline dumbbell press', /incline.*dumbbell|dumbbell.*incline/],
  ['incline-barbell-press', 'Incline barbell press', /incline/],
  ['dumbbell-bench-press', 'Dumbbell bench press', /dumbbell.*(bench|press)|(bench|press).*dumbbell/],
  ['chest-press-machine', 'Chest press machine', /chest press|machine press|press machine/],
  ['bench-press', 'Bench press', /bench|press/],
  ['crunch', 'Crunch', /crunch|sit[- ]?up|\babs?\b|abdominal|leg raise|plank/],
  ['push-up', 'Push-up', /push[- ]?up/],
];

export const picKeys = new Set(PICS.map(([key]) => key));

// The picture for an exercise: the one it names, if that's a real one, else the first rule its name (and the
// variant in use) matches; null when nothing fits.
export function picFor(exercise, variant = null) {
  if (exercise?.pic && picKeys.has(exercise.pic)) return exercise.pic;
  const text = `${exercise?.name ?? ''} ${variant ?? ''}`.toLowerCase();
  return PICS.find(([, , re]) => re.test(text))?.[0] ?? null;
}

export const picFile = (key) => `pics/${key}.png`;
