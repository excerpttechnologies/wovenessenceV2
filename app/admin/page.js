// 'use client';
// import { useEffect, useState } from 'react';
// import Icon from '@/components/Icon';
// import LineChart from '@/components/LineChart';
// import { useScope } from '@/components/ScopeContext';

// /* Tiles marked dynamic:false come from the API as the original's fixed figures -
//    Purchase Due and Invoice Due need payments/receipts, which live in the
//    Voucher and Cash Register modules and aren't built yet. */
// const TILE_META = [
//   { k: 'totalPurchase', cls: 'bg-[#a9dfe8]', icon: 'ledger', label: 'Total Purchase' },
//   { k: 'totalSales', cls: 'bg-[#f4a7bb]', icon: 'chart', label: 'Total Sales' },
//   { k: 'purchaseDue', cls: 'bg-[#e3c765]', icon: 'register', label: 'Purchase Due' },
//   { k: 'invoiceDue', cls: 'bg-[#90ddc4]', icon: 'voucher', label: 'Invoice Due' },
//   { k: 'expenses', cls: 'bg-[#f3a898]', icon: 'bag', label: 'Expenses' },
// ];

// const COLORS = ['#2f8ef4', '#4caf50'];

// function Legend({ series }) {
//   return (
//     <div className="text-[13px]">
//       {series.map((s, i) => (
//         <div key={s.name + i} className="mb-2 flex items-center gap-2">
//           <i className="h-3 w-3" style={{ background: COLORS[i] || '#888' }} /> {s.name}
//         </div>
//       ))}
//     </div>
//   );
// }

// export default function Dashboard() {
//   const { business, location, finYear } = useScope();
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     setLoading(true);
//     const qs = new URLSearchParams({
//       business: business || '', location: location || '', finYear: finYear || '',
//     });
//     fetch('/api/dashboard?' + qs)
//       .then((r) => r.json())
//       .then(setData)
//       .catch(() => setData(null))
//       .finally(() => setLoading(false));
//   }, [business, location, finYear]);

//   const tiles = data?.tiles || {};

//   return (
//     <>
//       <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
//         {TILE_META.map((t) => {
//           const tile = tiles[t.k];
//           return (
//             <div key={t.k} className="flex overflow-hidden rounded-lg border border-line bg-white">
//               <span className={'flex w-24 items-center justify-center text-white/90 ' + t.cls}>
//                 <Icon name={t.icon} size={30} />
//               </span>
//               <span className="px-3 py-3.5">
//                 <small className="block text-sm text-[#5d6b83]">
//                   {t.label}
//                   {tile && tile.dynamic === false && (
//                     <span className="ml-1 text-[11px] text-inkmuted" title="Needs the Voucher / Cash Register module">
//                       (static)
//                     </span>
//                   )}
//                   {tile?.note && <span className="ml-1 text-[11px] text-inkmuted">({tile.note})</span>}
//                 </small>
//                 <b className="text-[26px]">
//                   {loading ? <span className="spin" /> : Number(tile?.value ?? 0).toLocaleString('en-IN')}
//                 </b>
//               </span>
//             </div>
//           );
//         })}
//       </div>

//       <div className="card">
//         <div className="card-head"><span className="card-title">Sales Last 30 Days</span></div>
//         <div className="card-body flex flex-wrap items-center justify-center gap-8">
//           {loading && <div className="center-load"><span className="spin" /></div>}
//           {!loading && data && (
//             <>
//               <LineChart labels={data.last30.labels} series={data.last30.series} colors={COLORS} />
//               <Legend series={data.last30.series} />
//             </>
//           )}
//         </div>
//       </div>

//       <div className="card">
//         <div className="card-head"><span className="card-title">Sales Current Financial Year</span></div>
//         <div className="card-body">
//           <div className="mb-3 text-[15px] font-bold">Product Trends by Month</div>
//           <div className="flex flex-wrap items-center justify-center gap-8">
//             {loading && <div className="center-load"><span className="spin" /></div>}
//             {!loading && data && (
//               <>
//                 <LineChart labels={data.byMonth.labels} series={data.byMonth.series} colors={COLORS} />
//                 <Legend series={data.byMonth.series} />
//               </>
//             )}
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }

'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import LineChart from '@/components/LineChart';
import { useScope } from '@/components/ScopeContext';

/* Tiles marked dynamic:false come from the API as the original's fixed figures -
   Purchase Due and Invoice Due need payments/receipts, which live in the
   Voucher and Cash Register modules and aren't built yet. */
const TILE_META = [
  { k: 'totalPurchase', cls: 'stat-ico-teal', tint: '#19a7b4', icon: 'ledger', label: 'Total Purchase' },
  { k: 'totalSales', cls: 'stat-ico-green', tint: '#17a862', icon: 'chart', label: 'Total Sales' },
  { k: 'purchaseDue', cls: 'stat-ico-amber', tint: '#e2960f', icon: 'register', label: 'Purchase Due' },
  { k: 'invoiceDue', cls: 'stat-ico-blue', tint: '#3d7ce6', icon: 'voucher', label: 'Invoice Due' },
  { k: 'expenses', cls: 'stat-ico-rose', tint: '#e2587c', icon: 'bag', label: 'Expenses' },
];

