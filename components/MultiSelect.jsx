'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/* react-select look-alike, written by hand (no library).
   mode="single" renders one value; mode="multi" renders removable chips. */
export default function MultiSelect({
  options = [], value, onChange, mode = 'multi',
  placeholder = 'Select...', disabled = false, loading = false, error = '', emptyText = '', onSearch,
  maxOptions = 200, clearable = true, filterLocally = true,
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const box = useRef(null);
  const inputRef = useRef(null);
  const ignoreNextFocusRef = useRef(false);

  useEffect(() => {
    function away(e) {
      if (box.current && !box.current.contains(e.target)) {
        setOpen(false);
        setTerm('');
        onSearch?.('');
      }
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onSearch]);

  const selected = mode === 'multi'
    ? (Array.isArray(value) ? value : []).map((v) => options.find((o) => String(o.value) === String(v)) || { value: v, label: v })
    /* fall back to the raw value the way the multi branch above already
       does - otherwise a value that is not in the currently fetched option
       page renders blank. The PIN code lookup fills City with a name the
       /api/cities page may not contain yet. */
    : options.find((o) => String(o.value) === String(value ?? '')) || (value ? { value, label: String(value) } : null);

  const shown = options.filter((o) => {
    if (o.addCustomer) return true;
    if (filterLocally && term && !String(o.label).toLowerCase().includes(term.toLowerCase())) return false;
    if (mode === 'multi') return !(value || []).map(String).includes(String(o.value));
    return true;
  });

  function pick(opt) {
    if (mode === 'multi') { onChange([...(value || []), opt.value]); setTerm(''); onSearch?.(''); }
    else { onChange(opt.value); setOpen(false); setTerm(''); onSearch?.(''); }
  }
  function drop(v) { onChange((value || []).filter((x) => x !== v)); }

  const handleControlMouseDown = (e) => {
    if (disabled) return;
    if (e.target.closest('button[data-ms-btn]')) return;
    const isToggle = Boolean(e.target.closest('[data-ms-toggle]'));
    if (isToggle && open) {
      e.preventDefault();
      ignoreNextFocusRef.current = true;
      setOpen(false);
      setTerm('');
      onSearch?.('');
      setTimeout(() => { ignoreNextFocusRef.current = false; }, 0);
      return;
    }
    if (!open) {
      setOpen(true);
    }
    if (e.target !== inputRef.current) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`relative ${open ? 'z-50' : 'z-auto'}`} ref={box}>
      <div
        className={
          'ms-control '
          + (mode === 'single' ? 'ms-control-single ' : '')
          + (disabled ? 'bg-[#f2f4f8] cursor-not-allowed' : '')
        }
        onMouseDown={handleControlMouseDown}
      >
        {mode === 'multi' && selected.map((s) => (
          <span key={s.value} className="ms-chip">
            {s.label}
            <button data-ms-btn="1" type="button" onClick={(e) => { e.stopPropagation(); drop(s.value); }}>
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}

        {mode === 'single' && selected && !open && (
          <span className="ms-value flex-1 min-w-0 px-1 text-[13.5px] text-ink truncate">{selected.label}</span>
        )}

        <input
          ref={inputRef}
          className={
            'ms-input'
            + (mode === 'single' && selected && !open ? ' ms-input-collapsed' : '')
          }
          value={term}
          disabled={disabled}
          placeholder={
            mode === 'multi'
              ? (selected.length ? '' : placeholder)
              : (open ? (selected?.label || placeholder) : (selected ? '' : placeholder))
          }
          onChange={(e) => { setTerm(e.target.value); onSearch?.(e.target.value); setOpen(true); }}
          onFocus={() => {
            if (!disabled && !ignoreNextFocusRef.current) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
              setTerm('');
              onSearch?.('');
            } else if (e.key === 'Enter' && open && shown.length > 0 && term.trim()) {
              e.preventDefault();
              pick(shown[0]);
            }
          }}
        />

        {clearable && (mode === 'single' ? (value !== '' && value != null) : selected.length > 0) && !disabled && (
          <button
            data-ms-btn="1"
            type="button"
            aria-label="Clear selection"
            className="shrink-0 text-[#9aa6ba] hover:text-ink cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onChange(mode === 'multi' ? [] : '');
              setTerm('');
              onSearch?.('');
            }}
          >
            <Icon name="x" size={13} />
          </button>
        )}
        <span data-ms-toggle="1" className="shrink-0 border-l border-line px-1 text-[#9aa6ba] cursor-pointer">
          <Icon name="chevD" size={14} />
        </span>
      </div>

      {open && !disabled && (
        <div
          className="ms-menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="flex items-center gap-2 px-2.5 py-2.5 text-[13px] text-inkmuted">
              <span className="spin" />
              <span>Loading options...</span>
            </div>
          )}
          {!loading && error && (
            <div className="px-2.5 py-2.5 text-[13px] text-danger">{error}</div>
          )}
          {!loading && !error && shown.length === 0 && (
            <div className="px-2.5 py-2.5 text-[13px] text-inkmuted">{emptyText || 'No options found'}</div>
          )}
          {shown.slice(0, maxOptions).map((o, idx) => {
            const isSelected = mode === 'single'
              ? String(o.value) === String(value ?? '')
              : (Array.isArray(value) ? value : []).map(String).includes(String(o.value));
            return (
              <div
                key={`${o.value}-${idx}`}
                className={
                  'ms-opt flex items-center justify-between gap-2 ' +
                  (isSelected ? 'bg-[#eef4fd] text-brand font-medium ' : '') +
                  (o.addCustomer ? 'text-brand ' : '')
                }
                onClick={() => pick(o)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {o.addCustomer && <Icon name="plus" size={14} />}
                  <span className="truncate">{o.label}</span>
                  {o.sub && <span className="block text-[11.5px] text-inkmuted">{o.sub}</span>}
                </div>
                {isSelected && mode === 'single' && (
                  <Icon name="check" size={14} className="text-brand flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
