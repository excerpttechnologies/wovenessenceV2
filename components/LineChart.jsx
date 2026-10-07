// 'use client';

// /* Two-series line chart, hand-drawn SVG (no chart library).
//    Scales to whatever the data returns, and stays readable when everything is
//    zero - a fresh database should look empty, not broken. */
// export default function LineChart({ labels = [], series = [], colors = ['#2f8ef4', '#4caf50'] }) {
//   const W = 660, H = 230, pad = 40;
//   const all = series.flatMap((s) => s.points || []);
//   const peak = Math.max(...all, 0);
//   const max = peak > 0 ? Math.ceil(peak / 5) * 5 : 100;

//   const n = Math.max(labels.length, 2);
//   const x = (i) => pad + (i * (W - pad * 2)) / (n - 1);
//   const y = (v) => H - pad - (Number(v || 0) / max) * (H - pad * 2);
//   const path = (pts) => (pts || []).map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ');

//   const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(max * f));
//   /* thin out x labels so 30 days don't collide */
//   const step = Math.ceil(labels.length / 12) || 1;

//   return (
//     <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[700px]" role="img" aria-label="Sales chart">
//       {ticks.map((t) => (
//         <g key={t}>
//           <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke="#e6ebf3" />
//           <text x={pad - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8b97ac">{t}</text>
//         </g>
//       ))}
//       {labels.map((l, i) => (i % step === 0 ? (
//         <text key={l + i} x={x(i)} y={H - pad + 16} textAnchor="middle" fontSize="10" fill="#8b97ac">{l}</text>
//       ) : null))}
//       {series.map((s, si) => (
//         <g key={s.name + si}>
//           <path d={path(s.points)} fill="none" stroke={colors[si] || '#888'} strokeWidth="2" />
//           {(s.points || []).map((v, i) => (
//             <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={colors[si] || '#888'} strokeWidth="2" />
//           ))}
//         </g>
//       ))}
//     </svg>
//   );
// }









'use client';

/* Two-series line chart, hand-drawn SVG (no chart library).
   Scales to whatever the data returns, and stays readable when everything is
   zero - a fresh database should look empty, not broken. */
/* `height` is the viewBox height, not a pixel size: the svg is width-driven,
   so this is what sets the plot's proportions and therefore how tall it draws
   at any given card width. */
/* Axis figures in Indian short form - 45K, 4.2L, 1.5Cr - since a full
   rupee amount does not fit in the gutter left of the plot. */
function short(v) {
  const n = Math.abs(v);
  const trim = (x) => String(Number(x.toFixed(1)));
  if (n >= 1e7) return trim(v / 1e7) + 'Cr';
  if (n >= 1e5) return trim(v / 1e5) + 'L';
  if (n >= 1e3) return trim(v / 1e3) + 'K';
  return String(v);
}

export default function LineChart({
  labels = [],
  series = [],
  colors = ['#2f8ef4', '#4caf50'],
  height = 230,
}) {
  const W = 660, H = height, pad = 40;
  const all = series.flatMap((s) => s.points || []);
  const peak = Math.max(...all, 0);
  const max = peak > 0 ? Math.ceil(peak / 5) * 5 : 100;

  const n = Math.max(labels.length, 2);
  const x = (i) => pad + (i * (W - pad * 2)) / (n - 1);
  const y = (v) => H - pad - (Number(v || 0) / max) * (H - pad * 2);
  const path = (pts) => (pts || []).map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ');

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(max * f));
  /* thin out x labels so 30 days don't collide */
  const step = Math.ceil(labels.length / 12) || 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[700px]" role="img" aria-label="Sales chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke="#e6ebf3" />
          <text x={pad - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8b97ac">{short(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % step === 0 ? (
        <text key={l + i} x={x(i)} y={H - pad + 16} textAnchor="middle" fontSize="10" fill="#8b97ac">{l}</text>
      ) : null))}
      {series.map((s, si) => (
        <g key={s.name + si}>
          <path d={path(s.points)} fill="none" stroke={colors[si] || '#888'} strokeWidth="2" />
          {(s.points || []).map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={colors[si] || '#888'} strokeWidth="2" />
          ))}
        </g>
      ))}
    </svg>
  );
}
