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
Heavy days should feel smooth, with 2–4 reps left. Harder than that means the max is set too high, so once a
heavy day's sets are all logged the app asks how they moved: **Easy** (5+ left), **Smooth** (2–4) or **Grind**
(0–1). A second grind on the same lift in a block offers a 90% training max in one tap, and the block review
counts each lift's heavy days by how they felt.

Each day's warm-up is a list to tick off: the empty bar, then the steps up to the working weight (or the re-max
opener, or the taper week's heavy single), each with its plates a side. The first tick on the day being trained
starts the workout clock, like **Start workout**, and ticking the last step starts the rest timer before the first
set (or the opener): the first set's rest, or 3 minutes after the taper week's heavy single.

Once every day of a week is done or skipped, a card at the top of Train sums it up: days trained, sets, volume,
time from Start to End workout, new accessory bests, and each day's top set marked with its feel on a heavy day,
or with reps past or short of the plan. Grinds get a note with next week's heavy weights for that lift, and the
test weeks (3 and 6) say what the test sets did to the maxes. The card stays on top of the next week until
anything in it is done, or **Hide** is tapped; it's also there whenever the finished week is picked. **Sets per
muscle** opens that week in History → Muscles. Week 8 gets the block review instead.

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

**Finish block**, under week 8, opens the block review. It starts with the total the next block trains from and
each lift's new max. Then a chart per lift shows how the max moved: the max trained from, the week 3 and 6 test
sets' estimates, the re-max attempts made or missed, and why the new max is what it is. After that come every
heavy day's feel; the block's sets, volume and average time a day, with a bar for each week; the days trained and
skipped and the share of accessories done; the accessories that went up most and any that are stuck; and body
weight from the block's first weigh-in to its last. The new maxes come last, ready to change, above **Start
block**. The review is only there until the next block starts.

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

On Train, the test set's light shows the fewest reps that keep the max (usually 5+ in week 3, 4+ in
week 6) and turns red under it. Until it's logged, the reps for its weight and what each does sit under
the sets; the rep picker and the rest before it say the same.

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

**−30 s** and **+30 s** take time off or add it; taking off the last of it ends the rest. The screen
stays on while it runs and the bar turns white when rest is over. One tone plays at 10 seconds left
and three at zero. Tones only play while the app is open (iPhone pauses web apps in the background)
and follow the ring/silent switch: getting past it would mean stopping your music.
**Settings → Rest timer** sets Sound, Silent or Off.

