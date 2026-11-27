// 'use client';
// 'use client';
// import { createContext, useContext, useEffect, useState } from 'react';

// /* The three top-bar selectors scope every query in the app:
//    business -> location -> financial year. */
// const ScopeContext = createContext(null);

// export const FIN_YEARS = ['2026-2027', '2025-2026', '2024-2025', '2023-2024'];

// export function ScopeProvider({ children }) {
//   const [businesses, setBusinesses] = useState([]);
//   const [locations, setLocations] = useState([]);
//   const [business, setBusiness] = useState('');
//   const [location, setLocation] = useState('');
//   const [finYear, setFinYear] = useState(FIN_YEARS[0]);
//   const [user, setUser] = useState(null);

//   useEffect(() => {
//     fetch('/api/auth/me')
//       .then((r) => (r.ok ? r.json() : { user: null }))
//       .then((d) => setUser(d.user))
//       .catch(() => {});
//   }, []);

//   useEffect(() => {
//     fetch('/api/options?ref=business')
//       .then((r) => r.json())
//       .then((d) => {
//         const list = d.options || [];
//         setBusinesses(list);
//         const saved = localStorage.getItem('orbit.business');
//         const pick = list.find((o) => o.value === saved) ? saved : list[0]?.value || '';
//         setBusiness(pick);
//       })
//       .catch(() => {});
//   }, []);

//   useEffect(() => {
//     if (!business) { setLocations([]); setLocation(''); return; }
//     localStorage.setItem('orbit.business', business);
//     fetch('/api/options?ref=companylocations&business=' + business)
//       .then((r) => r.json())
//       .then((d) => {
//         const list = d.options || [];
//         setLocations(list);
//         const saved = localStorage.getItem('orbit.location');
//         const pick = list.find((o) => o.value === saved) ? saved : list[0]?.value || '';
//         setLocation(pick);
//       })
//       .catch(() => {});
//   }, [business]);

//   useEffect(() => { if (location) localStorage.setItem('orbit.location', location); }, [location]);

//   const value = {
//     user,
//     businesses, locations, business, location, finYear,
//     setBusiness, setLocation, setFinYear,
//     // appended to every list/save request
//     query: () => new URLSearchParams({ business, location, finYear }).toString(),
//   };
//   return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
// }

// export function useScope() {
//   const ctx = useContext(ScopeContext);
//   if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>');
//   return ctx;
// }












'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* The three top-bar selectors scope every query in the app:
   business -> location -> financial year. */
const ScopeContext = createContext(null);

export const FIN_YEARS = ['2026-2027', '2025-2026', '2024-2025', '2023-2024'];

/* Both selections are remembered by _id, never by name or list position: two
   branches can share a name and the list order shifts as branches are added
   or renamed, so anything but the id eventually resolves to the wrong row.
   Location is keyed per business - a location exists only inside one branch,
   and a single shared key meant switching branch overwrote the location the
   previous branch had been left on. */
const BUSINESS_KEY = 'orbit.business';
const locationKey = (businessId) => 'orbit.location.' + businessId;

