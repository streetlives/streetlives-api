// Approves and merges bot-authored dependency PRs that pass the policy in
// dependency-update-policy.js and have green CI.
//
// Runs from the default branch via workflow_run, so it must never check out or
// execute PR code -- everything here goes through the REST API.
//
// The decision logic is exported and injected with its `api` function so the
// privileged path is covered by test/unit/dependency-auto-merge.test.js; the
// bottom of this file is only the command-line entry point.
//
// Environment (set by dependency-auto-merge.yml):
//   PR_NUMBERS       comma-separated PR numbers to evaluate
//   BASE_BRANCHES    JSON array of base branches a PR may target
//   REQUIRED_CHECKS  JSON array of check-run names that must have succeeded
//   ALLOWED_UPDATES  JSON map of dependency-type -> allowed semver bumps
//   MERGE_METHOD     squash | merge | rebase

/* eslint-disable no-console */
const { appendFileSync } = require('fs');

const {
  classifyDependabot,
  classifySnyk,
  evaluateChecks,
} = require('./dependency-update-policy');

const DEPENDABOT = 'dependabot[bot]';
const SNYK = 'snyk-bot';
const BOT_AUTHORS = [DEPENDABOT, SNYK];
const BLOCKING_LABELS = ['do-not-merge', 'no-auto-merge'];
const PAGE_SIZE = 100;
// The compare endpoint caps its file list at 300 and says nothing about it. A
// dependency update changes two files, so anywhere near the cap is not one.
const MAX_FILES = 300;

function createApi(token) {
  return async function api(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = (body && body.message) || text;
      throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${message}`);
    }
    return body;
  };
}

// A full page back means there may be more, and a guard that silently saw only
// part of the evidence is no guard at all.
function whole(items, what) {
  if (items.length >= PAGE_SIZE) {
    throw new Error(`more than ${PAGE_SIZE} ${what}; refusing to judge a partial list`);
  }
  return items;
}

/**
 * `commit.author.login` is resolved from the commit's author email, which anyone
 * with push access can set to the bot's, so attribution alone proves nothing. The
 * signature is the proof: commits GitHub creates for Dependabot are signed with a
 * key no contributor holds.
 *
 * This is not belt-and-braces. `package.json` is on the changed-file allowlist and
 * carries the `scripts` CI executes, so an unsigned commit that the allowlist
 * waves through could both run arbitrary code and replace the checks that were
 * supposed to catch it. Snyk does not sign its commits, which is why Snyk PRs stop
 * here rather than merging unattended -- see the note in dependency-auto-merge.yml.
 */
function verifyProvenance(commits, author) {
  const foreign = commits.filter(
    commit => !commit.author || commit.author.login !== author
      || !commit.committer || commit.committer.login !== author,
  );
  if (foreign.length) {
    return `${foreign.length} commit(s) not attributed to \`${author}\``;
  }
  const unsigned = commits.filter(
    commit => !commit.commit.verification || commit.commit.verification.verified !== true,
  );
  if (unsigned.length) {
    return `${unsigned.length} commit(s) carry no verified signature, so the author `
      + 'cannot be trusted over spoofable commit metadata';
  }
  return null;
}

/**
 * Decides one PR and, if it qualifies, approves and merges it.
 *
 * @returns `{ outcome: 'merged' | 'skipped', reason }`.
 */
