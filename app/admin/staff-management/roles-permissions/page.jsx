'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { useClientTable } from '@/components/NumberedPager';
import {
  ROLES as BUILT_IN_ROLES, ACTIONS, RESOURCES, RESOURCE_GROUPS, DEFAULT_MATRIX,
  isLockedRole, isOwnerRole, grantedCount, groupTally, resourceTitle, TOTAL_GRANTS,
  initialsOf,
} from './fields';

/* Staff Management -> Roles & Permissions.

   Who can sign in, and what each role may do. Three tabs on one screen:

     Users        the real accounts, from /api/user
     Roles        the five roles, what each is for, and how far it reaches
     Permissions  one row per SIDEBAR SCREEN, with Create / Read / Update /
                  Download / Delete against it, saved per business

   The permission list is not typed out anywhere - it is derived from
   config/nav.js, so it is exactly the set of screens the sidebar offers.

   DEFAULTS VERSUS OVERRIDES. /api/role-permission stores only the roles
   somebody has customised. A role it does not return has not been touched and
   uses the default written in lib/rbac.js, which ./fields.js mirrors. The
   merge happens here rather than on the server, because the defaults are
   derived from the sidebar and the client is where the sidebar lives.

   ENFORCEMENT IS NOT WIRED. Saving here changes this collection and nothing
   else: no other route consults it yet. That is said on screen, because a
   permission editor that looks like it is restricting people while it is not
   is worse than one that admits it.

   Not a ListView - three tabs, 450 checkboxes and a dialog are none of the
   things ListView does. It borrows ListView's look so it does not read as a
   screen from another application. */

const TABS = [['users', 'Users'], ['roles', 'Roles'], ['permissions', 'Permissions']];

const EMPTY_USER_FORM = {
  mode: 'add',
  _id: '',
  name: '',
  email: '',
  password: '',
  role: 'Location User',
  businessId: '',
  locationIds: [],
  counterId: '',
  isActive: true,
};

/* { href: ['create','read'] }  ->  { href: { create: true, read: true } } */
function fromApi(saved) {
  const out = {};
  Object.entries(saved || {}).forEach(([resource, list]) => {
    out[resource] = {};
    (list || []).forEach((a) => { out[resource][a] = true; });
  });
  return out;
}

/* and back again, dropping the falses - see models/RolePermission.js */
function toApi(row) {
  const out = {};
  Object.entries(row || {}).forEach(([resource, actions]) => {
    const on = Object.entries(actions || {}).filter(([, v]) => v).map(([k]) => k);
    if (on.length) out[resource] = on;
  });
  return out;
}

