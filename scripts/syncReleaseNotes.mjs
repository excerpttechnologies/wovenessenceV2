/* Turns the commits that reached the server into a release note.

   Run with:
     npm run releases:sync              (dry run - prints what it would write)
     npm run releases:sync:apply        (writes the release and announces it)

   WHY THIS EXISTS

   The Release Notes screen is a writer, not a recorder: somebody has to type
   the changes. Every deployment then needs the same list written out by hand,
   and the dashboard keeps announcing whichever version was last typed in - the
   v1.0.0 panel stays up for weeks while the code moves on.

   This script closes that gap. It reads `git log`, groups each commit into
   Features / Fixes / Security / Improvements by its conventional prefix, names
   the module from the scope, and creates one published release carrying the
   commits since the last synchronised one.

   HOW MUCH HISTORY IS READ

   Each release created here stores the commit it was synchronised to
   (`gitHead`). The next run reads `<gitHead>..HEAD`, so a change is listed
   once and only once. A release that was typed by hand has no `gitHead`; the
   walk then starts at the first commit of its release day, so nothing before
   that release is re-claimed.

   VERSIONING

   The version is bumped from the newest release: a commit with a feat or
   security prefix bumps the minor, anything else bumps the patch. Pass
   `--version 1.4.0` to name it yourself.

   NOTHING IS WRITTEN WITHOUT --apply, the same convention as the migration
   scripts in this folder.
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Release from '@/models/Release';

const FIELD = '\u001f';
const RECORD = '\u001e';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const versionArg = valueOf('--version');
const titleArg = valueOf('--title');
const limitArg = Number.parseInt(valueOf('--limit') || '', 10);

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function git(commandArgs) {
  return execFileSync('git', commandArgs, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function headSha() {
  try {
    return git(['rev-parse', 'HEAD']).trim();
  } catch {
    throw new Error('This folder is not a git checkout, so there is no history to read.');
  }
}

/* One commit per record: sha, short sha, author, ISO date, subject, body. */
export function readCommits(range) {
  const format = ['%H', '%h', '%an', '%aI', '%s', '%b'].join('%x1f') + '%x1e';
  const out = git(['log', '--no-merges', `--pretty=format:${format}`, range]);
  return out
    .split(RECORD)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, shortSha, author, date, subject, body] = chunk.split(FIELD);
      return { sha, shortSha, author, date, subject: subject || '', body: body || '' };
    });
}

const CATEGORY_BY_PREFIX = {
  feat: 'features',
  feature: 'features',
  fix: 'fixes',
  bugfix: 'fixes',
  hotfix: 'fixes',
  security: 'security',
  sec: 'security',
  perf: 'improvements',
  refactor: 'improvements',
  style: 'improvements',
  docs: 'improvements',
  chore: 'improvements',
  test: 'improvements',
  tests: 'improvements',
  build: 'improvements',
  ci: 'improvements',
  revert: 'improvements',
};

const PREFIX_RE = /^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

function cleanModule(scope) {
  if (!scope) return 'General';
  return scope
    .replace(/[-_/]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80) || 'General';
}

export function classify(commit) {
  const subject = String(commit.subject || '').trim();

  /* Merge commits and the release notes written by this script are not changes
     an operator should read about. */
  if (/^merge\b/i.test(subject)) return null;
  if (/^release v\d/i.test(subject)) return null;
  if (/^chore\(release\)/i.test(subject)) return null;

  const match = PREFIX_RE.exec(subject);
  if (match) {
    const category = CATEGORY_BY_PREFIX[match[1].toLowerCase()];
    if (category) {
      return {
        category,
        entry: {
          module: cleanModule(match[2]),
          text: sentence(match[3]),
        },
      };
    }
  }

  return {
    category: 'improvements',
    entry: { module: 'General', text: sentence(subject) },
  };
}

