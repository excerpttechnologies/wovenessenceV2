// 'use client';
// import { useState, useEffect, useRef } from 'react';
// import Icon from '@/components/Icon';

// /* ClassificationPicker - Multi-select picker for product classifications
   
//    Props:
//    - type: Classification type (byWeave, byFabric, byCraft, byOccasion, byColour)
//    - value: Array of selected option IDs
//    - onChange: Callback with new array of IDs
//    - businessId: Business context for fetching options
//    - label: Display label
//    - disabled: Disable the picker
//    - allowCreate: Allow creating new options on the fly
   
//    Features:
//    - Loads options from /api/v1/admin/product-classification-options
//    - Multi-select with checkboxes
//    - Search/filter within dropdown
//    - Create new options inline
//    - Shows selected count as badge */

// const LABELS = {
//   byWeave: 'By Weave',
//   byFabric: 'By Fabric',
//   byCraft: 'By Craft',
//   byOccasion: 'By Occasion',
//   byColour: 'By Colour',
// };

// export default function ClassificationPicker({
//   type,
//   value = [],
//   onChange,
//   businessId,
//   label,
//   disabled = false,
//   allowCreate = true,
// }) {
//   const [options, setOptions] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [loadError, setLoadError] = useState('');
//   const [open, setOpen] = useState(false);
//   const [search, setSearch] = useState('');
//   const [creating, setCreating] = useState(false);
//   const [newName, setNewName] = useState('');
//   const dropdownRef = useRef(null);
//   const inputRef = useRef(null);

//   const displayLabel = label || LABELS[type] || type;
//   const selected = Array.isArray(value) ? value : [];

//   // Load options on mount and when businessId/type changes
//   useEffect(() => {
//     if (!businessId || !type) {
//       setOptions([]);
//       return;
//     }
    
//     let cancelled = false;
//     setLoading(true);
//     setLoadError('');
//     fetch(`/api/v1/admin/product-classification-options?business=${businessId}&type=${type}`)
//       .then(async (res) => {
//         const data = await res.json();
//         if (!res.ok) throw new Error(data.error || 'Unable to load classification options');
//         return data;
//       })
//       .then(data => {
//         if (!cancelled) {
//           setOptions(data.options?.[type] || []);
//         }
//       })
//       .catch(err => {
//         if (!cancelled) {
//           setOptions([]);
//           setLoadError(err.message || 'Unable to load classification options');
//           console.error('Failed to load classification options:', err);
//         }
//       })
//       .finally(() => {
//         if (!cancelled) setLoading(false);
//       });

//     return () => { cancelled = true; };
//   }, [businessId, type]);

//   // Close dropdown when clicking outside
//   useEffect(() => {
//     if (!open) return;
    
//     function handleClickOutside(e) {
//       if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
//         setOpen(false);
//         setCreating(false);
//         setNewName('');
//         setSearch('');
//       }
//     }
    
//     document.addEventListener('mousedown', handleClickOutside);
//     return () => document.removeEventListener('mousedown', handleClickOutside);
//   }, [open]);

//   // Focus search input when dropdown opens
//   useEffect(() => {
//     if (open && inputRef.current) {
//       inputRef.current.focus();
//     }
//   }, [open]);

//   const toggleOption = (optionId) => {
//     if (disabled) return;
    
//     const isSelected = selected.includes(optionId);
//     const newValue = isSelected
//       ? selected.filter(id => id !== optionId)
//       : [...selected, optionId];
    
//     onChange(newValue);
//   };

//   const handleCreate = async () => {
//     if (!newName.trim() || !businessId || creating) return;
    
//     setCreating(true);
//     try {
//       const res = await fetch('/api/v1/admin/product-classification-options', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           business: businessId,
//           type,
//           name: newName.trim(),
//         }),
//       });
      
//       const data = await res.json();
      
//       if (!res.ok) {
//         alert(data.error || 'Failed to create option');
//         return;
//       }
      
//       // Add new option to list and select it
//       const newOption = data.option;
//       setOptions(prev => [...prev, newOption]);
//       onChange([...selected, newOption._id]);
//       setNewName('');
//       setCreating(false);
//       setSearch('');
//     } catch (err) {
//       console.error('Failed to create option:', err);
//       alert('Failed to create option');
//     } finally {
//       setCreating(false);
//     }
//   };

//   const filteredOptions = search.trim()
//     ? options.filter(opt => 
//         opt.name.toLowerCase().includes(search.toLowerCase())
//       )
//     : options;

//   const selectedOptions = options.filter(opt => selected.includes(opt._id));
//   const selectedNames = selectedOptions.map(opt => opt.name).join(', ');

//   return (
//     <div className="relative" ref={dropdownRef}>
//       <label className="mb-1 block text-[13px] text-ink">
//         {displayLabel}
//         {selected.length > 0 && (
//           <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
//             {selected.length}
//           </span>
//         )}
//       </label>
      
//       <button
//         type="button"
//         onClick={() => !disabled && setOpen(!open)}
//         disabled={disabled}
//         className={`f-input w-full text-left ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
//         aria-haspopup="listbox"
//         aria-expanded={open}
//       >
//         <div className="flex items-center justify-between">
//           <span className={selected.length ? 'text-ink' : 'text-inkmuted'}>
//             {selected.length ? selectedNames : `Select ${displayLabel}...`}
//           </span>
//           <Icon name={open ? 'chevU' : 'chevD'} size={16} className="text-inkmuted" />
//         </div>
//       </button>

