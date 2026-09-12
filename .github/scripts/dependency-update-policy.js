// Classifies a bot-authored dependency PR as safe to merge automatically or not.
//
// Kept free of network calls and dependencies so it can be unit-tested directly
// (test/unit/dependency-update-policy.test.js) and required by the workflow
// script with no install step.

// Files a dependency update is allowed to touch. Anything else -- source, config,
// and in particular `.github/workflows`, which Dependabot's github-actions
// ecosystem rewrites -- means the PR waits for a human.
const DEPENDENCY_FILE = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock)$/;

const MANIFEST_FILE = /(^|\/)package\.json$/;

// Conclusions that are fine on a bot PR: the Codex reviewer skips bot authors
// entirely, which surfaces as a skipped run rather than a success.
const PASSING_CONCLUSIONS = ['success', 'skipped', 'neutral'];

/**
 * The load-bearing guard: whatever the commit metadata claims, a PR that edits
 * anything but a manifest or a lockfile is not a dependency update.
 */
function classifyChangedFiles(paths) {
  if (paths.length === 0) {
    return { safe: false, reason: 'changes no files' };
  }
  const outside = paths.filter(path => !DEPENDENCY_FILE.test(path));
  if (outside.length) {
    const shown = outside.slice(0, 3).map(path => `\`${path}\``).join(', ');
    const rest = outside.length > 3 ? ` (+${outside.length - 3} more)` : '';
    return { safe: false, reason: `touches ${shown}${rest} outside the dependency manifests` };
  }
  return { safe: true, manifestsTouched: paths.some(path => MANIFEST_FILE.test(path)) };
}

