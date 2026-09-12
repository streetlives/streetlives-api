// Covers the privileged path: what the auto-merge job will and will not approve
// and merge. `api` is injected, so these tests exercise the real decision logic
// without touching GitHub.
const {
  evaluatePullRequest,
  run,
  verifyProvenance,
} = require('../../.github/scripts/dependency-auto-merge');

const REPO = 'streetlives/streetlives-api';
const HEAD_SHA = 'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeee';

const CONFIG = {
  baseBranches: ['develop'],
  requiredChecks: ['test'],
  allowedUpdates: {
    'direct:production': ['patch'],
    'direct:development': ['patch', 'minor'],
    indirect: ['patch', 'minor'],
  },
  mergeMethod: 'squash',
};

const DEPENDABOT_COMMIT_MESSAGE = `Bump express from 4.16.2 to 4.16.4

Bumps [express](https://github.com/expressjs/express) from 4.16.2 to 4.16.4.

---
updated-dependencies:
- dependency-name: express
  dependency-version: 4.16.4
  dependency-type: direct:production
  update-type: version-update:semver-patch
...

Signed-off-by: dependabot[bot] <support@github.com>`;

function botCommit(author = 'dependabot[bot]', { verified = true } = {}) {
  return {
    sha: HEAD_SHA,
    author: { login: author },
    committer: { login: author },
    commit: {
      message: DEPENDABOT_COMMIT_MESSAGE,
      verification: { verified, reason: verified ? 'valid' : 'unsigned' },
    },
  };
}

const passingCheck = name => ({ name, status: 'completed', conclusion: 'success' });

function basePr() {
  return {
    number: 225,
    title: 'Bump express from 4.16.2 to 4.16.4',
    state: 'open',
    draft: false,
    mergeable: true,
    user: { login: 'dependabot[bot]' },
    base: { ref: 'develop' },
    head: {
      ref: 'dependabot/npm_and_yarn/express-4.16.4',
      sha: HEAD_SHA,
      repo: { full_name: REPO },
    },
    labels: [],
  };
}

function fixture(overrides = {}) {
  return {
    pr: basePr(),
    commits: [botCommit()],
    files: [{ filename: 'package.json' }, { filename: 'package-lock.json' }],
    reviews: [],
    checkRuns: [passingCheck('test')],
    checkCount: undefined,
    status: { state: 'success', total_count: 2 },
    ...overrides,
  };
}

function makeApi(state) {
  const calls = [];
  const api = async (path, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ method, path, body: options.body ? JSON.parse(options.body) : undefined });

    if (method === 'PUT' && path.endsWith('/merge')) return { merged: true };
    if (method === 'POST' && path.endsWith('/reviews')) return { id: 1 };
    if (path.endsWith(`/pulls/${state.pr.number}`)) return state.pr;
    if (path.indexOf('/commits?') !== -1) return state.commits;
    if (path.indexOf('/files?') !== -1) return state.files;
    if (path.indexOf('/reviews?') !== -1) return state.reviews;
    if (path.indexOf('/check-runs') !== -1) {
      return {
        check_runs: state.checkRuns,
        total_count: state.checkCount === undefined ? state.checkRuns.length : state.checkCount,
      };
    }
    if (path.endsWith('/status')) return state.status;
    throw new Error(`unexpected request: ${method} ${path}`);
  };
  return { api, calls };
}

async function decide(overrides = {}) {
  const state = fixture(overrides);
  const { api, calls } = makeApi(state);
  const result = await evaluatePullRequest(state.pr.number, { api, repo: REPO, config: CONFIG });
  return { result, calls, mutations: calls.filter(call => call.method !== 'GET') };
}

async function expectRefusal(overrides, pattern) {
  const { result, mutations } = await decide(overrides);
  expect(result.outcome).toBe('skipped');
  expect(result.reason).toMatch(pattern);
  expect(mutations).toEqual([]);
}

