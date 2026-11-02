# Powerlifting Wave

A personal tracker for an 8-week squat / bench / deadlift block built on a percentage wave
(70% → 75% → 82.5%, repeated heavier, then a taper and a re-max or deload).
It's a static web app: no server code. The log lives on the phone and, optionally, in a private
GitHub repository.

Live at https://jpatterson96.github.io/powerlifting-wave/

## The training week

| Day       | Lift        | Session                  |
|-----------|-------------|--------------------------|
| Monday    | Bench press | Template                 |
| Tuesday   | Squat       | Template                 |
| Wednesday | Deadlift    | Template                 |
| Thursday  | Bench press | Heavy day                |
| Friday    | Squat       | Heavy day                |

Volume early in the week and intensity later, 72 hours apart for the same lift, is the Texas
Method's order; putting the heavier day last has also tested well for bench (Zourdos et al. 2016).
Heavy days should feel smooth, with 2–4 reps left. Harder than that means the max is set too high.

## The 8-week block

| Week | Template days (Mon–Wed)            | Heavy days (Thu, Fri) |
|------|------------------------------------|-----------------------|
| 1    | 3 × 6 at 70%                       | 3 × 4 at 77.5%        |
| 2    | 4 × 4 at 75%                       | 4 × 3 at 82.5%        |
| 3    | 5 × 2 at 82.5%, last set "2+"      | 3 × 2 at 87.5%        |
| 4    | 3 × 5 at 75%                       | 3 × 3 at 82.5%        |
| 5    | 4 × 3 at 80%                       | 4 × 2 at 87.5%        |
| 6    | 4 × 2 at 85%, last set "2+"        | 3 × 1 at 92.5%        |
| 7    | taper: 1 single at 90%, then 2 × 2 at 80% | 3 × 2 at 75%, fast |
| 8    | re-max (Mon bench, Tue squat, Wed deadlift; no Thu/Fri) or deload (2 × 5 at 60%, all five days) |

Weeks 1–3 are the template's wave. Weeks 4–6 repeat it about 5% heavier with a rep fewer. Week 7
cuts volume about half at the same intensity (Pritchard et al. 2016; Travis et al. 2020).
Week 8 alternates: re-max in blocks 1, 3, 5…, deload in blocks 2, 4, 6…. It can be switched on the
week 8 screen before anything in it is logged, and is chosen for the next block on the review screen.

**Settings → Work from** switches the percentages to a 90% training max, for when a max was a grind
or the "2+" sets start coming up short. Re-max attempts always use the real max.

## How maxes are set

The "2+" sets are as many clean reps as possible. Each one gives an estimated max, the average of
the Epley and Brzycki formulas. That estimate moves the max it was lifted from:

| Estimate vs max  | 82.5% (week 3) | 85% (week 6) | Change                                  |
|------------------|----------------|--------------|-----------------------------------------|
| under 93%        | ≤ 4 reps       | ≤ 3 reps     | down 5%                                 |
| 93–99%           | 5–6 reps       | 4–5 reps     | holds                                   |
| 99–102%          | 7 reps         | 6 reps       | +5 lb (bench +2.5)                      |
| 102–105%         | 8 reps         | 7 reps       | +7.5 lb (bench +3.75)                   |
| 105% or more     | 9+ reps        | 8+ reps      | +10 lb (bench +5)                       |

(kg: +2.5 / +3.75 / +5, bench +1.25 / +2 / +2.5.) An accurate max gives about 6 reps at 82.5%, so
just 1–2 extra reps on a "2+" set means the max is set too high.

- **Week 3's set** sets the max for weeks 4–8, right away. The app shows the new number when you log it.
- **Next block's max**, in order of evidence:
  1. A good re-max single. If it's more than 5% under the week 6 estimate, it's taken as an off day
     and the two are averaged. A re-max with no good lift takes 95% of the week 6 estimate.
  2. The week 6 "2+" set, moving the weeks 4–8 max by the table above.
  3. No test at all: every rep in weeks 4–6 hit adds the low step, one short day holds, two or more
     drop 5%.
- Skipped days don't count for or against you. The review screen lets you change any suggested max.

**Re-max day**: warm up to two singles (80%, 87%; deadlift only 80%), then an opener at 91%, a
second at 96% and a third around 100–103% depending on how the second moved. Attempts build from the
week 6 estimate when there is one. Each attempt is marked good lift or no lift, and its weight can
be changed.

## Rest timer

