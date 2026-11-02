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
export function maxChart(weeks, width, height = 190) {
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
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${yAxis(ticks, y, f, num)}
    <line class="chart-axis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.bottom}" y2="${f.bottom}"/>
    ${blockAxis(weeks, f)}
    <path class="chart-line" d="${path}"/>
    ${dots}
    <text class="chart-end" x="${width - PAD.right + 6}" y="${y(last) + 5}">${num(last)}</text>
    ${overlay(f, weeks.length)}
  </svg>`;
}

// One column per week of everything lifted on that lift (weight × reps); empty weeks draw nothing.
export function volumeChart(weeks, width, height = 160) {
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
    return `<path class="chart-bar" d="M${x0},${f.bottom}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bar - rr}Q${x0 + bar},${y0} ${x0 + bar},${y0 + rr}V${f.bottom}Z"/>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${yAxis(ticks, y, f, compact)}
    ${columns}
    <line class="chart-axis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${f.bottom}" y2="${f.bottom}"/>
    ${blockAxis(weeks, f)}
    ${overlay(f, weeks.length)}
  </svg>`;
}
