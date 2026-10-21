/* Users - field spec.

   This screen is what makes the role and location model in lib/rbac.js
   usable. Without it every account stays a Super Admin with no locations,
   which is how the system behaved before permissions existed - so the
   enforcement would be real but nothing would ever be enforced.

   THE ONE THING TO UNDERSTAND: leaving Locations empty means ALL LOCATIONS.
   That is deliberate - it is the pre-existing behaviour, so upgrading does
   not lock anybody out of anything - and it is spelled out on the form
   because "empty means unrestricted" is the opposite of what an empty
   permission list usually means. */

export const ROLE_OPTIONS = [
  { v: 'Super Admin', l: 'Super Admin - everything, including user management' },
  { v: 'Admin', l: 'Admin - everything, including user management' },
  { v: 'Location Manager', l: 'Location Manager - receive, despatch, sell, bill, report' },
  { v: 'Location User', l: 'Location User - receive incoming stock, return, sell' },
  { v: 'Cashier', l: 'Cashier - the till only' },
];

export const FIELDS = [
  { k: 'name', label: 'Full Name', type: 'text', req: true },
  { k: 'email', label: 'Email (used to sign in)', type: 'text', req: true },
  {
    k: 'password',
    label: 'Password',
    type: 'password',
    hint: 'At least 8 characters. Leave blank when editing to keep the current password.',
  },
  {
    k: 'role',
    label: 'Role',
    type: 'select',
    req: true,
    def: 'Location User',
    opts: ROLE_OPTIONS,
  },
  {
    k: 'locationIds',
    label: 'Locations this account may work at',
    type: 'multiref',
    ref: 'companylocations',
    hint: 'Leave empty to allow every location. Choose one or more to restrict the account to them - '
      + 'it will then only see and act on transfers with one end at those locations.',
  },
  {
    k: 'isActive',
    label: 'Active',
    type: 'checkbox',
    def: true,
    hint: 'An inactive account cannot sign in. Accounts are never deleted - their name is on documents and audit rows.',
  },
];

export const CONFIG = {
  title: 'User',
  addTitle: 'Add User',
  basePath: '/admin/setting/',
  slugPath: 'users',
  endpoint: '/api/user',
  scope: ['business'],
  fields: FIELDS,
  note: [
    'Permissions are enforced on the server, not by hiding buttons - a restricted account cannot reach '
    + 'another location’s stock even by editing the address bar.',
    'Changes to an account’s role or locations take effect the next time that person signs in.',
  ],
};

export const LIST = {
  title: 'Users',
  basePath: '/admin/setting/',
  slugPath: 'users',
  endpoint: '/api/user',
  scope: ['business'],
  addHref: '/admin/setting/users/add',
  actionPosition: 'left',
  actionVariant: 'icons',
  columns: [
    { k: 'name', t: 'Name' },
    { k: 'email', t: 'Email' },
    { k: 'role', t: 'Role' },
    { k: 'access', t: 'Location Access' },
    { k: 'isActive', t: 'Status', f: 'pill', value: (r) => (r.isActive ? 'Active' : 'Disabled') },
    { k: 'createdAt', t: 'Created', f: 'date' },
  ],
};
