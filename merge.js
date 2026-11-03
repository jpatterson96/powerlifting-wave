// Combines this phone's log with the copy on GitHub when both changed since they last matched (`base`).
// A part only one side changed is taken from that side. When both changed it: the training log and
// settings keep this phone's version, while lists (exercises, body weight, imported workouts) are joined,
// with this phone's version of any item both have. No DOM access here so it can be tested in Node.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Items only one side has are kept; for one both have, this phone's fields win and GitHub's fill any it lacks.
const joinBy = (key) => (mine, theirs) => [
  ...mine.map((m) => ({ ...theirs.find((t) => t[key] === m[key]), ...m })),
  ...theirs.filter((t) => !mine.some((m) => m[key] === t[key])),
];

const byDate = (list) => [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const PARTS = {
  round: (mine) => mine,
  trainingMax: (mine) => mine,
  rest: (mine) => mine,
  blocks: (mine) => mine,
  exercises: joinBy('id'),
  bodyweight: (mine, theirs) => byDate(joinBy('date')(mine, theirs)),
  imported: (mine, theirs) => byDate(joinBy('date')(mine, theirs)),
};

// All three must be in the same unit; `base` may be null when there's no record of the last match.
export function mergeLogs(base, local, remote) {
  const merged = { ...local };
  for (const [key, combine] of Object.entries(PARTS)) {
    const mine = local[key];
    const theirs = remote[key];
    if (theirs === undefined || same(mine, theirs)) continue;
    if (mine === undefined) merged[key] = theirs;
    else if (base && same(mine, base[key])) merged[key] = theirs;
    else if (!(base && same(theirs, base[key]))) merged[key] = combine(mine, theirs);
  }
  return merged;
}
