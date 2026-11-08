// Inline SVG charts for the History tab. Both charts share one x scale, a slot per training week across
// every block, so a week sits at the same position in each. Pure string builders; app.js adds the taps.

const PAD = { top: 14, right: 46, bottom: 30, left: 44 };

// Tick spacing of 1, 2, 2.5 or 5 times a power of ten, aiming for about `count` ticks.
function niceStep(span, count) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

const compact = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n)));
const num = (n) => String(Math.round(n * 10) / 10);

function frame(weeks, width, height) {
  const plotW = width - PAD.left - PAD.right;
  const slot = plotW / weeks.length;
  return {
    width, height, slot,
    bottom: height - PAD.bottom,
    x: (i) => PAD.left + slot * (i + 0.5),
    edge: (i) => PAD.left + slot * i,
  };
}

// Block numbers under the first week of each block; spelled out when there's room.
function blockAxis(weeks, f) {
  const starts = weeks.map((w, i) => (w.week === 0 ? i : -1)).filter((i) => i !== -1);
  const room = Math.min(...starts.map((s, k) => (starts[k + 1] ?? weeks.length) - s)) * f.slot;
  return starts.map((i) => {
    const label = room >= 64 ? `Block ${weeks[i].block + 1}` : String(weeks[i].block + 1);
    return `<line class="chart-tick" x1="${f.edge(i)}" x2="${f.edge(i)}" y1="${f.bottom}" y2="${f.bottom + 5}"/>
      <text class="chart-label" x="${f.edge(i) + 3}" y="${f.bottom + 19}">${label}</text>`;
  }).join('');
}

function yAxis(ticks, y, f, format) {
  return ticks.map((t) => `<line class="chart-grid" x1="${PAD.left}" x2="${f.width - PAD.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="chart-label" x="${PAD.left - 8}" y="${y(t) + 4}" text-anchor="end">${format(t)}</text>`).join('');
}

// The crosshair and hit area that app.js moves; data-* carry the geometry it needs.
function overlay(f, n) {
  return `<line class="chart-cross" x1="0" x2="0" y1="${PAD.top}" y2="${f.bottom}" visibility="hidden"/>
    <rect class="chart-hit" x="${PAD.left}" y="0" width="${f.slot * n}" height="${f.height}"
      data-left="${PAD.left}" data-slot="${f.slot}" data-n="${n}"/>`;
}