function sentence(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

export function bumpVersion(base, { minor }) {
  const parts = String(base || '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (minor) {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  return parts.slice(0, 3).join('.');
}

/* Where the walk starts. A synchronised release knows its commit; a hand-typed
   one only knows its date, so that day's first commit is the boundary. */
async function startPoint(latest) {
  if (!latest) return { range: 'HEAD', from: 'the first commit' };

  if (latest.gitHead) {
    try {
      git(['cat-file', '-e', `${latest.gitHead}^{commit}`]);
      return {
        range: `${latest.gitHead}..HEAD`,
        from: `v${latest.version} (${String(latest.gitHead).slice(0, 7)})`,
      };
    } catch {
      /* The recorded commit is gone - a rebase, or a fresh clone that does not
         reach that far. Fall back to the release date rather than failing. */
    }
  }

  const since = latest.releaseDate ? new Date(latest.releaseDate) : new Date();
  const iso = new Date(since.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    range: `--since=${iso} HEAD`,
    from: `v${latest.version} (${since.toISOString().slice(0, 10)})`,
  };
}

async function main() {
  await dbConnect();

  const latest = await Release.findOne({ status: 'published' })
    .sort({ releaseDate: -1, createdAt: -1 })
    .lean();

  const { range, from } = await startPoint(latest);
  let commits = readCommits(range);
  if (Number.isFinite(limitArg) && limitArg > 0) commits = commits.slice(0, limitArg);

  const buckets = { features: [], fixes: [], security: [], improvements: [] };
  const seen = new Set();

  commits.forEach((commit) => {
    const classified = classify(commit);
    if (!classified || !classified.entry.text) return;
    const key = classified.entry.module.toLowerCase() + '\u0000' + classified.entry.text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    buckets[classified.category].push(classified.entry);
  });

  const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0);

  if (!total) {
    console.log(`No commits to list since ${from}. Nothing written.`);
    return;
  }

  const version = versionArg
    ? String(versionArg).trim().replace(/^v/i, '')
    : bumpVersion(latest?.version, { minor: buckets.features.length + buckets.security.length > 0 });

  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    throw new Error(`"${version}" is not a version such as 1.1.0.`);
  }

  if (await Release.exists({ version })) {
    throw new Error(`A release with version ${version} already exists. Pass --version to name this one differently.`);
  }

  const newest = commits[0];
  const title = titleArg
    || `${total} change${total === 1 ? '' : 's'} since ${latest ? 'v' + latest.version : 'the start'}`;

  const doc = {
    version,
    title: title.slice(0, 240),
    description: [
      `Features: ${buckets.features.length}`,
      `Fixes: ${buckets.fixes.length}`,
      `Security: ${buckets.security.length}`,
      `Improvements: ${buckets.improvements.length}`,
    ].join(' · '),
    releaseDate: newest?.date ? new Date(newest.date) : new Date(),
    status: 'published',
    isLatest: true,
    gitHead: headSha(),
    ...buckets,
  };

  console.log(`\nRelease v${version} — ${doc.title}`);
  console.log(`Walked ${range} (from ${from}); ${commits.length} commit(s), ${total} change(s).\n`);
  Object.entries(buckets).forEach(([category, entries]) => {
    if (!entries.length) return;
    console.log(`  ${category}:`);
    entries.forEach((entry) => console.log(`    ${entry.module}: ${entry.text}`));
  });
  console.log(`\nNewest commit: ${newest?.shortSha} ${newest?.subject}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to publish this release and announce it on the dashboard.');
    return;
  }

  const created = await Release.create({ ...doc, createdBy: 'release-sync', updatedBy: 'release-sync' });

  await Release.updateMany(
    { _id: { $ne: created._id } },
    { $set: { isLatest: false } }
  );

  console.log(`\nPublished v${created.version} and announced it as the latest release.`);
}

/* Only run when executed directly - the helpers above are importable so the
   classification can be checked without a database. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error('Release sync failed:', err?.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
