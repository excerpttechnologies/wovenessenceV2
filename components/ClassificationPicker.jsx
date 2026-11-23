'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '@/components/Icon';

/* ClassificationPicker - Multi-select picker for product classifications
   
   Props:
   - type: Classification type (byWeave, byFabric, byCraft, byOccasion, byColour)
   - value: Array of selected option IDs (strings or ObjectIds)
   - onChange: Callback with new array of string IDs
   - businessId: Business context for fetching options
   - productType: The product's type group (SAREES, FABRICS, PLAIN FABRICS, DUPATTA, SIMPLE)
   - label: Display label
   - disabled: Disable the picker
   - allowCreate: Allow creating new options on the fly
   - optionsOverride: Optional pre-loaded options array */

const LABELS = {
  byWeave: 'By Weave',
  byFabric: 'By Fabric',
  byCraft: 'By Craft',
  byOccasion: 'By Occasion',
  byColour: 'By Colour',
};

export default function ClassificationPicker({
  type,
  value = [],
  onChange,
  businessId,
  productType,
  label,
  disabled = false,
  allowCreate = true,
  optionsOverride,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const displayLabel = label || LABELS[type] || type;

  // Normalise selected values into string IDs Set for strict comparison
  const selectedIds = useMemo(() => {
    const arr = Array.isArray(value) ? value : [];
    return new Set(
      arr
        .map((item) => String(item?._id || item?.id || item || '').trim())
        .filter(Boolean)
    );
  }, [value]);

  const isSelected = (id) => selectedIds.has(String(id || '').trim());

  // Load options on mount and when businessId/type/productType changes
  useEffect(() => {
    if (optionsOverride) {
      setOptions(optionsOverride);
      return;
    }

    if (!businessId || !type) {
      setOptions([]);
      return;
    }
    if (!productType) {
      setOptions([]);
      setLoadError('Choose the Product Type first.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const query = new URLSearchParams({ business: businessId, type });
    if (productType) query.set('productType', productType);

    fetch(`/api/v1/admin/product-classification-options?${query}`)
      .then(async (res) => {
        const text = await res.text();
        if (!text) {
          throw new Error('Unable to load classification options - empty response');
        }
        const data = JSON.parse(text);
        if (!res.ok) throw new Error(data.error || 'Unable to load classification options');
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setOptions(data.options?.[type] || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOptions([]);
          setLoadError(err.message || 'Unable to load classification options');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, type, productType, optionsOverride]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const toggleOption = (optionId) => {
    if (disabled || !onChange) return;
    const strId = String(optionId || '').trim();
    if (!strId) return;

    const currentArray = [...selectedIds];
    const newArray = selectedIds.has(strId)
      ? currentArray.filter((id) => id !== strId)
      : [...currentArray, strId];

    onChange(newArray);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !businessId || saving) return;

    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/product-classification-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: businessId,
          type,
          productType,
          name: newName.trim(),
        }),
      });

      const text = await res.text();
      if (!text) {
        alert('Failed to create option - empty response');
        return;
      }
      const data = JSON.parse(text);

      if (!res.ok) {
        alert(data.error || 'Failed to create option');
        return;
      }

      const newOption = data.option;
      if (newOption && newOption._id) {
        setOptions((prev) => {
          const exists = prev.some((opt) => String(opt._id) === String(newOption._id));
          return exists ? prev : [...prev, newOption];
        });
        const newStrId = String(newOption._id);
        if (!selectedIds.has(newStrId)) {
          onChange([...selectedIds, newStrId]);
        }
      }
      setNewName('');
      setCreating(false);
      setSearch('');
    } catch (err) {
      console.error('Failed to create option:', err);
      alert('Failed to create option');
    } finally {
      setSaving(false);
    }
  };

  const displayedOptions = optionsOverride || options;
  const filteredOptions = search.trim()
    ? displayedOptions.filter((opt) =>
        String(opt.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : displayedOptions;

  const selectedOptions = displayedOptions.filter((opt) => isSelected(opt._id));
  const selectedNames = selectedOptions.map((opt) => opt.name).join(', ');

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="mb-1 block text-[13px] text-ink">
        {displayLabel}
        {selectedIds.size > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
            {selectedIds.size}
          </span>
        )}
      </label>

      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`f-input w-full text-left ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <span className={selectedIds.size ? 'text-ink' : 'text-inkmuted'}>
            {selectedIds.size ? (selectedNames || `${selectedIds.size} selected`) : `Select ${displayLabel}...`}
          </span>
          <Icon name={open ? 'chevU' : 'chevD'} size={16} className="text-inkmuted" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-linestrong bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="f-input w-full text-[13px]"
              disabled={loading}
            />
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-center text-[13px] text-inkmuted">
                Loading options...
              </div>
            ) : loadError ? (
              <div className="px-3 py-2 text-center text-[13px] text-danger" role="alert">
                {loadError}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-[13px] text-inkmuted">
                No options found
              </div>
            ) : (
              <div role="listbox">
                {filteredOptions.map((option) => (
                  <label
                    key={String(option._id)}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-[#f7f9fc]"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(option._id)}
                      onChange={() => toggleOption(option._id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1">{option.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {allowCreate && (
            <div className="border-t border-line p-2">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="btn btn-sm w-full"
                  disabled={loading}
                >
                  <Icon name="plus" size={14} /> Add New {displayLabel}
                </button>
              ) : (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') {
                        setCreating(false);
                        setNewName('');
                      }
                    }}
                    placeholder={`New ${displayLabel} name...`}
                    className="f-input flex-1 text-[13px]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newName.trim() || saving}
                    className="btn btn-primary btn-sm"
                    title="Add"
                  >
                    <Icon name="check" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                    }}
                    className="btn btn-sm"
                    title="Cancel"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