//       {open && (
//         <div className="absolute z-50 mt-1 w-full rounded-md border border-linestrong bg-white shadow-lg">
//           <div className="p-2">
//             <input
//               ref={inputRef}
//               type="text"
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               placeholder="Search..."
//               className="f-input w-full text-[13px]"
//               disabled={loading}
//             />
//           </div>

//           <div className="max-h-[240px] overflow-y-auto">
//             {loading ? (
//               <div className="px-3 py-2 text-center text-[13px] text-inkmuted">
//                 Loading options...
//               </div>
//             ) : loadError ? (
//               <div className="px-3 py-2 text-center text-[13px] text-danger" role="alert">
//                 {loadError}
//               </div>
//             ) : filteredOptions.length === 0 ? (
//               <div className="px-3 py-2 text-center text-[13px] text-inkmuted">
//                 No options found
//               </div>
//             ) : (
//               <div role="listbox">
//                 {filteredOptions.map(option => (
//                   <label
//                     key={option._id}
//                     className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-[#f7f9fc]"
//                   >
//                     <input
//                       type="checkbox"
//                       checked={selected.includes(option._id)}
//                       onChange={() => toggleOption(option._id)}
//                       className="h-4 w-4"
//                     />
//                     <span className="flex-1">{option.name}</span>
//                   </label>
//                 ))}
//               </div>
//             )}
//           </div>

//           {allowCreate && (
//             <div className="border-t border-line p-2">
//               {!creating ? (
//                 <button
//                   type="button"
//                   onClick={() => setCreating(true)}
//                   className="btn btn-sm w-full"
//                   disabled={loading}
//                 >
//                   <Icon name="plus" size={14} /> Add New {displayLabel}
//                 </button>
//               ) : (
//                 <div className="flex gap-1">
//                   <input
//                     type="text"
//                     value={newName}
//                     onChange={(e) => setNewName(e.target.value)}
//                     onKeyDown={(e) => {
//                       if (e.key === 'Enter') handleCreate();
//                       if (e.key === 'Escape') {
//                         setCreating(false);
//                         setNewName('');
//                       }
//                     }}
//                     placeholder={`New ${displayLabel} name...`}
//                     className="f-input flex-1 text-[13px]"
//                     autoFocus
//                   />
//                   <button
//                     type="button"
//                     onClick={handleCreate}
//                     disabled={!newName.trim() || creating}
//                     className="btn btn-primary btn-sm"
//                     title="Add"
//                   >
//                     <Icon name="check" size={14} />
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => {
//                       setCreating(false);
//                       setNewName('');
//                     }}
//                     className="btn btn-sm"
//                     title="Cancel"
//                   >
//                     <Icon name="x" size={14} />
//                   </button>
//                 </div>
//               )}
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }










'use client';
import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/Icon';

/* ClassificationPicker - Multi-select picker for product classifications
   
   Props:
   - type: Classification type (byWeave, byFabric, byCraft, byOccasion, byColour)
   - value: Array of selected option IDs
   - onChange: Callback with new array of IDs
   - businessId: Business context for fetching options
   - label: Display label
   - disabled: Disable the picker
   - allowCreate: Allow creating new options on the fly
   
   Features:
   - Loads options from /api/v1/admin/product-classification-options
   - Multi-select with checkboxes
   - Search/filter within dropdown
   - Create new options inline
   - Shows selected count as badge */

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
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const displayLabel = label || LABELS[type] || type;
  const selected = Array.isArray(value) ? value : [];

  // Load options on mount and when businessId/type changes
  useEffect(() => {
    if (!businessId || !type) {
      setOptions([]);
      return;
    }
    
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const query = new URLSearchParams({ business: businessId, type });
    if (productType) query.set('productType', productType);
    fetch(`/api/v1/admin/product-classification-options?${query}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load classification options');
        return data;
      })
      .then(data => {
        if (!cancelled) {
          setOptions(data.options?.[type] || []);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setOptions([]);
          setLoadError(err.message || 'Unable to load classification options');
          console.error('Failed to load classification options:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [businessId, type, productType]);

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
    if (disabled) return;
    
    const isSelected = selected.includes(optionId);
    const newValue = isSelected
      ? selected.filter(id => id !== optionId)
      : [...selected, optionId];
    
    onChange(newValue);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !businessId || creating) return;
    
    setCreating(true);
    try {
      const res = await fetch('/api/v1/admin/product-classification-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: businessId,
          type,
          name: newName.trim(),
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || 'Failed to create option');
        return;
      }
      
      // Add new option to list and select it
      const newOption = data.option;
      setOptions(prev => [...prev, newOption]);
      onChange([...selected, newOption._id]);
      setNewName('');
      setCreating(false);
      setSearch('');
    } catch (err) {
      console.error('Failed to create option:', err);
      alert('Failed to create option');
    } finally {
      setCreating(false);
    }
  };

  const displayedOptions = optionsOverride || options;
  const filteredOptions = search.trim()
    ? displayedOptions.filter(opt =>
        opt.name.toLowerCase().includes(search.toLowerCase())
      )
    : displayedOptions;

  const selectedOptions = displayedOptions.filter(opt => selected.includes(opt._id));
  const selectedNames = selectedOptions.map(opt => opt.name).join(', ');

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="mb-1 block text-[13px] text-ink">
        {displayLabel}
        {selected.length > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
            {selected.length}
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
          <span className={selected.length ? 'text-ink' : 'text-inkmuted'}>
            {selected.length ? selectedNames : `Select ${displayLabel}...`}
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
                {filteredOptions.map(option => (
                  <label
                    key={option._id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-[#f7f9fc]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(option._id)}
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
                    disabled={!newName.trim() || creating}
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