Logging a set starts a countdown to the next one, timed by lift and load (Grgic et al. 2018;
ACSM 2009):

| Load                        | Bench | Squat | Deadlift |
|-----------------------------|-------|-------|----------|
| 60% (deload)                | 1:30  | 2:00  | 2:00     |
| 70%                         | 2:00  | 2:30  | 3:00     |
| 75–77.5%                    | 2:30  | 3:00  | 3:00     |
| 80–82.5%                    | 3:00  | 3:00  | 3:30     |
| 85–87.5%                    | 3:00  | 3:30  | 4:00     |
| 90–92.5%                    | 3:30  | 4:00  | 4:00     |
| before a "2+" set or attempt | 4:00 | 5:00  | 5:00     |

The screen stays on while it runs and the bar turns white when rest is over. One tone plays at
10 seconds left and three at zero. Tones only play while the app is open (iPhone pauses web apps in
the background) and follow the ring/silent switch: getting past it would mean stopping your music.
**Settings → Rest timer** sets Sound, Silent or Off.

Every logged set records the weight lifted, so changing a setting or a max later never rewrites past
results.

## Accessories

Your own exercises, listed under each day's main lift. **Settings → Accessories** sets each one's
days, sets, rep range (e.g. 3 × 8–12), weight jump and rest; **Add an exercise** on a training day
adds one to that day only.

- **Skip today** for anything you don't do that day; nothing is counted against it.
- Exercises with variants (e.g. *Dumbbell, Machine*) have a switch; each variant keeps its own
  numbers, and the one you used last comes up next time.
- Double progression: each set is prefilled from last time with one more rep, until every set
  reaches the top of the range; then the weight goes up by the jump and reps start from the bottom.
  Tap a light to log it as shown; tap a logged one to change it. Use 0 for body-weight exercises.

Apple Health isn't reachable from a web app, so body weight is logged in the app (History → Body).

## History

**Lifts**: pick a lift to see two charts that share one week-by-week axis across every block:

- the max each week trained from, with orange dots for test-set estimates and re-max singles;
- weekly volume (weight × reps).

Tap or drag across a chart for a week's numbers; the same numbers are in "week by week" below it.

**Accessories**: each exercise's heaviest set, estimated max, best session, a chart of its best set
by session, and recent sessions. **Body**: log today's weight and see it charted.

## Missed days

The app opens the next day you haven't finished. A missed day waits until you do it or tap
**Skip this day** (undo is available). If you skip most of a week, the app offers to repeat it;
after two or more weeks off, it offers to restart the block at week 1.

## Saving to GitHub

The app can save the log to the private repository `jpatterson96/powerlifting-wave-data`
a few seconds after every change. GitHub keeps every version as a commit.

It needs an access key that can only touch that one repository:

1. In Safari on the phone, sign in to github.com and open
   https://github.com/settings/personal-access-tokens/new
2. **Token name**: `Powerlifting Wave phone`. **Expiration**: the longest option offered.
3. **Repository access**: *Only select repositories* → `powerlifting-wave-data`.
4. **Permissions** → **Repository permissions** → **Contents** → *Read and write*.
5. **Generate token**, then copy it (it starts with `github_pat_`).
6. In the app: **Settings → Save to GitHub**, paste the key, **Connect**.

The key is stored only on the phone. If the phone is lost, delete the key on that same GitHub page.
On a new phone, use **Restore from GitHub** on the first screen with a new key.

**Load from GitHub** (Settings) replaces the phone's log with the saved copy, for changes made to
`data.json` somewhere else. It waits until the phone's own changes have finished saving, and asks first.

## Run it on this PC

```
npm start        # serves at http://localhost:8000
npm test         # program rules: percentages, max changes, rest, plates, schedule, migration
```

## Updating

Change the files, bump `CACHE` in `sw.js`, commit and push to `main`. GitHub Pages republishes in
about a minute; the phone downloads the new version in the background and shows it the next time
the app opens. Logs saved by older versions (3-week blocks) carry over: their weeks 1–3 become
weeks 1–3 of an 8-week block.

## Backups

**Settings → Save backup** writes the whole log to a file (Files or iCloud Drive), and
**Restore backup** reads one back. Deleting the home-screen icon on iPhone also deletes the app's
data on the phone, so keep GitHub saving on or a backup file around.

Rules live in `logic.js`, charts in `charts.js`, the rest timer in `rest.js`, GitHub saving in
`sync.js`; the app icon is generated by `python tools/make_icons.py`.