Every logged set records the weight lifted, so changing a setting or a max later never rewrites past
results. A weight is typed on the app's own keypad in the sheet, with − and + keys for one jump
(the exercise's, or the rounding step on the bar), so the phone's keyboard never comes up over it.

## Accessories

Your own exercises, listed under each day's main lift. **Settings → Accessories** shows them by kind
of day (bench days, squat days, deadlift day), each closed to one line until you tap it, one open at
a time. Tap an exercise to set its days, sets, rep range (e.g. 3 × 8–12), weight jump and rest; the
arrows put a day's exercises in the order you do them.
**Add an exercise** on a training day adds one to that day only.

- **Skip** on an accessory's line (or **Skip today** inside it) for anything you don't do that day;
  nothing is counted against it. **Undo** brings it back.
- **Skip the rest** ends the day's accessories: anything not started is skipped, and anything stopped
  partway keeps just the sets you logged. A day also ends this way by itself once you log on a later
  day.
- Skipping an accessory that leaves its muscle short for the week says so when you tap Skip (Undo is
  on its line): "Your only direct work for glutes this week", or "Without it: back at 9 of 10 sets this
  week". Short means under 10 sets (the low end of the shaded band in History → Muscles), or under what
  the week's plan gives that muscle when that's less: two 3-set exercises make 6. The week counts what's
  logged plus what's still to come, today and on the days left, so a skip that a later day covers says
  nothing. The opened exercise shows the warning before you skip, and so does its closed line when you
  skipped it last time or the muscle was short last week too; it turns red when it was skipped the last
  2 times or more, or the muscle was short last week. It names the day's other exercises for that
  muscle still to do. It's direct work only, because each exercise counts toward one muscle. Skipping
  never asks first, and weeks 7 and 8 (light on purpose) don't warn. **Skip the rest** and **End
  workout** name any muscle they leave short.
- An exercise skipped 3 times running while its muscle's week stays on target is offered off that kind of
  day in the day's summary (**Take it off bench days**). Its log stays, and Settings → Accessories adds
  it back.
- **Add a set** and **Remove a set** change today's sets only. Remove takes off the last set not
  done yet, or asks before removing a logged one.
- Exercises with variants (e.g. *Dumbbell, Machine*) have a switch; each variant keeps its own
  numbers, and the one you used last comes up next time.
- Double progression: each set is prefilled from last time with one more rep, until every set
  reaches the top of the range; then the weight goes up by the jump and reps start from the bottom.
  Two sessions in a row at one weight that average under the bottom of the range bring it down about
  10%, in jumps, to build back up from (never to 10 lb or less, which reads as plates a side).
  Tap a light to log it as shown; tap a logged one to change it. Use 0 for body-weight exercises:
  once every set reaches the top, the plan adds the smallest plate over 10 lb you have (or the
  jump, if it's bigger) and starts again from the bottom.
- Weeks 7 and 8 (the taper, then the re-max or deload) are lighter: half the sets, rounded up, repeating
  last time's weights and reps so the main lifts are fresh. The block after picks up progression from
  the last full week.
- An exercise loaded with plates (barbell, 45 lb / 20 kg; EZ bar, 25 lb / 10 kg; or a plate-loaded
  machine, plates only) shows the plates per side for its next set, from **Settings → Plates you have** (the
  same sizes the main lift's bar, the warm-ups and the PRs page load from).
- An exercise **counted in plates a side** (a leg press, hack squat, plate-loaded row or the like) is
  logged as the plates on each side instead of a weight. The whole number is 45s (20s in kg) and the
  tenth is the small plates on top: .5 is a 25 (10 kg) and each .1 a 10 (5 kg), so 2.5 is 45 + 45 + 25,
  2.2 is 45 + 45 + 10 + 10 and 2.7 is 45 + 45 + 25 + 10 + 10. The set sheet spells out the plates as you
  type. Its weight jump is in plates, estimates are of one side's weight, and volume counts every plate
  on both sides at what it weighs. Nothing here is lifted at 10 lb or less, so typing a number from just
  over 0 to 10 (3, or 2.5) for any other exercise switches it to plates a side, going up half a plate at
  a time: a decimal as you type it, a whole number once it's done. 0 stays body weight, and switching
  back in the editor reads the logged numbers as weights again.
- Each exercise names the muscle it counts toward, for the weekly set count in History.
- Each exercise shows a line drawing beside its name, picked from the name (and the variant in use);
  the editor's **Picture** row lets you choose another. The drawings are from
  [Open Exercise Art](https://github.com/AlexMollard/Open-Exercise-Art) by Alex Mollard
  ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)), with their lines thickened.

Once a day's lift and accessories are all done or skipped, a summary closes the day: the lift's sets
(and the estimated max from a test set), accessories done and skipped, total volume, any new bests
(an accessory beating every earlier session of the same variant), and, for a timed day, how long it
took and where the time went.

## Timing a workout

**Start workout** under the day's name starts the clock, and **End workout** at the bottom stops it
(it also skips any accessory left undone, like Skip the rest). Every set is stamped when it's logged,
so the day's summary shows how long the day took and where the time went: the lift (with its warm-up)
and each accessory or superset, with the rest and setting up before a set counted toward the exercise
it was for. A day left running ends at its last set once you log on a later day, and **Reopen** on the
same day clears an End tapped too soon. **History → Time** averages this over your days, for planning
shorter ones.

While a day is under way (from Start workout or its first set, until End workout), the rest timer's bar
stays up between rests on every tab but PRs: how long the workout has run, the sets done out of the
day's (skipped exercises left out), about how long the rest will take and what's next with its weight.
The estimate goes by each exercise's time a set on the days timed, rest included, or its rest plus 45
seconds before it has one. A rest takes the bar back while it runs, with the workout's time beside
what's next. Tapping the bar goes to the day on Train, at what's next. Once every set is done or
skipped, it offers **End** until you tap it.

Train keeps its place: open another tab mid-workout and coming back puts you where you were, on the same
row even if something above it changed (an exercise added in Settings, say). Tapping **Train** while
you're on it goes to the top.

Apple Health isn't reachable from a web app, so body weight is logged in the app (History → Body). Until it's
logged in a week, the day due shows **Log body weight**, which takes it on the same keypad as the sets.

## PRs

The PRs tab is a wall, not a list: your total, then your best squat, bench and deadlift, each on a bar
loaded with the plates per side, the whole screen and not a word on it. The squat bar is racked, the bench
bar sits over its bench and the deadlift bar is on the floor, so the three tell themselves apart. When the
page opens each bar drops in, the plates fly on a pair at a time while the steel digits over it climb with
the load, the collars lock in a puff of chalk, and a shine runs over the digits and the bars once the total is
up; the floor is polished, so each bar shows faintly upside down beneath itself. A record is
a lift you did: the maxes you entered when you started, maxes added in History → Lifts (with the day you
hit them), and good re-max attempts. Estimates from "2+" sets don't count, and neither does the max a
later block starts from, since that's the review's number.

When a re-max attempt beats every record, the screen goes dark the moment you mark it a good lift. Three
white lights come on, that lift's bar drops in loaded to the old record with the old number hollow over it,
the collars come off, the plates that change fly off and the new ones fly on, the number turns to steel and
reads the new record, and the collars lock with a flash and a cloud of chalk. The gain shows under the bar.
Tap anywhere to get back to your day. Only a single on a re-max day can set it off, never a "2+" set.

## History

**Stats** opens first, with the log as a whole:

- **Strength for your size**: the total of your records (as on the PRs page) against your latest body
  weight, as a multiple of it, each lift's too, and as a DOTS score, the one meets use to compare lifters
  of different body weights. DOTS has a men's and a women's formula; pick one there or in Settings.
- **How fast you're gaining**: each lift's record per year, from the first one on file to today, how much
  it rose in the last 12 months, and its record line over the years.
- **Is your max right?**: where each 2+ test set's estimate landed against the max that week trained
  from (93–99% holds it), and for the next test set, what each count of reps does to the max.
- **Showing up**: this block's days as a grid of weekdays by weeks, trained, skipped and to come; days
  trained in a row since the last skip; and the share of each weekday trained over every block.
- **Accessories moving and stuck**: the biggest gains in estimated max since each was first logged, and
  any with no more weight or reps in 3 sessions (weeks 7 and 8 left out). Tap one for its chart.
- **Everything you've lifted**: weight × reps of every work set and accessory set, with days, sets, reps
  and time trained, and this block against the last, a day at a time.

**Lifts**: pick a lift to see two charts that share one week-by-week axis across every block:

- the max each week trained from, with orange dots for test-set estimates and re-max singles;
- weekly volume (weight × reps).

Tap or drag across a chart for a week's numbers; the same numbers are in "week by week" below it.
Below the max chart, every max the lift has had is listed with the day it was set: maxes from before
the app, each block's starting max, and any change from a week 3 test set (the day it was logged).
**Add an earlier max** records one from before the app (tap it later to change or delete it), and a
chart of all of them by date appears. A block's maxes are dated the day it started; set the day you
actually hit them in Settings → Current maxes.

**Muscles**: hard sets per muscle for a training week, with the week before, against the 10–20 sets a
week that's a common target for growth. Main lift sets count toward chest (bench), quads (squat) and
back (deadlift).

**Accessories**: each exercise's heaviest set, estimated max, best session, a chart of its best set
by session, and recent sessions. **Time**: how long a typical day of each kind takes, recent days, and
what each exercise takes on a day you do it, slowest first. **Body**: log today's weight and see it
charted.

## Missed days

The app opens on today's day when it's still to do, so a missed Wednesday doesn't hold up Thursday's bench. Which
block week is this calendar week comes from the last day you trained on its own day of the week; a block with
nothing trained yet, or days done on other days, just go in order. On the weekend it opens the next day you
haven't finished, which you can make up then. Back on screen on a later day, the app returns to Train on the day due.

A day passed over (never started, before the day due or a later day you trained) is marked missed, and a notice
offers to skip it in one tap; **Not now** puts that off. Tap the day to do it instead. Skipped days don't count
for or against your next max, and **Skip this day** on any day does the same (undo is available). If you skip most
of a week, the app offers to repeat it; after two or more weeks off, it offers to restart the block at week 1.

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

GitHub doesn't let a web page see when a key expires, so enter the day under **Access key expires on**
(also offered when connecting). From two weeks before, Train shows a reminder. Make a new key the same way and
paste it under **Use a new key**: it replaces the old one without loading or overwriting anything.
On a new phone, use **Restore from GitHub** on the first screen with a new key.

**Load from GitHub** (Settings) replaces the phone's log with the saved copy, for changes made to
`data.json` somewhere else. It waits until the phone's own changes have finished saving, and asks first.

## Run it on this PC

```
npm start        # serves at http://localhost:8000
npm test         # program rules: percentages, max changes, rest, plates, schedule, migration
```

## Updating

Change the files, bump `CACHE` in `sw.js` and `VERSION` in `app.js` to match (a test checks), commit and push
to `main`. GitHub Pages republishes in about a minute. The phone looks for a new version each time the app comes
on screen, downloads it in the background, then loads it the next time you come back to the app with no sheet
open and no rest running (or at once from the end of Settings, which shows the version running). Logs saved by older versions (3-week blocks) carry over: their weeks 1–3 become
weeks 1–3 of an 8-week block.

## Backups

**Settings → Save backup** writes the whole log to a file (Files or iCloud Drive), and
**Restore backup** reads one back. Deleting the home-screen icon on iPhone also deletes the app's
data on the phone, so keep GitHub saving on or a backup file around.

Rules live in `logic.js`, charts in `charts.js`, the rest timer in `rest.js`, GitHub saving in
`sync.js`; the app icon is generated by `python tools/make_icons.py`.
