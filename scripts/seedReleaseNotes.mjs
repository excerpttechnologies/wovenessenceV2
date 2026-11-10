/* Seeds the first release note.

   Run with:
     npm run seed:releases

   WHAT IS SEEDED, AND WHY ONLY THIS

   Version 1.0.0 describes the work that actually shipped with this change:
   the Frequently Visited Pages section, the three header quick actions, the
   dashboard announcement and the administrative Release Notes screen. Nothing
   from before this release is claimed, and no fix is listed that was not made.

   IDEMPOTENT. If 1.0.0 already exists the script leaves it alone - an
   administrator may have edited the wording since it was first published, and
   re-running a seed must not overwrite that work. If it does not exist, it is
   created as the latest release only when no published release already holds
   that flag. */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Release from '@/models/Release';

const VERSION = '1.0.0';

const RELEASE = {
  version: VERSION,
  title: 'Faster navigation and release notes',
  description:
    'A shorter path to the documents an operator creates every day, a sidebar '
    + 'that remembers the screens each account uses most, and a dashboard '
    + 'announcement that tells the team what changed.',
  releaseDate: new Date('2026-11-10T00:00:00.000Z'),
  status: 'published',

  features: [
    {
      module: 'Sidebar',
      text: 'Added Frequently Visited Pages below Dashboard, ranked per user and business by visit count and last visit.',
    },
    {
      module: 'Header',
      text: 'Added Create New POS, Create DC and Create GRC quick actions beside the brand, using the existing Add routes.',
    },
    {
      module: 'Dashboard',
      text: 'Added a latest-release announcement with feature, fix, security and improvement counts, plus a full release history dialog.',
    },
    {
      module: 'Settings',
      text: 'Added an administrator-only Release Notes screen to create, preview, publish, edit and delete releases.',
    },
  ],

  fixes: [],

  security: [
    {
      module: 'Release notes',
      text: 'Release writes require the existing administrative permission; drafts are readable by administrators only.',
    },
    {
      module: 'Frequently Visited Pages',
      text: 'Visits are recorded for the signed-in account and checked against the role screen permissions for the selected business.',
    },
  ],

  improvements: [
    {
      module: 'Sidebar',
      text: 'Frequently Visited Pages ignores the dashboard, login, logout, error pages and detail URLs, so a shortcut always points at its menu page.',
    },
    {
      module: 'Header',
      text: 'Quick actions follow the selected company, location and financial year, and stay compact on narrow screens.',
    },
    {
      module: 'Dashboard',
      text: 'The release panel can be dismissed per user and reopened from a compact What\'s new bar; a new release announces itself again.',
    },
    {
      module: 'Permissions',
      text: 'The Release Notes menu item is hidden from non-administrator roles in both the sidebar and the permission matrix.',
    },
  ],
};

async function main() {
  await dbConnect();

  const existing = await Release.findOne({ version: VERSION }).lean();
  if (existing) {
    console.log(`Release v${VERSION} already exists; left unchanged.`);
    return;
  }

  const publishedExists = await Release.exists({ status: 'published' });
  const makeLatest = !publishedExists;

  const created = await Release.create({
    ...RELEASE,
    isLatest: makeLatest,
    createdBy: 'seed',
    updatedBy: 'seed',
  });

  if (makeLatest) {
    await Release.updateMany(
      { _id: { $ne: created._id } },
      { $set: { isLatest: false } }
    );
  }

  console.log(
    `Created release v${created.version}: ${created.title}`
    + (makeLatest ? ' (latest)' : '')
  );
}

main()
  .catch((err) => {
    console.error('Release seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