describe('evaluatePullRequest', () => {
  it('approves and then merges a signed patch bump with green CI', async () => {
    const { result, mutations } = await decide();

    expect(result.outcome).toBe('merged');
    expect(mutations.map(call => call.method)).toEqual(['POST', 'PUT']);

    const [approval, merge] = mutations;
    expect(approval.path).toBe(`/repos/${REPO}/pulls/225/reviews`);
    expect(approval.body).toMatchObject({ event: 'APPROVE', commit_id: HEAD_SHA });
    // Pinning the merge to the SHA we verified is what stops a push landing in
    // between from riding along.
    expect(merge.body).toMatchObject({ sha: HEAD_SHA, merge_method: 'squash' });
  });

  it('does not approve twice when it already approved this head', async () => {
    const { result, mutations } = await decide({
      reviews: [{ user: { login: 'github-actions[bot]' }, state: 'APPROVED' }],
    });

    expect(result.outcome).toBe('merged');
    expect(mutations.map(call => call.method)).toEqual(['PUT']);
  });

  describe('refuses without mutating anything', () => {
    it('an unsigned commit, even when attributed to the bot', async () => {
      // The case that keeps Snyk out: package.json is on the allowed-file list
      // and carries the scripts CI runs, so an unsigned commit could replace the
      // very checks that were supposed to vet it.
      await expectRefusal(
        { commits: [botCommit('dependabot[bot]', { verified: false })] },
        /no verified signature/,
      );
    });

    it('a commit attributed to someone other than the PR author', async () => {
      await expectRefusal(
        { commits: [botCommit(), botCommit('shakilhossain1')] },
        /not attributed to/,
      );
    });

    it('a Snyk PR, because Snyk does not sign its commits', async () => {
      const pr = basePr();
      pr.title = '[Snyk] Fix for 3 vulnerabilities';
      pr.user = { login: 'snyk-bot' };
      pr.head = { ref: 'snyk-fix-abc123', sha: HEAD_SHA, repo: { full_name: REPO } };
      await expectRefusal(
        {
          pr,
          commits: [botCommit('snyk-bot', { verified: false })],
          files: [{ filename: 'package-lock.json' }],
        },
        /no verified signature/,
      );
    });

    it('a human author', async () => {
      const pr = basePr();
      pr.user = { login: 'shakilhossain1' };
      await expectRefusal({ pr }, /not a dependency bot/);
    });

    it('a fork head', async () => {
      const pr = basePr();
      pr.head = { ref: 'x', sha: HEAD_SHA, repo: { full_name: 'someone/fork' } };
      await expectRefusal({ pr }, /fork/);
    });

    it('a base branch outside the allowlist, so nothing reaches master this way', async () => {
      const pr = basePr();
      pr.base = { ref: 'master' };
      await expectRefusal({ pr }, /targets/);
    });

    it('a draft', async () => {
      const pr = basePr();
      pr.draft = true;
      await expectRefusal({ pr }, /draft/);
    });

    it('a do-not-merge label', async () => {
      const pr = basePr();
      pr.labels = [{ name: 'do-not-merge' }];
      await expectRefusal({ pr }, /do-not-merge/);
    });

    it('a reviewer who requested changes', async () => {
      await expectRefusal(
        { reviews: [{ user: { login: 'jbeard4' }, state: 'CHANGES_REQUESTED' }] },
        /requested changes/,
      );
    });

    it('a required check that never reported', async () => {
      await expectRefusal({ checkRuns: [passingCheck('codex_auto_approve')] }, /test/);
    });

    it('a failing check', async () => {
      await expectRefusal(
        { checkRuns: [{ name: 'test', status: 'completed', conclusion: 'failure' }] },
        /failure/,
      );
    });

    it('a red commit status, which is how Snyk reports', async () => {
      await expectRefusal({ status: { state: 'failure', total_count: 2 } }, /commit status/);
    });

    it('a truncated check-run page', async () => {
      await expectRefusal({ checkCount: 120 }, /120/);
    });

    it('a diff that reaches outside the dependency manifests', async () => {
      await expectRefusal(
        { files: [{ filename: 'package.json' }, { filename: '.github/workflows/ci.yml' }] },
        /outside the dependency manifests/,
      );
    });

    it('a migration, which a dependency bump never needs', async () => {
      await expectRefusal(
        {
          files: [
            { filename: 'package-lock.json' },
            { filename: 'sequelize/migrations/20260101000000-drop.js' },
          ],
        },
        /outside the dependency manifests/,
      );
    });

    it('a major bump', async () => {
      const major = botCommit();
      major.commit.message = DEPENDABOT_COMMIT_MESSAGE.replace('semver-patch', 'semver-major');
      await expectRefusal({ commits: [major] }, /major/);
    });

    it('merge conflicts', async () => {
      const pr = basePr();
      pr.mergeable = false;
      await expectRefusal({ pr }, /conflicts/);
    });

    it('a closed pull request', async () => {
      const pr = basePr();
      pr.state = 'closed';
      await expectRefusal({ pr }, /not open/);
    });
  });

  it('throws rather than judging a full page of commits', async () => {
    const many = [];
    for (let index = 0; index < 100; index += 1) many.push(botCommit());
    const { api } = makeApi(fixture({ commits: many }));
    await expect(evaluatePullRequest(225, { api, repo: REPO, config: CONFIG }))
      .rejects.toThrow(/partial list/);
  });
});

describe('verifyProvenance', () => {
  it('accepts commits that are both attributed to the bot and signed', () => {
    expect(verifyProvenance([botCommit()], 'dependabot[bot]')).toBeNull();
  });

  it('rejects a commit whose committer differs from its author', () => {
    const mismatched = botCommit();
    mismatched.committer = { login: 'shakilhossain1' };
    expect(verifyProvenance([mismatched], 'dependabot[bot]')).toMatch(/not attributed to/);
  });
});

describe('run', () => {
  it('reports an error per pull request instead of abandoning the batch', async () => {
    const { api } = makeApi(fixture());
    const silent = { log: () => {}, error: () => {} };

    const results = await run({
      api: (path, options) => (path.endsWith('/pulls/999')
        ? Promise.reject(new Error('boom'))
        : api(path, options)),
      repo: REPO,
      config: CONFIG,
      prNumbers: [999, 225],
      log: silent,
    });

    expect(results.map(result => result.outcome)).toEqual(['errored', 'merged']);
  });
});