// Dependabot records what it changed in a trailer on its own commit:
//
//   updated-dependencies:
//   - dependency-name: express
//     dependency-version: 4.17.3
//     dependency-type: direct:production
//     update-type: version-update:semver-patch
//
// Parsed by hand rather than with a YAML dependency -- the shape is fixed.
function parseDependabotMetadata(message) {
  const entries = [];
  const block = message.split(/^updated-dependencies:\s*$/m)[1];
  if (!block) return entries;

  let current = null;
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimRight();
    if (line === '') continue;

    const started = line.match(/^-\s*dependency-name:\s*(\S+)/);
    if (started) {
      // Scoped names arrive quoted -- `"@vitest/mocker"` -- because `@` is a
      // reserved YAML indicator.
      current = { name: started[1].replace(/^["']|["']$/g, '') };
      entries.push(current);
      continue;
    }

    // The trailer ends with YAML's "..." marker; anything else that is neither a
    // list item nor an indented field means the block is over.
    if (!/^\s/.test(line)) break;
    if (!current) continue;

    const dependencyType = line.match(/^\s+dependency-type:\s*(\S+)/);
    if (dependencyType) current.dependencyType = dependencyType[1];
    const updateType = line.match(/^\s+update-type:\s*(\S+)/);
    if (updateType) current.updateType = updateType[1];
  }
  return entries;
}

// Security updates omit `update-type`, so the version range has to come from the
// prose above the trailer: "Bumps [express](...) from 4.16.2 to 4.17.3." for a
// lone dependency, "Updates `express` from 4.16.2 to 4.17.3" inside a group.
function parseVersionRanges(message) {
  const ranges = new Map();
  const patterns = [
    /^Bumps \[?([^\]\s]+?)\]?(?:\([^)]*\))? from (\S+) to (\S+?)\.?$/gm,
    /^Updates `([^`]+)` from (\S+) to (\S+?)\.?$/gm,
  ];
  patterns.forEach((pattern) => {
    let match = pattern.exec(message);
    while (match !== null) {
      const [, name, from, to] = match;
      if (!ranges.has(name)) ranges.set(name, { from, to });
      match = pattern.exec(message);
    }
  });
  return ranges;
}

// A security update that bumps an ancestor can drop a transitive dependency as a
// side effect, which Dependabot announces as "Removes `@vitest/mocker`" and leaves
// with an empty `dependency-version`. Nothing is being added, so a removal has no
// bump to size -- but it is only read as one when the prose says so, never merely
// because a version is missing.
function parseRemovals(message) {
  const removals = new Set();
  const pattern = /^Removes `([^`]+)`/gm;
  let match = pattern.exec(message);
  while (match !== null) {
    removals.add(match[1]);
    match = pattern.exec(message);
  }
  return removals;
}

const SEVERITY = { patch: 0, minor: 1, major: 2 };

/**
 * Sized the way a caret range is, not the way the version string reads. Below
 * 1.0.0 the leading zeros are not a version, they are a disclaimer: `^0.34.4`
 * does not accept 0.35.0, and `^0.0.3` accepts nothing at all. So a move in the
 * first significant component is a major, whatever its position.
 */
function semverBump(from, to) {
  const parse = (version) => {
    const match = String(version).match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const before = parse(from);
  const after = parse(to);
  if (!before || !after) return null;

  if (after[0] !== before[0]) return 'major';
  if (before[0] === 0) {
    if (after[1] !== before[1]) return 'major';
    if (before[1] === 0) return after[2] === before[2] ? 'patch' : 'major';
  }
  if (after[1] !== before[1]) return 'minor';
  return 'patch';
}

/** The more severe of two sizings, so neither source can soften the other. */
function worse(left, right) {
  if (!left) return right;
  if (!right) return left;
  return SEVERITY[left] >= SEVERITY[right] ? left : right;
}

/**
 * @param messages commit messages on the PR. Order only decides which duplicate
 *   wins, and duplicates describe the same bump.
 * @param changedFiles every path the PR touches.
 * @param allowedUpdates map of Dependabot `dependency-type` to the semver bumps
 *   that may merge without a human, e.g. `{ 'direct:production': ['patch'] }`.
 */
function classifyDependabot(messages, changedFiles, allowedUpdates) {
  const files = classifyChangedFiles(changedFiles);
  if (!files.safe) return files;

  const entries = [];
  const ranges = new Map();
  const removals = new Set();
  messages.forEach((message) => {
    entries.push(...parseDependabotMetadata(message));
    parseVersionRanges(message).forEach((range, name) => {
      if (!ranges.has(name)) ranges.set(name, range);
    });
    parseRemovals(message).forEach(name => removals.add(name));
  });
  if (entries.length === 0) {
    return { safe: false, reason: 'no `updated-dependencies` metadata on the commits' };
  }

  const described = [];
  for (const entry of entries) {
    const dependencyType = entry.dependencyType || 'unknown';

    if (removals.has(entry.name)) {
      // Only transitive removals. Dropping something the manifest asks for
      // directly is a change of intent, not a dependency update.
      if (dependencyType !== 'indirect') {
        return {
          safe: false,
          reason: `\`${entry.name}\` is being removed `
            + `(${dependencyType}; only indirect removals qualify)`,
        };
      }
      described.push(`${entry.name} removed`);
      continue;
    }

    const range = ranges.get(entry.name);
    // Dependabot's own label and the actual version range are both taken, and the
    // harsher wins: it labels 0.34.4 -> 0.35.4 a minor, which a caret range treats
    // as breaking.
    const declared = entry.updateType
      ? entry.updateType.replace('version-update:semver-', '')
      : null;
    const bump = worse(declared, range && semverBump(range.from, range.to));
    if (!bump) {
      return { safe: false, reason: `could not determine the size of the \`${entry.name}\` bump` };
    }

    const allowed = allowedUpdates[dependencyType];
    if (!allowed) {
      return {
        safe: false,
        reason: `\`${entry.name}\` has unconfigured dependency-type \`${dependencyType}\``,
      };
    }
    if (allowed.indexOf(bump) === -1) {
      return {
        safe: false,
        reason: `\`${entry.name}\` is a ${bump} bump `
          + `(${dependencyType}; allowed: ${allowed.join(', ')})`,
      };
    }
    described.push(`${entry.name} ${bump}${range ? ` (${range.from} -> ${range.to})` : ''}`);
  }
  return { safe: true, reason: described.join(', ') };
}

/**
 * Snyk carries no machine-readable metadata, so the branch name, the title and
 * the changed files are all there is to go on.
 */
function classifySnyk({ title, branch, changedFiles }) {
  if (!/^snyk-(fix|upgrade)-/.test(branch)) {
    return { safe: false, reason: `unrecognised Snyk branch \`${branch}\`` };
  }

  const files = classifyChangedFiles(changedFiles);
  if (!files.safe) return files;

  // "[Snyk] Fix for 3 vulnerabilities" claims to rewrite only the lockfile,
  // within the ranges the manifest already allows. Take the claim from the diff
  // rather than the title: a manifest edit under this title could carry any bump
  // at all, and the title would never say so.
  if (/fix for \d+ vulnerabilit/i.test(title)) {
    return files.manifestsTouched
      ? { safe: false, reason: 'titled as a lockfile fix but edits `package.json`' }
      : { safe: true, reason: 'lockfile-only vulnerability fix' };
  }

  const upgrade = title.match(/upgrade\s+(\S+)\s+from\s+(\S+)\s+to\s+(\S+)/i);
  if (!upgrade) {
    return { safe: false, reason: `could not parse a version range out of "${title}"` };
  }
  const [, name, from, to] = upgrade;
  const bump = semverBump(from, to);
  if (!bump) {
    return { safe: false, reason: `could not compare \`${from}\` to \`${to}\`` };
  }
  if (bump === 'major') {
    return { safe: false, reason: `\`${name}\` crosses a major version (${from} -> ${to})` };
  }
  return { safe: true, reason: `\`${name}\` security ${bump} (${from} -> ${to})` };
}

/**
 * @param checkRuns the `check_runs` array for the head commit.
 * @param totalCount the API's `total_count`, to catch a truncated page.
 * @param combinedStatus the commit-status rollup (`{ state, total_count }`).
 * @param requiredChecks names that must be present and successful.
 */
function evaluateChecks(checkRuns, totalCount, combinedStatus, requiredChecks) {
  if (totalCount > checkRuns.length) {
    return {
      ok: false,
      reason: `only ${checkRuns.length} of ${totalCount} check runs were listed`,
    };
  }

  const byName = new Map(checkRuns.map(run => [run.name, run]));
  for (const name of requiredChecks) {
    const run = byName.get(name);
    if (!run) return { ok: false, reason: `required check \`${name}\` has not reported` };
    if (run.status !== 'completed') {
      return { ok: false, reason: `\`${name}\` is still ${run.status}` };
    }
    if (run.conclusion !== 'success') {
      return { ok: false, reason: `\`${name}\` concluded \`${run.conclusion}\`` };
    }
  }

  const failed = checkRuns.filter(
    run => run.status === 'completed' && PASSING_CONCLUSIONS.indexOf(run.conclusion) === -1,
  );
  if (failed.length) {
    return {
      ok: false,
      reason: `failing checks: ${failed.map(run => `\`${run.name}\``).join(', ')}`,
    };
  }

  const pending = checkRuns.filter(run => run.status !== 'completed');
  if (pending.length) {
    return {
      ok: false,
      reason: `still running: ${pending.map(run => `\`${run.name}\``).join(', ')}`,
    };
  }

  if (combinedStatus.total_count > 0 && combinedStatus.state !== 'success') {
    return { ok: false, reason: `commit status is \`${combinedStatus.state}\`` };
  }
  return { ok: true };
}


