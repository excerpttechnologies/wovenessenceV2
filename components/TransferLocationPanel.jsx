'use client';
import Icon from './Icon';

/* One side of a stock transfer - the bordered "Transfer From" / "Transfer To"
   panel used by both the Stock Transfer Packet and Stock Transfer Location
   forms.

   The GSTN and Address boxes mirror whichever location is selected; they are
   never typed into. Stock Point renders only on the destination side, which
   is why it is an optional prop rather than a fixed field. */

export default function TransferLocationPanel({
  title, locations, value, onPick, gstn, address, stockPoint, disabled, error, required = true,
}) {
  return (
    <fieldset className="rounded-md border-2 border-[#cfe0f5] px-4 pb-4 pt-1">
      <legend className="flex items-center gap-2 px-2 text-[15px] font-semibold text-brand-link">
        <Icon name="home" size={16} /> {title}
      </legend>

      <div className="mt-2">
        <label className="f-label">
          Location Name{required && <span className="f-req">*</span>}
        </label>
        <select
          className="f-input"
          value={value || ''}
          disabled={disabled}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="">--Select--</option>
          {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {error && <div className="f-err">{error}</div>}
      </div>

      <div className="mt-3">
        <label className="f-label">Location GSTN</label>
        <input className="f-input bg-[#eff2f7] text-inkmuted" value={gstn || ''} readOnly />
      </div>

      <div className="mt-3">
        <label className="f-label">Location Address</label>
        <input className="f-input bg-[#eff2f7] text-inkmuted" value={address || ''} readOnly />
      </div>

      {stockPoint && (
        <div className="mt-3">
          <label className="f-label">Stock Point</label>
          <select
            className="f-input"
            value={stockPoint.value || ''}
            disabled={stockPoint.disabled}
            onChange={(e) => stockPoint.onChange(e.target.value)}
          >
            <option value="">--Select--</option>
            {stockPoint.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}
