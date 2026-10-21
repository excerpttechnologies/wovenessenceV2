import mongoose from 'mongoose';

/* Users.

   The schema was previously declared inline inside
   app/api/auth/[action]/route.js, which meant nothing else could read a user
   without redeclaring it - and a second declaration of the same model name
   throws (OverwriteModelError) or, worse, silently wins and drops fields.
   Lifting it here lets the RBAC layer and the reports resolve a user by id.

   The auth route keeps its exact behaviour; it now imports this model.

   `role` and `locationIds` are what lib/rbac.js enforces. Existing rows have
   neither: a user with no locationIds is unrestricted, which is how every
   account behaved before this change, so nobody is locked out by the upgrade.

   Collection name pinned lowercase, same reasoning as every other model. */

export const LABEL_FIELD = 'name';

/* Roles, most privileged first. A role that is not in this list is treated as
   the least privileged - unknown never means unrestricted. */
export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  LOCATION_MANAGER: 'Location Manager',
  LOCATION_USER: 'Location User',
  CASHIER: 'Cashier',
};

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, index: true },
    password: String,
    role: { type: String, default: ROLES.SUPER_ADMIN },
    isActive: { type: Boolean, default: true },

    /* Which business the account belongs to. Null on a Super Admin, who
       works across all of them. */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },

    /* The locations this account may act on. EMPTY MEANS ALL - that is the
       pre-existing behaviour, kept deliberately so upgrading does not lock
       every existing account out of every screen. Populate it to restrict a
       branch user to their own branch. */
    locationIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'companyLocation', default: [] },

    /* Optional per-account overrides on top of the role's permissions.
       Names come from lib/rbac.js PERMISSIONS. */
    allow: { type: [String], default: [] },
    deny: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.user ||
  mongoose.model('user', UserSchema, 'user');