export function ScopeProvider({ children }) {
  const [businesses, setBusinesses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [business, setBusinessState] = useState('');
  const [location, setLocationState] = useState('');
  const [finYear, setFinYear] = useState(FIN_YEARS[0]);
  const [user, setUser] = useState(null);

  /* Both selectors are filled in from /api/options one tick after mount, so
     `business` and `location` are '' on the first render of every screen.
     A consumer cannot tell that empty-because-still-loading apart from
     empty-because-there-is-none, and the two mean opposite things: the first
     must not be queried with, the second is a final answer. `businessReady`
     flips once /api/options?ref=business has settled (resolved or failed).

     Location is tracked as "which business the current location belongs to"
     rather than a plain boolean. A boolean set inside the effect is still
     true for the OLD business during the render that follows a business
     change - the effect has not run yet - and a consumer reading it then
     fires a request with a location that no longer applies. Comparing against
     `business` is correct on that very first render. */
  /* What this account's role may do, for hiding controls it cannot use.
     `governed:false` (nobody has customised the role, or the request failed)
     means show everything - the pre-permissions behaviour. The server checks
     every request regardless, so a stale or missing answer here is a cosmetic
     problem, never a security one. */
  const [perms, setPerms] = useState({ governed: false, screens: {}, masterStock: null });

  /* `userReady` and `permsReady` let a consumer wait for the answer instead of
     treating "not loaded yet" as "nothing to show". The quick actions and the
     frequent-pages section both hide until the permission matrix has settled,
     so a cashier never sees a Create GRC button for the half second before
     /api/my-permissions says no. */
  const [userReady, setUserReady] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  const [businessReady, setBusinessReady] = useState(false);
  const [locationsFor, setLocationsFor] = useState(null);
  const locationReady = locationsFor === business;

  const isRestricted = Boolean(
    user?.isRestricted || (user && user.role && user.role !== 'Super Admin')
  );
  const needsAssignment = Boolean(user?.needsAssignment);
  const isLocationLocked = Boolean(
    user?.isLocationLocked || needsAssignment ||
    (isRestricted && ((locationsFor === business && locations.length <= 1) || (user?.allowedLocationIds?.length === 1)))
  );
  const isCompanyLocked = Boolean(
    user?.isCompanyLocked || needsAssignment ||
    (isRestricted && ((businessReady && businesses.length <= 1) || (user?.allowedBusinessIds?.length === 1)))
  );

  const fetchMe = useCallback(() => (
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setUser(d.user))
      .catch(() => {})
  ), []);

  useEffect(() => {
    fetchMe().finally(() => setUserReady(true));
  }, [fetchMe]);

  const accessScopeKey = user
    ? `${user.id || ''}|${user.role || ''}|${(user.allowedBusinessIds || []).join(',')}|${(user.allowedLocationIds || []).join(',')}|${user.needsAssignment ? '1' : '0'}`
    : 'anon';

  useEffect(() => {
    if (!userReady) return undefined;
    let cancelled = false;
    fetch('/api/options?ref=business', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = d.options || [];
        setBusinesses(list);
        const saved = localStorage.getItem(BUSINESS_KEY);
        const remembered = list.find((o) => o.value === saved)?.value;
        if (saved && !remembered && list.length > 0) {
          localStorage.removeItem(BUSINESS_KEY);
        }
        const main = list.find((o) => o.isDefault);
        setBusinessState(remembered || main?.value || list[0]?.value || '');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBusinessReady(true); });
    return () => { cancelled = true; };
  }, [userReady, accessScopeKey]);

  useEffect(() => {
    if (!business) { setLocations([]); setLocationState(''); setLocationsFor(business); return; }
    let cancelled = false;
    setLocationsFor(null);
    fetch('/api/options?ref=companylocations&business=' + encodeURIComponent(business), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d.options) ? d.options : [];
        setLocations(list);
        const saved = localStorage.getItem(locationKey(business));
        if (saved && !list.some((o) => o.value === saved)) {
          localStorage.removeItem(locationKey(business));
        }

        let pick = '';
        if (list.length === 1) {
          pick = list[0].value;
        } else if (saved && list.some((o) => o.value === saved)) {
          pick = saved;
        } else if (user?.defaultLocationId && list.some((o) => o.value === user.defaultLocationId)) {
          pick = user.defaultLocationId;
        } else {
          const warehouse = list.find((o) =>
            o.label && o.label.toUpperCase().includes('TEMPLE FABRICS WAREHOUSE')
          );
          pick = warehouse?.value || list[0]?.value || '';
        }
        setLocationState(pick);
      })
      .catch(() => {
        if (!cancelled) {
          setLocations([]);
          setLocationState('');
        }
      })
      .finally(() => {
        if (!cancelled) setLocationsFor(business);
      });
    return () => { cancelled = true; };
  }, [business, user?.defaultLocationId, accessScopeKey]);

  const setBusiness = useCallback((next) => {
    if (isCompanyLocked) return;
    if (next && businesses.length > 0 && !businesses.some((b) => b.value === next)) return;
    setBusinessState(next);
  }, [isCompanyLocked, businesses]);

  const setLocation = useCallback((next) => {
    if (isLocationLocked) return;
    if (next && locationsFor === business && locations.length > 0 && !locations.some((l) => l.value === next)) return;
    setLocationState(next);
  }, [isLocationLocked, locationsFor, business, locations]);

  /* Re-read on every business change: permissions are stored per business,
     so the same role can be allowed more in one branch than another. */
  const permReqRef = useRef(0);
  const lastPermFetchAt = useRef(0);

  const refreshPermissions = useCallback(({ showLoading = false } = {}) => {
    if (!businessReady) return Promise.resolve();
    const seq = ++permReqRef.current;
    if (showLoading) setPermsReady(false);
    lastPermFetchAt.current = Date.now();

    return fetch('/api/my-permissions?business=' + encodeURIComponent(business || ''), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { governed: false, screens: {} }))
      .then((d) => {
        if (permReqRef.current === seq) {
          setPerms(d || { governed: false, screens: {} });
        }
      })
      .catch(() => {
        if (permReqRef.current === seq) {
          setPerms({ governed: false, screens: {} });
        }
      })
      .finally(() => {
        if (permReqRef.current === seq) setPermsReady(true);
      });
  }, [business, businessReady]);

  useEffect(() => {
    if (!businessReady) return undefined;
    refreshPermissions({ showLoading: true });
    return () => { permReqRef.current += 1; };
  }, [businessReady, refreshPermissions]);

  /* Refresh effective permissions when returning to the tab so role changes
     saved by an administrator take effect without forcing re-login. */
  useEffect(() => {
    if (!businessReady || typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPermFetchAt.current < 5000) return;
      fetchMe();
      refreshPermissions({ showLoading: false });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [businessReady, refreshPermissions, fetchMe]);

  useEffect(() => { if (business) localStorage.setItem(BUSINESS_KEY, business); }, [business]);

  /* Only once the list for THIS business has settled. On the render right
     after a branch change `location` still holds the previous branch's value,
     and writing that under the new branch's key would remember a location
     that does not belong to it. */
  useEffect(() => {
    if (business && location && locationsFor === business) {
      localStorage.setItem(locationKey(business), location);
    }
  }, [business, location, locationsFor]);

  /* May this account do `action` on `screen`?

     Answers TRUE whenever it does not positively know otherwise - an
     ungoverned role, a screen nobody has wired, a failed request. Hiding a
     control the operator is actually allowed to use is the worse mistake:
     the button going missing looks like a bug, while a button that turns out
     to be refused at least explains itself. */
  const can = (screen, action) => {
    if (!perms.governed) return true;
    if (!screen) return true;
    const held = perms.screens?.[screen];
    return Array.isArray(held) && held.includes(action);
  };

  const canMasterStock = (fieldKey) => {
    if (user?.role === 'Super Admin') return true;
    const ms = perms?.masterStock;
    if (ms) {
      if (ms.unrestricted) return true;
      return Array.isArray(ms.fields) && ms.fields.includes(fieldKey);
    }
    /* Wait conservatively for non-Super-Admin until loaded if governed */
    if (!perms.governed) {
      return user?.role === 'Admin' || user?.role === 'Location Manager';
    }
    return false;
  };

  const value = {
    user, userReady,
    businesses, locations, business, location, finYear,
    businessReady, locationReady, permsReady,
    isRestricted, needsAssignment, isLocationLocked, isCompanyLocked,
    setBusiness, setLocation, setFinYear,
    perms, can, canMasterStock, refreshPermissions, refreshScope: fetchMe,
    // appended to every list/save request
    query: () => new URLSearchParams({ business, location, finYear }).toString(),
  };
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>');
  return ctx;
}