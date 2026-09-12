const {
  classifyChangedFiles,
  classifyDependabot,
  classifySnyk,
  evaluateChecks,
  parseDependabotMetadata,
  parseVersionRanges,
  semverBump,
} = require('../../.github/scripts/dependency-update-policy');

const DEPENDENCY_FILES = ['package.json', 'package-lock.json'];

const ALLOWED = {
  'direct:production': ['patch'],
  'direct:development': ['patch', 'minor'],
  indirect: ['patch', 'minor'],
};

// Shaped after streetlives/yourpeer.nyc#643: a security update, which is the
// case that carries no `update-type`.
const SECURITY_UPDATE = `Bump express from 4.16.2 to 4.16.4

Bumps [express](https://github.com/expressjs/express) from 4.16.2 to 4.16.4.
- [Release notes](https://github.com/expressjs/express/releases)

---
updated-dependencies:
- dependency-name: express
  dependency-version: 4.16.4
  dependency-type: direct:production
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const VERSION_UPDATE = `Bump eslint from 4.19.1 to 4.19.2

Bumps [eslint](https://github.com/eslint/eslint) from 4.19.1 to 4.19.2.

---
updated-dependencies:
- dependency-name: eslint
  dependency-type: direct:development
  update-type: version-update:semver-patch
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const MAJOR_UPDATE = `Bump sequelize from 4.32.2 to 6.29.0

Bumps [sequelize](https://github.com/sequelize/sequelize) from 4.32.2 to 6.29.0.

---
updated-dependencies:
- dependency-name: sequelize
  dependency-type: direct:production
  update-type: version-update:semver-major
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const GROUPED_UPDATE = `Bump the dev-dependencies group with 2 updates

Bumps the dev-dependencies group with 2 updates: [jest](https://github.com/facebook/jest)
and [nodemon](https://github.com/remy/nodemon).

Updates \`jest\` from 24.8.0 to 24.9.0
Updates \`nodemon\` from 1.18.0 to 1.18.11

---
updated-dependencies:
- dependency-name: jest
  dependency-type: direct:development
  update-type: version-update:semver-minor
  dependency-group: dev-dependencies
- dependency-name: nodemon
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-dependencies
...

Signed-off-by: dependabot[bot] <support@github.com>`;

describe('semverBump', () => {
  it('classifies each level of change', () => {
    expect(semverBump('1.2.3', '2.0.0')).toBe('major');
    expect(semverBump('1.2.3', '1.3.0')).toBe('minor');
    expect(semverBump('1.2.3', '1.2.4')).toBe('patch');
    expect(semverBump('15.5.9', '15.5.19')).toBe('patch');
  });

  it('tolerates version prefixes and returns null for unparseable input', () => {
    expect(semverBump('v1.2.3', 'v1.2.4')).toBe('patch');
    expect(semverBump('1.2.3', 'next')).toBeNull();
  });
});

describe('parseDependabotMetadata', () => {
  it('reads the trailer terminated by the YAML end marker', () => {
    expect(parseDependabotMetadata(VERSION_UPDATE)).toEqual([
      {
        name: 'eslint',
        dependencyType: 'direct:development',
        updateType: 'version-update:semver-patch',
      },
    ]);
  });

  it('reads every entry of a grouped update', () => {
    expect(parseDependabotMetadata(GROUPED_UPDATE).map(entry => entry.name))
      .toEqual(['jest', 'nodemon']);
  });

  it('returns nothing for a commit with no trailer', () => {
    expect(parseDependabotMetadata('Fix the thing\n\nNo metadata here.')).toEqual([]);
  });
});

describe('parseVersionRanges', () => {
  it('reads the single-dependency prose', () => {
    expect(parseVersionRanges(SECURITY_UPDATE).get('express'))
      .toEqual({ from: '4.16.2', to: '4.16.4' });
  });

  it('reads the grouped prose', () => {
    const ranges = parseVersionRanges(GROUPED_UPDATE);
    expect(ranges.get('jest')).toEqual({ from: '24.8.0', to: '24.9.0' });
    expect(ranges.get('nodemon')).toEqual({ from: '1.18.0', to: '1.18.11' });
  });
});

describe('classifyDependabot', () => {
  it('allows a patch bump of a dev dependency', () => {
    expect(classifyDependabot([VERSION_UPDATE], DEPENDENCY_FILES, ALLOWED).safe).toBe(true);
  });

  it('allows a security update that omits update-type', () => {
    const result = classifyDependabot([SECURITY_UPDATE], DEPENDENCY_FILES, ALLOWED);
    expect(result.safe).toBe(true);
    expect(result.reason).toContain('4.16.2 -> 4.16.4');
  });

  it('refuses a major bump', () => {
    const result = classifyDependabot([MAJOR_UPDATE], DEPENDENCY_FILES, ALLOWED);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('major');
  });

  it('refuses a minor bump of a production dependency', () => {
    const minorProduction = VERSION_UPDATE
      .replace('direct:development', 'direct:production')
      .replace('semver-patch', 'semver-minor');
    expect(classifyDependabot([minorProduction], DEPENDENCY_FILES, ALLOWED).safe).toBe(false);
  });

  it('allows a group only when every member is within policy', () => {
    expect(classifyDependabot([GROUPED_UPDATE], DEPENDENCY_FILES, ALLOWED).safe).toBe(true);
    const both = [GROUPED_UPDATE, MAJOR_UPDATE];
    expect(classifyDependabot(both, DEPENDENCY_FILES, ALLOWED).safe).toBe(false);
  });

  it('refuses a commit with no Dependabot metadata', () => {
    const result = classifyDependabot(['Drop the auth check'], DEPENDENCY_FILES, ALLOWED);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('no `updated-dependencies` metadata');
  });

  it('refuses an unconfigured dependency type', () => {
    const odd = VERSION_UPDATE.replace('direct:development', 'direct:mystery');
    expect(classifyDependabot([odd], DEPENDENCY_FILES, ALLOWED).safe).toBe(false);
  });
});

describe('classifySnyk', () => {
  it('allows a lockfile-only fix', () => {
    expect(classifySnyk({
      title: '[Snyk] Fix for 3 vulnerabilities',
      branch: 'snyk-fix-abc123',
      changedFiles: ['package-lock.json'],
    }).safe).toBe(true);
  });

  it('allows a same-major security upgrade', () => {
    expect(classifySnyk({
      title: '[Snyk] Security upgrade axios from 1.6.0 to 1.7.4',
      branch: 'snyk-upgrade-abc123',
      changedFiles: DEPENDENCY_FILES,
    }).safe).toBe(true);
  });

  it('refuses a major upgrade', () => {
    // Verbatim from streetlives-web#249.
    const result = classifySnyk({
      title: '[Snyk] Security upgrade aws-amplify from 4.3.21 to 5.0.24',
      branch: 'snyk-upgrade-abc123',
      changedFiles: DEPENDENCY_FILES,
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('major');
  });

  it("refuses a branch that is not Snyk's", () => {
    expect(classifySnyk({
      title: '[Snyk] Fix for 1 vulnerabilities',
      branch: 'feature/sneaky',
      changedFiles: ['package-lock.json'],
    }).safe).toBe(false);
  });
});

describe('classifyChangedFiles', () => {
  it('allows manifests and lockfiles, at the root or nested', () => {
    const result = classifyChangedFiles(['package.json', 'package-lock.json']);
    expect(result.safe).toBe(true);
    expect(result.manifestsTouched).toBe(true);
  });

  it('reports when only the lockfile moved', () => {
    expect(classifyChangedFiles(['package-lock.json']).manifestsTouched).toBe(false);
  });

  it("refuses a workflow edit, which is what Dependabot's github-actions updates are", () => {
    const result = classifyChangedFiles(['.github/workflows/ci.yml']);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('outside the dependency manifests');
  });

  it('refuses a source file smuggled in beside a real bump', () => {
    expect(classifyChangedFiles([
      'package.json',
      'package-lock.json',
      'src/middleware/auth.js',
    ]).safe).toBe(false);
  });

  it('refuses a migration, which a dependency bump never needs', () => {
    expect(classifyChangedFiles([
      'package-lock.json',
      'sequelize/migrations/20260101000000-drop-a-column.js',
    ]).safe).toBe(false);
  });

  it('refuses an empty diff', () => {
    expect(classifyChangedFiles([]).safe).toBe(false);
  });
});

describe('classifyDependabot file guard', () => {
  it('refuses a patch bump that also rewrites a workflow', () => {
    const result = classifyDependabot(
      [VERSION_UPDATE],
      ['package.json', '.github/workflows/ci.yml'],
      ALLOWED,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('outside the dependency manifests');
  });
});

describe('classifySnyk file guard', () => {
  it("refuses a 'lockfile fix' that edits the manifest", () => {
    const result = classifySnyk({
      title: '[Snyk] Fix for 2 vulnerabilities',
      branch: 'snyk-fix-abc123',
      changedFiles: ['package.json', 'package-lock.json'],
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('edits `package.json`');
  });

  it('refuses a Snyk PR that touches source', () => {
    expect(classifySnyk({
      title: '[Snyk] Security upgrade axios from 1.6.0 to 1.7.4',
      branch: 'snyk-upgrade-abc123',
      changedFiles: ['package.json', 'src/index.js'],
    }).safe).toBe(false);
  });
});

describe('evaluateChecks', () => {
  const passing = name => ({ name, status: 'completed', conclusion: 'success' });
  const noStatuses = { state: 'pending', total_count: 0 };

  it('passes when every required check succeeded', () => {
    const runs = [passing('test')];
    expect(evaluateChecks(runs, runs.length, noStatuses, ['test']).ok).toBe(true);
  });

  it('treats a skipped run as acceptable, which is how bot PRs leave codex', () => {
    const runs = [
      passing('test'),
      { name: 'codex_auto_approve', status: 'completed', conclusion: 'skipped' },
    ];
    expect(evaluateChecks(runs, runs.length, noStatuses, ['test']).ok).toBe(true);
  });

  it('refuses when a required check never reported', () => {
    const runs = [passing('codex_auto_approve')];
    const result = evaluateChecks(runs, runs.length, noStatuses, ['test']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('test');
  });

  it('refuses while a check is still running', () => {
    const runs = [{ name: 'test', status: 'in_progress', conclusion: null }];
    expect(evaluateChecks(runs, runs.length, noStatuses, ['test']).ok).toBe(false);
  });

  it('refuses when an unrequired check failed', () => {
    const runs = [passing('test'), { name: 'audit', status: 'completed', conclusion: 'failure' }];
    expect(evaluateChecks(runs, runs.length, noStatuses, ['test']).ok).toBe(false);
  });

  it('refuses on a failing commit status, which is how Snyk reports', () => {
    const runs = [passing('test')];
    const statuses = { state: 'failure', total_count: 2 };
    const result = evaluateChecks(runs, runs.length, statuses, ['test']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('commit status');
  });

  it('refuses a truncated page rather than judging part of the evidence', () => {
    const runs = [passing('test')];
    const result = evaluateChecks(runs, 120, noStatuses, ['test']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('120');
  });
});