async function evaluatePullRequest(number, { api, repo, config }) {
  const {
    baseBranches = [],
    requiredChecks = [],
    allowedUpdates = {},
    mergeMethod = 'squash',
  } = config;

  const skip = reason => ({ outcome: 'skipped', reason });

  const pr = await api(`/repos/${repo}/pulls/${number}`);

  if (pr.state !== 'open') return skip('not open');
  if (pr.draft) return skip('draft');
  if (!pr.head.repo || pr.head.repo.full_name !== repo) return skip('head is a fork');
  if (baseBranches.indexOf(pr.base.ref) === -1) {
    return skip(`targets \`${pr.base.ref}\`, not ${baseBranches.join(' or ')}`);
  }

  // Unlike commit metadata, the PR author is whoever authenticated to open it.
  const author = pr.user.login;
  if (BOT_AUTHORS.indexOf(author) === -1) {
    return skip(`author \`${author}\` is not a dependency bot`);
  }

  const blocking = pr.labels
    .map(label => label.name)
    .filter(name => BLOCKING_LABELS.indexOf(name) !== -1);
  if (blocking.length) return skip(`carries the \`${blocking[0]}\` label`);

  // Read the commits and the diff from an immutable base...head comparison, not
  // from the PR's mutable ref. Asking the PR for its commits would let a writer
  // swap the branch to a clean head for the duration of the inspection and then
  // restore the original one, and the merge below -- pinned to the head SHA read
  // above -- would happily take the restored commit.
  const comparison = await api(
    `/repos/${repo}/compare/${pr.base.sha}...${pr.head.sha}?per_page=${PAGE_SIZE}`,
  );
  const commits = comparison.commits;
  if (comparison.total_commits > commits.length) {
    throw new Error(`only ${commits.length} of ${comparison.total_commits} commits were `
      + 'listed; refusing to judge a partial list');
  }
  if (comparison.files.length >= MAX_FILES) {
    throw new Error(`${comparison.files.length} changed files; refusing to judge a partial list`);
  }

  const impostor = verifyProvenance(commits, author);
  if (impostor) return skip(impostor);

  const changedFiles = comparison.files.map(file => file.filename);

  const classification = author === DEPENDABOT
    ? classifyDependabot(
      commits.map(commit => commit.commit.message),
      changedFiles,
      allowedUpdates,
    )
    : classifySnyk({ title: pr.title, branch: pr.head.ref, changedFiles });
  if (!classification.safe) {
    return skip(`not a safe update -- ${classification.reason}`);
  }

  const reviews = whole(
    await api(`/repos/${repo}/pulls/${number}/reviews?per_page=${PAGE_SIZE}`),
    'reviews',
  );
  const latestByReviewer = new Map();
  reviews.forEach((review) => {
    if (review.state === 'COMMENTED') return;
    latestByReviewer.set(review.user.login, review.state);
  });
  const objector = [...latestByReviewer].find(([, state]) => state === 'CHANGES_REQUESTED');
  if (objector) return skip(`\`${objector[0]}\` requested changes`);

  const { check_runs: checkRuns, total_count: checkCount } = await api(
    `/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=${PAGE_SIZE}`,
  );
  const combinedStatus = await api(`/repos/${repo}/commits/${pr.head.sha}/status`);
  const checks = evaluateChecks(checkRuns, checkCount, combinedStatus, requiredChecks);
  if (!checks.ok) return skip(checks.reason);

  if (pr.mergeable === false) return skip('has merge conflicts');

  // Everything above was judged against pr.head.sha. The `sha` parameter on the
  // merge call is what makes that binding authoritative, but checking here turns a
  // branch that moved during inspection into a legible skip instead of a 409.
  const current = await api(`/repos/${repo}/pulls/${number}`);
  if (current.head.sha !== pr.head.sha) {
    return skip(`head moved from \`${pr.head.sha.slice(0, 8)}\` to `
      + `\`${current.head.sha.slice(0, 8)}\` during inspection`);
  }

  if (latestByReviewer.get('github-actions[bot]') !== 'APPROVED') {
    await api(`/repos/${repo}/pulls/${number}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        event: 'APPROVE',
        commit_id: pr.head.sha,
        body: [
          'Auto-approved: safe dependency update with green CI.',
          '',
          `- Update: ${classification.reason}`,
          `- Files: ${changedFiles.map(file => `\`${file}\``).join(', ')}`,
          `- Verified checks: ${requiredChecks.map(name => `\`${name}\``).join(', ')}`,
          '',
          'To stop this merging, request changes or add a `do-not-merge` label.',
        ].join('\n'),
      }),
    });
  }

  await api(`/repos/${repo}/pulls/${number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: mergeMethod,
      // Guards against a push landing between the check verification and here.
      sha: pr.head.sha,
      commit_title: `${pr.title} (#${number})`,
    }),
  });

  return { outcome: 'merged', reason: classification.reason };
}

async function run({
  api, repo, config, prNumbers, log = console,
}) {
  const results = [];
  for (const number of prNumbers) {
    try {
      const result = await evaluatePullRequest(number, { api, repo, config });
      results.push({ number, ...result });
      log.log(`PR #${number}: ${result.outcome} -- ${result.reason}`);
    } catch (error) {
      results.push({ number, outcome: 'errored', reason: error.message });
      log.error(error.stack);
    }
  }
  return results;
}

async function main() {
  const prNumbers = (process.env.PR_NUMBERS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(Number);

  if (prNumbers.length === 0) console.log('No pull requests to evaluate.');

  const results = await run({
    api: createApi(process.env.GITHUB_TOKEN),
    repo: process.env.GITHUB_REPOSITORY,
    prNumbers,
    config: {
      baseBranches: JSON.parse(process.env.BASE_BRANCHES || '[]'),
      requiredChecks: JSON.parse(process.env.REQUIRED_CHECKS || '[]'),
      allowedUpdates: JSON.parse(process.env.ALLOWED_UPDATES || '{}'),
      mergeMethod: process.env.MERGE_METHOD || 'squash',
    },
  });

  if (results.some(result => result.outcome === 'errored')) {
    process.exitCode = 1;
  }

  const merged = results.filter(result => result.outcome === 'merged').length;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `merged=${merged}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY && results.length) {
    const lines = results.map(
      result => `- **#${result.number}**: ${result.outcome} -- ${result.reason}`,
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Dependency auto-merge\n\n${lines.join('\n')}\n`,
    );
  }
}

module.exports = {
  createApi,
  evaluatePullRequest,
  run,
  verifyProvenance,
  DEPENDABOT,
  SNYK,
};

if (require.main === module) {
  main();
}