// Keys a dependency update may differ in. `scripts` is pointedly not among them:
// CI runs those, so a manifest edit that reached them could replace the very
// checks that are supposed to vet it.
const DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
  'resolutions',
];

// Where a package may come from. An alias (`npm:`), a git or file or http source
// -- anything carrying a scheme -- is a different package, not a new version of
// this one, so a version has to read like a version.
const VERSION_RANGE = /^[^:]*\d[^:]*$/;

// The host is what matters: a different host is someone else's tarball. Legacy
// lockfile entries still carry `http://`, which npm upgrades on rewrite, so the
// scheme is not what this is guarding.
const REGISTRY_ORIGIN = /^https?:\/\/registry\.npmjs\.org\//;

/**
 * Compares the manifest either side of the change. The filename allowlist says a
 * PR only touched `package.json`; this says what it did inside it.
 *
 * @param before parsed `package.json` at the base commit.
 * @param after parsed `package.json` at the head commit.
 */
function classifyManifestChange(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changedOutside = [...keys].filter(
    key => DEPENDENCY_KEYS.indexOf(key) === -1
      && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  if (changedOutside.length) {
    return {
      safe: false,
      reason: `changes \`${changedOutside.join('`, `')}\` in package.json, `
        + 'which is not a dependency map',
    };
  }

  for (const key of DEPENDENCY_KEYS) {
    const from = before[key] || {};
    const to = after[key] || {};
    for (const [name, range] of Object.entries(to)) {
      if (from[name] === range) continue;
      if (typeof range !== 'string' || !VERSION_RANGE.test(range)) {
        return {
          safe: false,
          reason: `points \`${name}\` at \`${range}\`, which is not a plain version range`,
        };
      }
    }
  }
  return { safe: true };
}

/**
 * Every package the lockfile names must come from the registry. A forged lockfile
 * that kept its version numbers honest could still redirect a package at an
 * arbitrary tarball, and nothing downstream would notice.
 *
 * @param lockfile parsed `package-lock.json` at the head commit.
 */
function classifyLockfile(lockfile) {
  const entries = Object.entries(lockfile.packages || lockfile.dependencies || {});
  const offRegistry = entries.filter(
    ([, entry]) => entry && entry.resolved && !REGISTRY_ORIGIN.test(entry.resolved),
  );
  if (offRegistry.length) {
    const [name, entry] = offRegistry[0];
    return {
      safe: false,
      reason: `resolves \`${name || 'the root package'}\` from \`${entry.resolved}\`, `
        + 'not the npm registry',
    };
  }
  return { safe: true };
}

module.exports = {
  classifyChangedFiles,
  classifyLockfile,
  classifyManifestChange,
  parseRemovals,
  classifyDependabot,
  classifySnyk,
  evaluateChecks,
  parseDependabotMetadata,
  parseVersionRanges,
  semverBump,
};