export default function RolesPermissionsPage() {
  const scope = useScope();

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);
  const [savedRoles, setSavedRoles] = useState([]);
  /* The matrix as the SERVER last confirmed it, per role. Ticking a box only
     changes `matrix`; until Save is pressed the database still holds this -
     which is exactly the trap this screen used to set, because an unticked
     box looked identical whether it had been saved or not. */
  const [savedSnapshot, setSavedSnapshot] = useState({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState('Location Manager');
  const [search, setSearch] = useState('');
  const [permSearch, setPermSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [flash, setFlash] = useState(null);

  const [showAllBusinesses, setShowAllBusinesses] = useState(true);
  const [userForm, setUserForm] = useState(null);
  const [loadingUserEdit, setLoadingUserEdit] = useState(false);
  const [modalBusinesses, setModalBusinesses] = useState([]);
  const [modalLocations, setModalLocations] = useState([]);
  const [loadingModalLocations, setLoadingModalLocations] = useState(false);
  const [modalCounters, setModalCounters] = useState([]);
  const [userFormErrors, setUserFormErrors] = useState({});
  const isViewerSuperAdmin = scope.user?.role === 'Super Admin';

  useEffect(() => {
    if (!userForm) return undefined;
    let off = false;
    fetch('/api/options?ref=business', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        setModalBusinesses(Array.isArray(d.options) ? d.options : []);
      })
      .catch(() => { if (!off) setModalBusinesses([]); });
    return () => { off = true; };
  }, [Boolean(userForm)]);

  const modalBizId = userForm?.businessId || '';
  useEffect(() => {
    if (!userForm || !modalBizId) {
      setModalLocations([]);
      setLoadingModalLocations(false);
      return undefined;
    }
    let off = false;
    setLoadingModalLocations(true);
    fetch('/api/options?ref=companylocations&business=' + encodeURIComponent(modalBizId), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        const opts = Array.isArray(d.options) ? d.options : [];
        setModalLocations(opts);
        const validSet = new Set(opts.map((o) => o.value));
        setUserForm((cur) => {
          if (!cur || cur.businessId !== modalBizId) return cur;
          const kept = (cur.locationIds || []).filter((id) => validSet.has(id));
          if (cur.role !== 'Super Admin' && !kept.length && opts.length === 1) {
            return { ...cur, locationIds: [opts[0].value] };
          }
          if (kept.length !== (cur.locationIds || []).length) {
            return { ...cur, locationIds: kept };
          }
          return cur;
        });
      })
      .catch(() => { if (!off) setModalLocations([]); })
      .finally(() => { if (!off) setLoadingModalLocations(false); });
    return () => { off = true; };
  }, [Boolean(userForm), modalBizId]);

  const modalRole = userForm?.role || '';
  const modalPrimaryLoc = userForm?.locationIds?.[0] || '';
  useEffect(() => {
    if (!userForm || modalRole !== 'Cashier' || !modalBizId) {
      setModalCounters([]);
      return undefined;
    }
    let off = false;
    const qs = new URLSearchParams({
      perPage: '200',
      business: modalBizId,
      location: modalPrimaryLoc,
    });
    fetch('/api/pos-counter?' + qs, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        const list = (d.rows || [])
          .filter((r) => String(r.status || 'Active').toLowerCase() !== 'inactive')
          .map((r) => ({ value: String(r._id), label: r.counterName || 'Counter' }));
        setModalCounters(list);
        setUserForm((cur) => {
          if (!cur || cur.businessId !== modalBizId) return cur;
          if (cur.counterId && !list.some((c) => c.value === cur.counterId)) {
            return { ...cur, counterId: '' };
          }
          return cur;
        });
      })
      .catch(() => { if (!off) setModalCounters([]); });
    return () => { off = true; };
  }, [Boolean(userForm), modalRole, modalBizId, modalPrimaryLoc]);

  /* roles this business has defined for itself, from /api/role */
  const [customRoles, setCustomRoles] = useState([]);
  const [roleForm, setRoleForm] = useState(null);   // null = dialog shut
  const [roleErrors, setRoleErrors] = useState({});

  const locked = isLockedRole(role);

  /* Ticked something and not pressed Save yet? Compared against what the
     server last confirmed, so it is true only when the two really differ. */
  const dirty = !locked
    && savedSnapshot[role] !== undefined
    && savedSnapshot[role] !== JSON.stringify(toApi(matrix[role]));

  /* The five from the code plus whatever this business has created. The join
     happens here because this is the only screen that needs it - see
     models/Role.js for why the two are stored apart. */
  const allRoles = useMemo(() => [
    ...BUILT_IN_ROLES,
    ...customRoles.map((r) => ({
      k: r.name,
      label: r.name,
      tone: 'pill-grey',
      custom: true,
      _id: String(r._id),
      description: r.description || 'No description.',
    })),
  ], [customRoles]);

  /* Everything this screen will show or offer. The owner role is filtered out
     here once, so no picker below has to remember to exclude it. */
  const roles = useMemo(
    () => (isViewerSuperAdmin ? allRoles : allRoles.filter((r) => !isOwnerRole(r.k))),
    [allRoles, isViewerSuperAdmin]
  );

  /* ------------------------------------------------------------- load ---- */

  const loadUsers = useCallback(async () => {
    if (!scope.businessReady) return;
    setLoadingUsers(true);
    try {
      const qs = new URLSearchParams({
        perPage: '200',
        ...(isViewerSuperAdmin && showAllBusinesses
          ? { allBusinesses: '1' }
          : { business: scope.business || '', includeSuperAdmin: '1' }),
      });
      const r = await fetch('/api/user?' + qs, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setUsers([]);
        setFlash({ type: 'err', msg: d.error || 'Could not load the user list.' });
        return;
      }
      setUsers(Array.isArray(d.rows) ? d.rows : []);
    } catch {
      setUsers([]);
      setFlash({ type: 'err', msg: 'Could not load the user list.' });
    } finally {
      setLoadingUsers(false);
    }
  }, [scope.business, scope.businessReady, isViewerSuperAdmin, showAllBusinesses]);

  const loadPermissions = useCallback(async () => {
    if (!scope.businessReady || !scope.business) return;
    setLoadingPerms(true);
    try {
      const r = await fetch('/api/role-permission?business=' + scope.business, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || 'Could not load the saved permissions.' });
        return;
      }
      /* A role the server did not return has no override and keeps its
         default. A role it DID return is used exactly as stored, even when
         that is nothing - see models/RolePermission.js. */
      const merged = { ...DEFAULT_MATRIX };
      Object.entries(d.roles || {}).forEach(([k, saved]) => { merged[k] = fromApi(saved); });
      setMatrix(merged);
      setSavedRoles(Array.isArray(d.saved) ? d.saved : []);

      /* What the server just told us, frozen for comparison. */
      const snap = {};
      Object.keys(merged).forEach((k) => { snap[k] = JSON.stringify(toApi(merged[k])); });
      setSavedSnapshot(snap);
    } catch {
      setFlash({ type: 'err', msg: 'Could not load the saved permissions.' });
    } finally {
      setLoadingPerms(false);
    }
  }, [scope.business, scope.businessReady]);

  const loadRoles = useCallback(async () => {
    if (!scope.businessReady || !scope.business) { setCustomRoles([]); return; }
    try {
      const r = await fetch('/api/role?business=' + scope.business, { cache: 'no-store' });
      const d = await r.json();
      setCustomRoles(r.ok && Array.isArray(d.rows) ? d.rows : []);
    } catch {
      setCustomRoles([]);
    }
  }, [scope.business, scope.businessReady]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadPermissions(); }, [loadPermissions]);
  useEffect(() => { loadRoles(); }, [loadRoles]);

  /* A confirmation is about the action just taken and should not sit there
     afterwards; an error stays until the next action, since it needs acting on. */
  useEffect(() => {
    if (!flash || flash.type !== 'ok') return undefined;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  /* ------------------------------------------------------------ derive --- */

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (
      u.name + ' ' + u.email + ' ' + u.role + ' ' + (u.businessName || '') + ' ' + (u.access || '') + ' ' + (u.counterName || '')
    ).toLowerCase().includes(q));
  }, [users, search]);

  /* Users table: numbered pager, Rows-per-page and sortable headers
     (19-10-2026) over the accounts already loaded. The value is what the
     cell shows. */
  const usersView = useClientTable(shown, (u, key) => {
    if (key === 'user') return u.name || '';
    if (key === 'role') return u.role || '';
    if (key === 'business') return u.businessName || '';
    if (key === 'access') return u.access || 'Not assigned';
    if (key === 'counter') return u.counterName || '';
    if (key === 'status') return u.isActive === false ? 'Disabled' : 'Active';
    if (key === 'added') return u.createdAt ? new Date(u.createdAt) : '';
    return '';
  });

  const usersPerRole = useMemo(() => {
    const out = {};
    users.forEach((u) => { out[u.role] = (out[u.role] || 0) + 1; });
    return out;
  }, [users]);

  const groups = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    if (!q) return RESOURCE_GROUPS;
    return RESOURCE_GROUPS
      .map((g) => ({
        ...g,
        resources: g.resources.filter((r) => (r.label + ' ' + g.group + ' ' + r.href)
          .toLowerCase().includes(q)),
      }))
      .filter((g) => g.resources.length);
  }, [permSearch]);

  const held = (resourceKey, actionKey) => Boolean(matrix[role]?.[resourceKey]?.[actionKey]);
  const heldCount = (resourceKey) => ACTIONS.filter((a) => held(resourceKey, a.k)).length;

  /* ------------------------------------------------------------- edit ---- */

  function setActions(resourceKey, next) {
    if (locked) return;
    setMatrix((cur) => ({ ...cur, [role]: { ...(cur[role] || {}), [resourceKey]: next } }));
  }

  function toggle(resourceKey, actionKey) {
    if (locked) return;
    const row = matrix[role]?.[resourceKey] || {};
    setActions(resourceKey, { ...row, [actionKey]: !row[actionKey] });
  }

  function toggleResource(resourceKey) {
    if (locked) return;
    const all = heldCount(resourceKey) === ACTIONS.length;
    const next = {};
    if (!all) ACTIONS.forEach((a) => { next[a.k] = true; });
    setActions(resourceKey, next);
  }

  function toggleGroup(group) {
    if (locked) return;
    const resources = RESOURCE_GROUPS.find((g) => g.group === group)?.resources || [];
    const { on, total } = groupTally(matrix, role, group);
    const turningOn = on < total;
    setMatrix((cur) => {
      const next = { ...(cur[role] || {}) };
      resources.forEach((r) => {
        const row = {};
        if (turningOn) ACTIONS.forEach((a) => { row[a.k] = true; });
        next[r.k] = row;
      });
      return { ...cur, [role]: next };
    });
  }

  /* ------------------------------------------------------------- save ---- */

  async function save() {
    if (locked || !scope.business) return;
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch('/api/role-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business,
          role,
          permissions: toApi(matrix[role]),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || Object.values(d.errors || {})[0] || 'Could not save.' });
        return;
      }
      setSavedRoles((cur) => (cur.includes(role) ? cur : [...cur, role]));
      setSavedSnapshot((cur) => ({ ...cur, [role]: JSON.stringify(toApi(matrix[role])) }));
      setFlash({ type: 'ok', msg: 'Saved - ' + role + ' now holds ' + d.granted + ' permissions.' });
      scope.refreshPermissions?.();
    } catch {
      setFlash({ type: 'err', msg: 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  /* Deletes the override so the role genuinely returns to the code default,
     rather than saving a copy of the default that would then stop tracking it. */
  async function resetRole() {
    if (locked || !scope.business) return;
    setBusy(true);
    setFlash(null);
    try {
      const qs = new URLSearchParams({ business: scope.business, role });
      const r = await fetch('/api/role-permission?' + qs, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || 'Could not reset.' });
        return;
      }
      setMatrix((cur) => ({ ...cur, [role]: DEFAULT_MATRIX[role] || {} }));
      setSavedRoles((cur) => cur.filter((x) => x !== role));
      setSavedSnapshot((cur) => ({
        ...cur, [role]: JSON.stringify(toApi(DEFAULT_MATRIX[role] || {})),
      }));
      setFlash({ type: 'ok', msg: role + ' is back to its default permissions.' });
      scope.refreshPermissions?.();
    } catch {
      setFlash({ type: 'err', msg: 'Could not reset.' });
    } finally {
      setBusy(false);
    }
  }

  /* PUT wants the whole account, not a patch, so the row is sent back with
     the one field changed - see app/api/user/[id]/route.js. */
  async function updateUser(user, patch) {
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch('/api/user/' + user._id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quick: true,
          business: user.businessId || scope.business || '',
          data: {
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            businessId: user.businessId || '',
            locationIds: user.locationIds || [],
            allow: user.allow || [],
            deny: user.deny || [],
            ...patch,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || Object.values(d.errors || {})[0] || 'Could not save that change.' });
        loadUsers();
        return;
      }
      setFlash({ type: 'ok', msg: user.name + ' updated.' });
      loadUsers();
      scope.refreshScope?.();
      scope.refreshPermissions?.();
    } catch {
      setFlash({ type: 'err', msg: 'Could not save that change.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitRole() {
    const isEdit = Boolean(roleForm && roleForm._id);
    setBusy(true);
    setRoleErrors({});
    try {
      const r = await fetch(isEdit ? '/api/role/' + roleForm._id : '/api/role', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business || '',
          data: { name: roleForm.name, description: roleForm.description },
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setRoleErrors(d.errors || {});
        if (!d.errors) setFlash({ type: 'err', msg: d.error || 'Could not save the role.' });
        return;
      }
      /* A rename carries its saved matrix with it (see the PUT handler), so
         the selected role has to follow it or the Permissions tab would be
         left pointing at a name that no longer exists. */
      if (d.renamedFrom && role === d.renamedFrom) setRole(d.name);
      setRoleForm(null);
      setFlash({ type: 'ok', msg: 'Role "' + d.name + '" ' + (isEdit ? 'updated' : 'created') + '.' });
      loadRoles();
      loadPermissions();
    } catch {
      setFlash({ type: 'err', msg: 'Could not save the role.' });
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(r) {
    if (!window.confirm('Delete the role "' + r.label + '"? Its saved permissions go with it.')) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/role/' + r._id, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: d.error || 'Could not delete the role.' });
        return;
      }
      if (role === r.k) setRole('Location Manager');
      setFlash({ type: 'ok', msg: 'Role "' + d.deleted + '" deleted.' });
      loadRoles();
      loadPermissions();
    } catch {
      setFlash({ type: 'err', msg: 'Could not delete the role.' });
    } finally {
      setBusy(false);
    }
  }

  function openAddUser() {
    setUserFormErrors({});
    setFlash(null);
    setUserForm({
      ...EMPTY_USER_FORM,
      mode: 'add',
      role: 'Location User',
      businessId: scope.business || '',
      locationIds: scope.isRestricted && scope.location ? [scope.location] : [],
    });
  }

  async function openEditUser(u) {
    setUserFormErrors({});
    setFlash(null);
    setLoadingUserEdit(true);
    setUserForm({
      ...EMPTY_USER_FORM,
      mode: 'edit',
      _id: u._id,
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: u.role || 'Location User',
      businessId: u.businessId || '',
      locationIds: Array.isArray(u.locationIds) ? u.locationIds : [],
      counterId: u.counterId || '',
      isActive: u.isActive !== false,
    });
    try {
      const r = await fetch('/api/user/' + u._id, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.doc) {
        setFlash({ type: 'err', msg: d.error || 'Could not load user details.' });
        setUserForm(null);
        return;
      }
      const doc = d.doc;
      setUserForm({
        mode: 'edit',
        _id: String(doc._id),
        name: doc.name || '',
        email: doc.email || '',
        password: '',
        role: doc.role || 'Location User',
        businessId: doc.businessId ? String(doc.businessId) : '',
        locationIds: Array.isArray(doc.locationIds) ? doc.locationIds.map(String) : [],
        counterId: doc.counterId ? String(doc.counterId) : '',
        isActive: doc.isActive !== false,
      });
    } catch {
      setFlash({ type: 'err', msg: 'Could not load user details.' });
      setUserForm(null);
    } finally {
      setLoadingUserEdit(false);
    }
  }

  function toggleUserLocation(locId) {
    setUserForm((cur) => {
      if (!cur) return cur;
      const exists = (cur.locationIds || []).includes(locId);
      const next = exists
        ? cur.locationIds.filter((id) => id !== locId)
        : [...(cur.locationIds || []), locId];
      return { ...cur, locationIds: next };
    });
  }

  async function submitUserForm() {
    if (!userForm) return;
    const isEdit = userForm.mode === 'edit';
    const isSuper = userForm.role === 'Super Admin';
    const errs = {};
    if (!userForm.name.trim()) errs.name = 'Full name is required';
    if (!userForm.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email.trim())) errs.email = 'That is not a valid email address';
    if (!isEdit && !userForm.password) errs.password = 'Password is required';
    else if (userForm.password && userForm.password.length < 8) errs.password = 'Use at least 8 characters';
    if (!userForm.role) errs.role = 'Role is required';
    if (!isSuper && !userForm.businessId) errs.businessId = 'Select a business';
    if (!isSuper && (!userForm.locationIds || !userForm.locationIds.length)) {
      errs.locationIds = 'Select at least one location belonging to this business';
    }
    if (userForm.role === 'Cashier' && !userForm.counterId) errs.counterId = 'Select the cash counter';
    setUserFormErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const payload = {
        business: userForm.businessId || '',
        data: {
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          ...(userForm.password ? { password: userForm.password } : {}),
          role: userForm.role,
          isActive: userForm.isActive !== false,
          businessId: userForm.businessId || '',
          locationIds: isSuper ? [] : (userForm.locationIds || []),
          counterId: userForm.role === 'Cashier' ? (userForm.counterId || '') : '',
        },
      };
      const url = isEdit ? '/api/user/' + userForm._id : '/api/user';
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setUserFormErrors(d.errors || {});
        if (!d.errors) setFlash({ type: 'err', msg: d.error || 'Could not save the account.' });
        return;
      }
      const savedName = userForm.name.trim();
      setUserForm(null);
      setUserFormErrors({});
      setFlash({
        type: 'ok',
        msg: isEdit
          ? `${savedName} updated successfully.`
          : `${savedName} can now sign in with their assigned business and location access.`,
      });
      loadUsers();
      scope.refreshScope?.();
      scope.refreshPermissions?.();
    } catch {
      setFlash({ type: 'err', msg: 'Could not save the account.' });
    } finally {
      setBusy(false);
    }
  }

  const noBusiness = scope.businessReady && !scope.business;

  return (
    <div className="card p-4">
      <div className="mb-1 flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div>
          <div className="card-title">Users &amp; roles</div>
          <div className="text-[12px] text-inkmuted">Who can sign in, their business/location access, and what each role may do</div>
        </div>
        <span className="flex-1" />
        <button type="button" className="btn btn-primary" onClick={openAddUser}>
          <Icon name="plus" size={14} /> Add user
        </button>
      </div>

      {/* The one thing somebody has to know before trusting this screen. */}
      <div className="note-box mt-3 text-[12px]">
        <b>Enforced across sidebar, pages, and APIs.</b> Permissions are stored per
        business. Disabling <b>Read</b> for a screen immediately hides its menu and
        parent group from the sidebar and blocks direct URL and API access for that role.
      </div>

      {flash && (
        <div className={'mt-3 rounded border px-3 py-2 text-[13px] '
          + (flash.type === 'ok'
            ? 'border-green-300 bg-green-50 text-green-800'
            : 'border-danger bg-[#fdf1f1] text-danger')}
        >
          {flash.msg}
        </div>
      )}

      {noBusiness && (
        <div className="mt-3 rounded border border-warnyellow bg-[#fffbe9] px-3 py-2 text-[13px]">
          Select a business in the top bar - permissions are saved against one.
        </div>
      )}

      <div className="mb-3 mt-3 flex gap-2">
        {TABS.map(([key, text]) => (
          <button
            key={key}
            type="button"
            className={'btn h-8 px-3 text-[12px] ' + (tab === key ? 'btn-primary' : '')}
            onClick={() => {
              /* Leaving the Permissions tab with unsaved ticks is the other
                 way to lose them without noticing. */
              if (tab === 'permissions' && key !== 'permissions' && dirty
                && !window.confirm('You have unsaved permission changes for ' + role
                  + '. Leave this tab and lose them?')) return;
              setTab(key);
              setFlash(null);
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {/* ======================================================== USERS ==== */}
      {tab === 'users' && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              className="f-input h-8 w-full max-w-[300px]"
              placeholder="Search name, email, role, business or location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isViewerSuperAdmin && (
              <select
                className="f-input h-8 w-[190px] text-[12px]"
                value={showAllBusinesses ? 'all' : 'current'}
                onChange={(e) => setShowAllBusinesses(e.target.value === 'all')}
              >
                <option value="all">All Businesses</option>
                <option value="current">Current Business Only</option>
              </select>
            )}
            <button type="button" className="btn h-8 px-3 text-[12px]" onClick={loadUsers}>
              <Icon name="refresh" size={12} /> Refresh
            </button>
            <span className="flex-1" />
            <span className="text-[12px] text-inkmuted">{shown.length} of {users.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>#</th>
                  {usersView.th('User', 'user')}
                  {usersView.th('Role', 'role')}
                  {usersView.th('Business', 'business')}
                  {usersView.th('Location', 'access')}
                  {usersView.th('Cash Counter', 'counter')}
                  {usersView.th('Status', 'status')}
                  {usersView.th('Added', 'added', 'whitespace-nowrap')}
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers && <tr><td colSpan={9} className="dt-empty">Loading...</td></tr>}

                {!loadingUsers && !shown.length && (
                  <tr><td colSpan={9} className="dt-empty">
                    {users.length ? 'No user matches that search.' : 'No accounts under this business yet.'}
                  </td></tr>
                )}

                {!loadingUsers && usersView.rows.map((u, i) => {
                  const tone = allRoles.find((r) => r.k === u.role)?.tone || 'pill-grey';
                  const isSuperRow = isOwnerRole(u.role);
                  return (
                    <tr key={u._id}>
                      <td className="text-center">{usersView.offset + i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pillgrey text-[11px] font-semibold text-cell">
                            {initialsOf(u.name)}
                          </span>
                          <span>
                            <div className="font-semibold">{u.name}</div>
                            <div className="text-[11px] normal-case text-inkmuted">{u.email}</div>
                          </span>
                        </div>
                      </td>
                      <td>
                        {isSuperRow ? (
                          <span className={'pill ' + tone}>{u.role}</span>
                        ) : (
                          <select
                            className="f-input h-7 w-[160px] text-[12px]"
                            value={u.role || ''}
                            disabled={busy}
                            onChange={(e) => updateUser(u, { role: e.target.value })}
                          >
                            {!roles.some((r) => r.k === u.role) && u.role && (
                              <option value={u.role}>{u.role} (no longer defined)</option>
                            )}
                            {roles.filter((r) => !isOwnerRole(r.k)).map((r) => (
                              <option key={r.k} value={r.k}>{r.label}</option>
                            ))}
                          </select>
                        )}
                        <span className={'pill ' + tone + ' ml-2 align-middle'}>
                          {grantedCount(matrix, u.role)}
                        </span>
                      </td>
                      <td>
                        {isSuperRow ? (
                          <span className="pill pill-grey">All Businesses</span>
                        ) : u.businessName ? (
                          <span className="text-[12.5px] font-medium">{u.businessName}</span>
                        ) : (
                          <span className="pill pill-red">Needs Business</span>
                        )}
                      </td>
                      <td>
                        {isSuperRow ? (
                          <span className="pill pill-grey">Unrestricted</span>
                        ) : u.needsAssignment ? (
                          <span className="pill pill-red">Needs Assignment</span>
                        ) : (
                          <div className="max-w-[240px]">
                            <span className="text-[12.5px] font-medium">{u.access}</span>
                            {u.locationIds?.length === 1 && (
                              <span className="pill pill-blue ml-1.5">Locked</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-[12.5px]">
                        {u.role === 'Cashier' ? (u.counterName || <span className="text-inkmuted">-</span>) : <span className="text-inkmuted">-</span>}
                      </td>
                      <td>
                        <select
                          className="f-input h-7 w-[105px] text-[12px]"
                          value={u.isActive === false ? 'no' : 'yes'}
                          disabled={busy}
                          onChange={(e) => updateUser(u, { isActive: e.target.value === 'yes' })}
                        >
                          <option value="yes">Active</option>
                          <option value="no">Disabled</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="pill pill-grey">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '-'}
                        </span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {(!isSuperRow || isViewerSuperAdmin) && (
                          <button
                            type="button"
                            className="act-btn bg-[#2b7fd4]"
                            title="Edit user"
                            disabled={busy}
                            onClick={() => openEditUser(u)}
                          >
                            <Icon name="pencil" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {usersView.pager}
          </div>

          <div className="mt-2 text-[12px] text-inkmuted">
            Super Admin holds unrestricted access across all businesses and locations. Every other account is locked to its assigned Business and Location(s).
          </div>
          {!!customRoles.length && (
            <div className="note-box mt-2 text-[12px]">
              <b>What a role of your own grants today.</b> The permissions you tick for it
              are stored, but nothing reads them yet, and <code>lib/rbac.js</code> resolves a
              role it does not recognise to the NARROWEST built-in set. So until
              enforcement is wired, an account on one of your roles behaves like a
              Cashier on the handful of routes that do check - it fails closed, never
              open. Keep anyone who needs wider access on a built-in role for now.
            </div>
          )}
        </>
      )}

      {/* ======================================================== ROLES ==== */}
      {tab === 'roles' && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-inkmuted">
              {BUILT_IN_ROLES.filter((r) => !r.owner).length} built in,{' '}
              {customRoles.length} of your own
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="btn btn-primary h-8 px-3 text-[12px]"
              disabled={!scope.business}
              onClick={() => { setRoleForm({ name: '', description: '' }); setRoleErrors({}); }}
            >
              <Icon name="plus" size={12} /> Add role
            </button>
          </div>

        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>#</th>
                <th>Role</th>
                <th>What it is for</th>
                <th className="text-center">Users</th>
                <th className="whitespace-nowrap text-center">Reach</th>
                <th>Source</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r, i) => {
                const n = grantedCount(matrix, r.k);
                const pct = Math.round((n / TOTAL_GRANTS) * 100);
                const customised = savedRoles.includes(r.k);
                return (
                  <tr key={r.k}>
                    <td className="text-center">{i + 1}</td>
                    <td className="whitespace-nowrap">
                      <span className={'pill ' + r.tone}>{r.label}</span>
                      {r.locked && <div className="mt-1 text-[11px] text-inkmuted">unrestricted</div>}
                    </td>
                    <td className="normal-case">{r.description}</td>
                    <td className="text-center">{usersPerRole[r.k] || 0}</td>
                    <td className="whitespace-nowrap text-center">
                      <div>{n} / {TOTAL_GRANTS}</div>
                      <div className="mx-auto mt-1 h-1.5 w-24 rounded bg-pillgrey">
                        <div className="h-1.5 rounded bg-brand" style={{ width: pct + '%' }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={'pill ' + (r.custom ? 'pill-green' : customised ? 'pill-blue' : 'pill-grey')}>
                        {r.custom ? 'your role' : r.locked ? 'built in' : customised ? 'customised' : 'default'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="btn h-7 px-3 text-[12px]"
                          onClick={() => { setRole(r.k); setTab('permissions'); setFlash(null); }}
                        >
                          <Icon name="eye" size={12} /> Open
                        </button>
                        {/* Only a role this business made can be renamed or
                            removed - the five built-ins are code. */}
                        {r.custom && (
                          <>
                            <button
                              type="button"
                              className="act-btn bg-[#2b7fd4]"
                              title="Edit"
                              disabled={busy}
                              onClick={() => {
                                setRoleForm({
                                  _id: r._id,
                                  name: r.label,
                                  description: r.description === 'No description.' ? '' : r.description,
                                });
                                setRoleErrors({});
                              }}
                            >
                              <Icon name="pencil" size={12} />
                            </button>
                            <button
                              type="button"
                              className="act-btn bg-danger"
                              title="Delete"
                              disabled={busy}
                              onClick={() => removeRole(r)}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* ================================================== PERMISSIONS ==== */}
      {tab === 'permissions' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="mr-2">
              <div className="text-[15px] font-bold">Permissions</div>
              <div className="text-[12px] text-inkmuted">
                {locked
                  ? 'This role is unrestricted - every permission is held and none can be withdrawn.'
                  : 'One row per screen in the sidebar.'}
                {loadingPerms && ' Loading...'}
              </div>
            </div>
            <span className="flex-1" />
            <input
              className="f-input h-8 w-full max-w-[220px]"
              placeholder="Search a screen"
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
            />
            <select
              className="f-input h-8 w-[180px]"
              value={role}
              onChange={(e) => { setRole(e.target.value); setFlash(null); }}
            >
              {roles.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
            </select>
            <button
              type="button"
              className="btn h-8 px-3 text-[12px]"
              onClick={() => setCollapsed(
                Object.keys(collapsed).length ? {} : Object.fromEntries(RESOURCE_GROUPS.map((g) => [g.group, true]))
              )}
            >
              <Icon name="cols" size={12} /> {Object.keys(collapsed).length ? 'Expand all' : 'Collapse all'}
            </button>
            <button
              type="button"
              className="btn h-8 px-3 text-[12px]"
              disabled={locked || busy || !scope.business}
              onClick={resetRole}
            >
              <Icon name="undo" size={12} /> Reset
            </button>
            <button
              type="button"
              className={'btn h-8 px-3 text-[12px] '
                + (dirty ? 'btn-primary ring-2 ring-warnyellow' : 'btn-primary')}
              disabled={locked || busy || !scope.business}
              onClick={save}
            >
              {busy ? <span className="spin" /> : <Icon name="save" size={12} />}
              {dirty ? ' Save changes' : ' Save'}
            </button>
          </div>

          {/* An unticked box that has not been saved looks exactly like one
              that has. Saying so is the difference between "this permission is
              off" and "this permission is off on my screen only". */}
          {dirty && (
            <div className="mb-3 rounded border border-warnyellow bg-[#fffbe9] px-3 py-2 text-[13px]">
              <b>Not saved yet.</b> These ticks are on screen only - {role} still has
              whatever was last saved, and nothing changes for anyone until you press
              <b> Save changes</b>.
            </div>
          )}

          {!groups.length && (
            <div className="dt-empty py-8 text-center">No screen matches that search.</div>
          )}

          {groups.map((g) => {
            const { on, total } = groupTally(matrix, role, g.group);
            const shut = collapsed[g.group];
            return (
              <div key={g.group} className="mb-3 rounded border border-line">
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-thead px-3 py-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-bold text-ink"
                    onClick={() => setCollapsed((c) => ({ ...c, [g.group]: !c[g.group] }))}
                  >
                    <Icon name={shut ? 'chevR' : 'chevD'} size={12} />
                    {g.group}
                  </button>
                  <span className="pill pill-grey">{g.resources.length} screens</span>
                  <span className="flex-1" />
                  <span className="text-[12px] text-inkmuted">{locked ? total : on} / {total}</span>
                  <button
                    type="button"
                    className="btn h-7 px-2 text-[11px]"
                    disabled={locked}
                    onClick={() => toggleGroup(g.group)}
                  >
                    {on === total ? 'Clear group' : 'Select group'}
                  </button>
                </div>

                {!shut && g.resources.map((res) => {
                  const title = resourceTitle(res);
                  const n = locked ? ACTIONS.length : heldCount(res.k);
                  const allOn = n === ACTIONS.length;
                  return (
                    <div
                      key={res.k}
                      className="grid grid-cols-1 gap-2 border-b border-line px-3 py-3 last:border-b-0 md:grid-cols-[minmax(170px,1fr)_auto_minmax(240px,1.3fr)] md:gap-4"
                    >
                      <div>
                        <div className="text-[13px] font-semibold">{title}</div>
                        <div className="text-[11px] normal-case text-inkmuted">{res.href}</div>
                      </div>

                      <div className="md:pt-0.5">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-brand disabled:cursor-not-allowed"
                            checked={allOn}
                            disabled={locked}
                            onChange={() => toggleResource(res.k)}
                          />
                          Select all
                        </label>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {ACTIONS.map((a) => (
                          <label key={a.k} className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-brand disabled:cursor-not-allowed"
                              checked={locked ? true : held(res.k, a.k)}
                              disabled={locked}
                              onChange={() => toggle(res.k, a.k)}
                            />
                            {title} {a.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="mt-2 text-[12px] text-inkmuted">
            {locked ? TOTAL_GRANTS : grantedCount(matrix, role)} of {TOTAL_GRANTS} permissions
            held by {role}, across {RESOURCES.length} screens.
            {!locked && !savedRoles.includes(role) && ' Not saved yet - showing the default.'}
          </div>
        </>
      )}

      {/* ======================================================== ROLE ===== */}
      {roleForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => setRoleForm(null)}
        >
          <div
            className="my-10 w-full max-w-[460px] rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <span className="card-title">{roleForm._id ? 'Edit role' : 'Add role'}</span>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={() => setRoleForm(null)}>
                <Icon name="x" size={12} /> Close
              </button>
            </div>

            <div className="form-grid p-5">
              <div>
                <label className="f-label">Role Name <span className="f-req">*</span></label>
                <input
                  className="f-input"
                  placeholder="e.g. Warehouse Supervisor"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm((c) => ({ ...c, name: e.target.value }))}
                />
                {roleErrors.name
                  ? <div className="f-err">{roleErrors.name}</div>
                  : <div className="f-hint">Must not match a built-in role.</div>}
              </div>

              <div>
                <label className="f-label">Role Description</label>
                <textarea
                  className="f-input f-textarea"
                  rows={3}
                  placeholder="What this role is for, in one line"
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((c) => ({ ...c, description: e.target.value }))}
                />
                {roleErrors.description
                  ? <div className="f-err">{roleErrors.description}</div>
                  : <div className="f-hint">Shown on the Roles tab so the next person knows why it exists.</div>}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-5 py-3">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitRole}>
                {busy ? <span className="spin" /> : <Icon name="check" size={12} />}
                {roleForm._id ? ' Save role' : ' Create role'}
              </button>
              <button type="button" className="btn" onClick={() => setRoleForm(null)}>Cancel</button>
              <span className="flex-1" />
              <span className="text-[11px] text-inkmuted">
                {roleForm._id ? 'Renaming keeps its permissions.' : 'Starts with nothing granted.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= ADD / EDIT USER === */}
      {userForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => !busy && setUserForm(null)}
        >
          <div
            className="my-6 flex max-h-[90vh] w-full max-w-[500px] flex-col rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
              <span className="card-title">{userForm.mode === 'edit' ? 'Edit user' : 'Add user'}</span>
              <span className="flex-1" />
              <button type="button" className="btn" disabled={busy} onClick={() => setUserForm(null)}>
                <Icon name="x" size={12} /> Close
              </button>
            </div>

            <div className="form-grid min-h-0 flex-1 overflow-y-auto p-5">
              {loadingUserEdit && (
                <div className="text-[12px] text-inkmuted">Refreshing latest user record...</div>
              )}

              <div>
                <label className="f-label">Full name <span className="f-req">*</span></label>
                <input
                  className="f-input"
                  value={userForm.name}
                  onChange={(e) => setUserForm((c) => ({ ...c, name: e.target.value }))}
                />
                {userFormErrors.name && <div className="f-err">{userFormErrors.name}</div>}
              </div>

              <div>
                <label className="f-label">Email <span className="f-req">*</span></label>
                <input
                  className="f-input normal-case"
                  value={userForm.email}
                  onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))}
                />
                {userFormErrors.email && <div className="f-err">{userFormErrors.email}</div>}
              </div>

              <div>
                <label className="f-label">
                  {userForm.mode === 'edit' ? 'New Password (optional)' : <>Password <span className="f-req">*</span></>}
                </label>
                <input
                  type="password"
                  className="f-input normal-case"
                  placeholder={userForm.mode === 'edit' ? 'Leave blank to keep existing password' : ''}
                  value={userForm.password}
                  onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))}
                />
                {userFormErrors.password ? (
                  <div className="f-err">{userFormErrors.password}</div>
                ) : (
                  <div className="f-hint">
                    {userForm.mode === 'edit'
                      ? 'Leave blank to preserve the existing password. Minimum 8 characters if changing.'
                      : 'At least 8 characters. There is no mail server, so tell them yourself.'}
                  </div>
                )}
              </div>

              <div>
                <label className="f-label">Role <span className="f-req">*</span></label>
                <select
                  className="f-input"
                  value={userForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setUserForm((c) => ({
                      ...c,
                      role: nextRole,
                      ...(nextRole === 'Super Admin' ? { locationIds: [], counterId: '' } : {}),
                      ...(nextRole !== 'Cashier' ? { counterId: '' } : {}),
                    }));
                  }}
                >
                  {!roles.some((r) => r.k === userForm.role) && userForm.role && (
                    <option value={userForm.role}>{userForm.role}</option>
                  )}
                  {roles.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
                </select>
                {userFormErrors.role && <div className="f-err">{userFormErrors.role}</div>}
                <div className="f-hint">{roles.find((r) => r.k === userForm.role)?.description}</div>
              </div>

              <div>
                <label className="f-label">
                  Business / Company {userForm.role !== 'Super Admin' && <span className="f-req">*</span>}
                </label>
                <select
                  className="f-input"
                  value={userForm.businessId}
                  onChange={(e) => {
                    const nextBiz = e.target.value;
                    setUserForm((c) => ({
                      ...c,
                      businessId: nextBiz,
                      locationIds: [],
                      counterId: '',
                    }));
                  }}
                >
                  <option value="">
                    {userForm.role === 'Super Admin' ? 'All Businesses (Global Access)' : 'Select Business'}
                  </option>
                  {modalBusinesses.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
                {userFormErrors.businessId && <div className="f-err">{userFormErrors.businessId}</div>}
              </div>

              {userForm.role === 'Super Admin' ? (
                <div className="rounded border border-line bg-[#f8fafc] px-3 py-2 text-[12px] text-inkmuted">
                  <b>Super Admin:</b> Global access across all businesses and all locations is always preserved.
                </div>
              ) : (
                <div>
                  <label className="f-label">
                    Location <span className="f-req">*</span>
                  </label>
                  {!userForm.businessId ? (
                    <div className="rounded border border-line bg-[#f8fafc] px-3 py-2 text-[12px] text-inkmuted">
                      Select a Business first to load its locations.
                    </div>
                  ) : loadingModalLocations ? (
                    <div className="rounded border border-line bg-[#f8fafc] px-3 py-2 text-[12px] text-inkmuted">
                      Loading locations...
                    </div>
                  ) : !modalLocations.length ? (
                    <div className="rounded border border-danger/30 bg-[#fdf1f1] px-3 py-2 text-[12px] text-danger">
                      No locations found under this business.
                    </div>
                  ) : (
                    <div className="max-h-36 space-y-1.5 overflow-y-auto rounded border border-line bg-white p-2.5">
                      {modalLocations.map((loc) => {
                        const checked = (userForm.locationIds || []).includes(loc.value);
                        return (
                          <label
                            key={loc.value}
                            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-[#f5f8fd]"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-brand"
                              checked={checked}
                              onChange={() => toggleUserLocation(loc.value)}
                            />
                            <span className="font-medium text-ink">{loc.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {userFormErrors.locationIds ? (
                    <div className="f-err">{userFormErrors.locationIds}</div>
                  ) : (
                    <div className="f-hint">
                      {(userForm.locationIds || []).length === 1
                        ? '1 location selected — Location selector will be locked to this location after login.'
                        : (userForm.locationIds || []).length > 1
                          ? `${userForm.locationIds.length} locations selected — user can switch only between these assigned locations.`
                          : 'Assign 1 location to lock the user, or multiple locations if they work across branches.'}
                    </div>
                  )}
                </div>
              )}

              {userForm.role === 'Cashier' && (
                <div>
                  <label className="f-label">Cash Counter <span className="f-req">*</span></label>
                  <select
                    className="f-input"
                    value={userForm.counterId}
                    onChange={(e) => setUserForm((c) => ({ ...c, counterId: e.target.value }))}
                  >
                    <option value="">Select cash counter</option>
                    {modalCounters.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {userFormErrors.counterId
                    ? <div className="f-err">{userFormErrors.counterId}</div>
                    : <div className="f-hint">{modalCounters.length ? 'Counters available under the selected business and location.' : 'No cash counter found for the selected business/location.'}</div>}
                </div>
              )}

              {userForm.mode === 'edit' && (
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-brand"
                      checked={userForm.isActive !== false}
                      onChange={(e) => setUserForm((c) => ({ ...c, isActive: e.target.checked }))}
                    />
                    Active account (can sign in)
                  </label>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
              <button type="button" className="btn btn-primary" disabled={busy || loadingUserEdit} onClick={submitUserForm}>
                {busy ? <span className="spin" /> : <Icon name="check" size={12} />}
                {userForm.mode === 'edit' ? ' Save changes' : ' Create account'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setUserForm(null)}>Cancel</button>
              <span className="flex-1" />
              <span className="text-[11px] text-inkmuted">
                {userForm.role === 'Super Admin' ? 'Unrestricted global access' : 'Locked to assigned access'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
