'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import LineChart from '@/components/LineChart';
import { useScope } from '@/components/ScopeContext';

/* Tiles marked dynamic:false come from the API as the original's fixed figures -
   Purchase Due and Invoice Due need payments/receipts, which live in the
   Voucher and Cash Register modules and aren't built yet. */
const TILE_META = [
  { k: 'totalPurchase', cls: 'bg-[#a9dfe8]', icon: 'ledger', label: 'Total Purchase' },
  { k: 'totalSales', cls: 'bg-[#f4a7bb]', icon: 'chart', label: 'Total Sales' },
  { k: 'purchaseDue', cls: 'bg-[#e3c765]', icon: 'register', label: 'Purchase Due' },
  { k: 'invoiceDue', cls: 'bg-[#90ddc4]', icon: 'voucher', label: 'Invoice Due' },
  { k: 'expenses', cls: 'bg-[#f3a898]', icon: 'bag', label: 'Expenses' },
];

const COLORS = ['#2f8ef4', '#4caf50'];

function Legend({ series }) {
  return (
    <div className="text-[13px]">
      {series.map((s, i) => (
        <div key={s.name + i} className="mb-2 flex items-center gap-2">
          <i className="h-3 w-3" style={{ background: COLORS[i] || '#888' }} /> {s.name}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { business, location, finYear } = useScope();
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

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {TILE_META.map((t) => {
          const tile = tiles[t.k];
          return (
            <div key={t.k} className="flex overflow-hidden rounded-lg border border-line bg-white">
              <span className={'flex w-24 items-center justify-center text-white/90 ' + t.cls}>
                <Icon name={t.icon} size={30} />
              </span>
              <span className="px-3 py-3.5">
                <small className="block text-sm text-[#5d6b83]">
                  {t.label}
                  {tile && tile.dynamic === false && (
                    <span className="ml-1 text-[11px] text-inkmuted" title="Needs the Voucher / Cash Register module">
                      (static)
                    </span>
                  )}
                  {tile?.note && <span className="ml-1 text-[11px] text-inkmuted">({tile.note})</span>}
                </small>
                <b className="text-[26px]">
                  {loading ? <span className="spin" /> : Number(tile?.value ?? 0).toLocaleString('en-IN')}
                </b>
              </span>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Sales Last 30 Days</span></div>
        <div className="card-body flex flex-wrap items-center justify-center gap-8">
          {loading && <div className="center-load"><span className="spin" /></div>}
          {!loading && data && (
            <>
              <LineChart labels={data.last30.labels} series={data.last30.series} colors={COLORS} />
              <Legend series={data.last30.series} />
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Sales Current Financial Year</span></div>
        <div className="card-body">
          <div className="mb-3 text-[15px] font-bold">Product Trends by Month</div>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {loading && <div className="center-load"><span className="spin" /></div>}
            {!loading && data && (
              <>
                <LineChart labels={data.byMonth.labels} series={data.byMonth.series} colors={COLORS} />
                <Legend series={data.byMonth.series} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
