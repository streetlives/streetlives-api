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
  classifyLockfile,
  classifyManifestChange,
  classifySnyk,
  evaluateChecks,
} = require('./dependency-update-policy');

const DEPENDABOT = 'dependabot[bot]';
const SNYK = 'snyk-bot';
const BOT_AUTHORS = [DEPENDABOT, SNYK];
const BLOCKING_LABELS = ['do-not-merge', 'no-auto-merge'];
// GitHub commits on a bot's behalf as `web-flow`, the identity whose key signs
// server-side commits. See verifyProvenance.
const ACCEPTED_COMMITTERS = ['web-flow'];
const PAGE_SIZE = 100;
// The compare endpoint caps its file list at 300 and says nothing about it. A
// dependency update changes two files, so anywhere near the cap is not one.
const MAX_FILES = 300;
// The raw media type reads a file's bytes at a given ref, and unlike the JSON
// contents response it is not capped at 1MB -- package-lock.json is bigger.
const RAW = 'application/vnd.github.raw';
const MANIFEST = /(^|\/)package\.json$/;
const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/;

function createApi(token) {
  return async function api(path, options = {}) {
    const accept = options.accept || 'application/vnd.github+json';
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        accept,
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const text = await response.text();
    if (response.ok && accept === RAW) return text;
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = (body && body.message) || text;
      const error = new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${message}`);
      error.status = response.status;
      throw error;
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
 * signature is the proof: Dependabot's commits are created server-side and signed
 * with GitHub's key, which no contributor holds.
 *
 * That is also why the committer is `web-flow` rather than the bot -- GitHub
 * commits on its behalf, and `web-flow` is the identity that does it. A commit
 * committed by anyone else was pushed from a workstation and is not Dependabot's.
 *
 * This is not belt-and-braces. `package.json` is on the changed-file allowlist and
 * carries the `scripts` CI executes, so an unsigned commit that the allowlist
 * waves through could both run arbitrary code and replace the checks that were
 * supposed to catch it. Snyk does not sign its commits, which is why Snyk PRs stop
 * here rather than merging unattended -- see the note in dependency-auto-merge.yml.
 */
function verifyProvenance(commits, author) {
  const misattributed = commits.filter(
    commit => !commit.author || commit.author.login !== author,
  );
  if (misattributed.length) {
    return `${misattributed.length} commit(s) not authored by \`${author}\``;
  }
  const pushed = commits.filter(
    commit => !commit.committer || ACCEPTED_COMMITTERS.indexOf(commit.committer.login) === -1,
  );
  if (pushed.length) {
    const who = pushed.map(commit => (commit.committer ? commit.committer.login : 'nobody'));
    return `${pushed.length} commit(s) committed by ${who.join(', ')}, not GitHub`;
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

async function readJson(path, ref, { api, repo }) {
  try {
    return JSON.parse(await api(`/repos/${repo}/contents/${path}?ref=${ref}`, { accept: RAW }));
  } catch (error) {
    // A manifest that does not exist on the base side is a new file; an empty
    // object compares correctly against it.
    if (error.status === 404) return {};
    throw error;
  }
}

/**
 * Reads both sides of every manifest the PR touches, and the lockfiles it leaves
 * behind, all bound to the SHAs already being judged.
 */
async function classifyFileContents(changedFiles, pr, { api, repo }) {
  for (const path of changedFiles.filter(file => MANIFEST.test(file))) {
    const before = await readJson(path, pr.base.sha, { api, repo });
    const after = await readJson(path, pr.head.sha, { api, repo });
    const verdict = classifyManifestChange(before, after);
    if (!verdict.safe) return { safe: false, reason: `${path} ${verdict.reason}` };
  }

  for (const path of changedFiles.filter(file => LOCKFILE.test(file))) {
    const lockfile = await readJson(path, pr.head.sha, { api, repo });
    const verdict = classifyLockfile(lockfile);
    if (!verdict.safe) return { safe: false, reason: `${path} ${verdict.reason}` };
  }

  return { safe: true };
}

/**
 * Everything about a PR that can change while it is being inspected: its target,
 * its labels, its state, its head. Applied to the snapshot the decision is based
 * on and again to a fresh one just before mutating, because the merge call's `sha`
 * parameter binds the commit and nothing else -- retargeting the PR or labelling it
 * `do-not-merge` mid-flight would otherwise sail straight through.
 *
 * @returns a reason to stop, or null.
 */
function pullRequestStateProblem(pr, { repo, baseBranches }) {
  if (pr.state !== 'open') return 'not open';
  if (pr.draft) return 'draft';
  if (!pr.head.repo || pr.head.repo.full_name !== repo) return 'head is a fork';
  if (baseBranches.indexOf(pr.base.ref) === -1) {
    return `targets \`${pr.base.ref}\`, not ${baseBranches.join(' or ')}`;
  }
  // Unlike commit metadata, the PR author is whoever authenticated to open it.
  if (BOT_AUTHORS.indexOf(pr.user.login) === -1) {
    return `author \`${pr.user.login}\` is not a dependency bot`;
  }
  const blocking = pr.labels
    .map(label => label.name)
    .filter(name => BLOCKING_LABELS.indexOf(name) !== -1);
  if (blocking.length) return `carries the \`${blocking[0]}\` label`;
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
  const problem = pullRequestStateProblem(pr, { repo, baseBranches });
  if (problem) return skip(problem);
  const author = pr.user.login;

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

  // The filename allowlist says the PR only touched manifests and lockfiles. This
  // says what it did inside them -- which is the difference between trusting the
  // commit's own account of itself and reading the change.
  const contents = await classifyFileContents(changedFiles, pr, { api, repo });
  if (!contents.safe) {
    return skip(`not a safe update -- ${contents.reason}`);
  }

  const { check_runs: checkRuns, total_count: checkCount } = await api(
    `/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=${PAGE_SIZE}`,
  );
  const combinedStatus = await api(`/repos/${repo}/commits/${pr.head.sha}/status`);
  const checks = evaluateChecks(checkRuns, checkCount, combinedStatus, requiredChecks);
  if (!checks.ok) return skip(checks.reason);

  if (pr.mergeable === false) return skip('has merge conflicts');

  // Re-read the PR and apply the same gates to the fresh copy: the decision so far
  // rests on a snapshot, and a retarget or a `do-not-merge` label added since would
  // otherwise be invisible here.
  const current = await api(`/repos/${repo}/pulls/${number}`);
  const changed = pullRequestStateProblem(current, { repo, baseBranches });
  if (changed) return skip(`${changed} (changed during inspection)`);
  if (current.head.sha !== pr.head.sha) {
    return skip(`head moved from \`${pr.head.sha.slice(0, 8)}\` to `
      + `\`${current.head.sha.slice(0, 8)}\` during inspection`);
  }

  // Read last, so a maintainer's objection is the most recent thing seen before
  // anything is mutated.
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
  pullRequestStateProblem,
  evaluatePullRequest,
  run,
  verifyProvenance,
  DEPENDABOT,
  SNYK,
};

if (require.main === module) {
  main();
}