/* The tile's last 30 days as bars, scaled to its own peak so a quiet tile
   shows its own shape rather than flattening against a busier one. Drawn
   only for the tiles the API actually returns a series for. */
function MiniBars({ points, tint }) {
  const peak = Math.max(...points, 0);
  const slot = 100 / points.length;
  const w = slot * 0.62;

  return (
    <svg className="stat-bars" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      {points.map((v, i) => {
        const h = peak > 0 ? Math.max((v / peak) * 30, 1.5) : 1.5;
        return (
          <rect
            key={i}
            x={i * slot}
            y={32 - h}
            width={w}
            height={h}
            rx={w / 2.2}
            fill={tint}
            opacity={0.3 + (peak > 0 ? (v / peak) * 0.7 : 0)}
          />
        );
      })}
    </svg>
  );
}

const COLORS = ['#2f8ef4', '#4caf50', '#f59e0b', '#e2587c', '#8b5cf6', '#14b8a6'];

/* Greeting and date are read off the clock at render, so the banner says
   something true rather than a fixed line of copy. */
function greeting(h) {
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function Hero({ user, finYear, loading, failed }) {
  const [now, setNow] = useState(null);

  /* Set after mount, never during render: the server has no idea what time
     it is where the operator is, and rendering it on both sides would not
     agree. Until it does, the line is simply absent. */
  useEffect(() => setNow(new Date()), []);

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-tint" />

      <div className="hero-inner">
        <div className="min-w-0">
          <p className="hero-greet">
            {now ? greeting(now.getHours()) : 'Welcome'} <span aria-hidden="true">&#128075;</span>
          </p>

          <h1 className="hero-name">{user?.name || 'There'}</h1>

          <p className="hero-sub">Manage your business efficiently with Retail ERP</p>

          <div className="hero-meta">
            {/* Tied to whether the dashboard actually answered, so the chip
                reports the thing it appears to report. */}
            <span className={'hero-chip ' + (failed ? 'hero-chip-bad' : '')}>
              <i className="hero-dot" />
              {loading ? 'Checking...' : failed ? 'Data Unavailable' : 'All Systems Operational'}
            </span>

            {now && (
              <span className="hero-fact">
                {now.toLocaleDateString('en-IN', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            )}

            {finYear && <span className="hero-fact">Financial Year {finYear}</span>}
          </div>
        </div>

        <p className="hero-quote">
          Streamline
          <span>Operate</span>
          <span>Grow <b>Together</b></span>
        </p>
      </div>
    </section>
  );
}

function Legend({ series }) {
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.name + i} className="chart-legend-item">
          <i style={{ background: COLORS[i] || '#888' }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { business, location, finYear, user } = useScope();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      business: business || '', location: location || '', finYear: finYear || '',
    });
    fetch('/api/dashboard?' + qs)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [business, location, finYear]);

  const tiles = data?.tiles || {};

  /* Null covers both a rejected request and a body that carried nothing,
     which is what the chip in the banner reports on. */
  const failed = !loading && !data;

  return (
    <>
      <Hero user={user} finYear={finYear} loading={loading} failed={failed} />

      {/* The icon sits on its own tinted tile above the figure, rather than on
          a full-height colour block beside it, so the number is what the eye
          lands on first and every card reads at the same weight. */}
      <div className="stat-row grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {TILE_META.map((t) => {
          const tile = tiles[t.k];
          return (
            <div key={t.k} className="stat-card">
              <div className="stat-top">
                <span className={'stat-ico ' + t.cls}>
                  <Icon name={t.icon} size={20} />
                </span>

                <span className="stat-label">
                  {t.label}
                  {tile && tile.dynamic === false && (
                    <span className="stat-note" title="Needs the Voucher / Cash Register module">
                      static
                    </span>
                  )}
                  {tile?.note && <span className="stat-note">{tile.note}</span>}
                </span>
              </div>

              <div className="stat-bottom">
                <span className="stat-value">
                  {loading ? <span className="spin" /> : Number(tile?.value ?? 0).toLocaleString('en-IN')}
                </span>

                {/* Absent for the tiles whose figure is a balance rather than
                    a sum of dated documents - see the dashboard route. */}
                {tile?.series?.length > 0 && (
                  <MiniBars points={tile.series} tint={t.tint} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side by side from xl, where there is room for both without either
          chart being squeezed; stacked below that. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card chart-card mb-0">
          <div className="card-head"><span className="card-title">Sales Last 30 Days</span></div>
          <div className="card-body chart-body">
            {loading && <div className="center-load"><span className="spin" /></div>}
            {!loading && data && (
              <>
                <LineChart labels={data.last30.labels} series={data.last30.series} colors={COLORS} height={250} />
                <Legend series={data.last30.series} />
              </>
            )}
          </div>
        </div>

        <div className="card chart-card mb-0">
          <div className="card-head">
            <span className="card-title">Sales Current Financial Year</span>
            <span className="card-sub">Product Trends by Month</span>
          </div>
          <div className="card-body chart-body">
            {loading && <div className="center-load"><span className="spin" /></div>}
            {!loading && data && (
              <>
                <LineChart labels={data.byMonth.labels} series={data.byMonth.series} colors={COLORS} height={250} />
                <Legend series={data.byMonth.series} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