// Step line of the max each block trained from, dots for tested results, the latest max labelled at the end.
// `colours`, one per week, draws the line in each week's colour instead of the one series colour.
export function maxChart(weeks, width, height = 190, colours = null) {
  const f = frame(weeks, width, height);
  const values = weeks.flatMap((w) => [w.max, ...w.tests.map((t) => t.value)]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, 20) * 1.4, 4);
  const min = Math.floor((lo - step / 2) / step) * step;
  const max = Math.ceil((hi + step / 2) / step) * step;
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * (f.bottom - PAD.top);
  const ticks = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(t);

  let path = '';
  weeks.forEach((w, i) => {
    if (i === 0) path += `M${f.edge(0)},${y(w.max)}`;
    else if (w.max !== weeks[i - 1].max) path += `V${y(w.max)}`;
    path += `H${f.edge(i + 1)}`;
  });
  const dots = weeks.flatMap((w, i) => w.tests.map((t) => `<circle class="chart-dot" cx="${f.x(i)}" cy="${y(t.value)}" r="4.5"/>`)).join('');
  const last = weeks[weeks.length - 1].max;
  const heat = colours ? `<defs><linearGradient id="chart-heat-max" gradientUnits="userSpaceOnUse" x1="${PAD.left}" x2="${width - PAD.right}" y1="0" y2="0">
      ${colours.map((c, i) => `<stop offset="${((i + 0.5) / colours.length).toFixed(4)}" stop-color="${c}"/>`).join('')}
    </linearGradient></defs>` : '';
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${heat}
    ${yAxis(ticks, y, f, num)}
    <line class="chart-axis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.bottom}" y2="${f.bottom}"/>
    ${blockAxis(weeks, f)}
    <path class="chart-line" d="${path}"${colours ? ' style="stroke:url(#chart-heat-max)"' : ''}/>
    ${dots}
    <text class="chart-end" x="${width - PAD.right + 6}" y="${y(last) + 5}">${num(last)}</text>
    ${overlay(f, weeks.length)}
  </svg>`;
}

// One value per session or day as a line with dots, labelled with its first and last dates. Used for an
// accessory's best set and for body weight.
export function progressChart(points, width, height = 170) {
  const f = frame(points, width, height);
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, hi * 0.04, 4) * 1.4, 4);
  const min = Math.max(0, Math.floor((lo - step / 2) / step) * step);
  const max = Math.ceil((hi + step / 2) / step) * step;
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * (f.bottom - PAD.top);
  const ticks = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(t);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${f.x(i)},${y(p.value)}`).join('');
  const dots = points.map((p, i) => `<circle class="chart-dot is-series-1" cx="${f.x(i)}" cy="${y(p.value)}" r="4"/>`).join('');
  const ends = [0, points.length - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => {
    const anchor = points.length > 1 && i === points.length - 1 ? 'end' : 'start';
    const x = anchor === 'end' ? f.edge(i + 1) : f.edge(i);
    return `<text class="chart-label" x="${x}" y="${f.bottom + 19}" text-anchor="${anchor}">${points[i].label}</text>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${yAxis(ticks, y, f, num)}
    <line class="chart-axis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.bottom}" y2="${f.bottom}"/>
    ${ends}
    <path class="chart-line" d="${path}"/>
    ${dots}
    <text class="chart-end" x="${width - PAD.right + 6}" y="${y(values[values.length - 1]) + 5}">${num(values[values.length - 1])}</text>
    ${overlay(f, points.length)}
  </svg>`;
}

const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

// A lift's record over the years as a small step line, from `from` to `to` (ISO days) so the lifts drawn
// side by side share one time scale: steel to a year before `to`, then the last 12 months in the accent, with
// a dot on the record. `steps` are each new record, oldest first.
export function sparkline(steps, from, to, width = 96, height = 34) {
  const pad = 4;
  const x0 = dayOf(from);
  const span = Math.max(1, dayOf(to) - x0);
  const x = (iso) => pad + ((dayOf(iso) - x0) / span) * (width - 2 * pad);
  const lo = steps[0].value;
  const hi = steps[steps.length - 1].value;
  const y = (v) => (hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad));
  const path = (list, end) => list.map((s, i) => (i ? `H${x(s.date)}V${y(s.value)}` : `M${x(s.date)},${y(s.value)}`)).join('') + `H${end}`;
  const cut = `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`;
  const old = steps.filter((s) => s.date <= cut);
  const recent = [...(old.length ? [{ date: cut, value: old[old.length - 1].value }] : []), ...steps.filter((s) => s.date > cut)];
  const best = steps[steps.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${old.length ? `<path class="spark-line" d="${path(old, x(cut))}"/>` : ''}
    <path class="spark-recent" d="${path(recent, width - pad)}"/>
    <circle class="spark-dot" cx="${x(best.date)}" cy="${y(best.value)}" r="4"/>
  </svg>`;
}

// One column per week of everything lifted on that lift (weight × reps); empty weeks draw nothing.
// `colours`, one per week, fills each week's bar in its own colour.
export function volumeChart(weeks, width, height = 160, colours = null) {
  const f = frame(weeks, width, height);
  const top = Math.max(...weeks.map((w) => w.volume));
  const step = niceStep(top, 3);
  const max = Math.ceil(top / step) * step;
  const y = (v) => PAD.top + (1 - v / max) * (f.bottom - PAD.top);
  const ticks = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  const bar = Math.max(2, Math.min(24, f.slot - 4));
  const r = Math.min(4, bar / 2);
  const columns = weeks.map((w, i) => {
    if (!w.volume) return '';
    const x0 = f.x(i) - bar / 2;
    const y0 = y(w.volume);
    const rr = Math.min(r, f.bottom - y0);
    // Rounded at the data end, square at the baseline.
    return `<path class="chart-bar" d="M${x0},${f.bottom}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bar - rr}Q${x0 + bar},${y0} ${x0 + bar},${y0 + rr}V${f.bottom}Z"${colours ? ` style="fill:${colours[i]}"` : ''}/>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${yAxis(ticks, y, f, compact)}
    ${columns}
    <line class="chart-axis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.bottom}" y2="${f.bottom}"/>
    ${blockAxis(weeks, f)}
    ${overlay(f, weeks.length)}
  </svg>`;
}
