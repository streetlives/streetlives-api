// Approves and merges bot-authored dependency PRs that pass the policy in
// dependency-update-policy.js and have green CI.
//
// Runs from the default branch via workflow_run, so it must never check out or
// execute PR code -- everything here goes through the REST API.
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

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const mergeMethod = process.env.MERGE_METHOD || 'squash';
const baseBranches = JSON.parse(process.env.BASE_BRANCHES || '[]');
const requiredChecks = JSON.parse(process.env.REQUIRED_CHECKS || '[]');
const allowedUpdates = JSON.parse(process.env.ALLOWED_UPDATES || '{}');
const prNumbers = (process.env.PR_NUMBERS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
  .map(Number);

const DEPENDABOT = 'dependabot[bot]';
const SNYK = 'snyk-bot';
const BOT_AUTHORS = [DEPENDABOT, SNYK];
const BLOCKING_LABELS = ['do-not-merge', 'no-auto-merge'];
const PAGE_SIZE = 100;

const summary = [];
let mergedCount = 0;

async function api(path, options = {}) {
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
}

function record(number, outcome, reason) {
  summary.push(`- **#${number}**: ${outcome} -- ${reason}`);
  console.log(`PR #${number}: ${outcome} -- ${reason}`);
}

function skip(number, reason) {
  record(number, 'skipped', reason);
  return false;
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
 * with push access can set to the bot's. Dependabot signs every commit, so for it
 * the signature is the real proof. Snyk does not sign, so its PRs rest on the
 * authenticated PR author plus the changed-file allowlist in the policy module.
 */
function verifyProvenance(commits, author) {
  const foreign = commits.filter(
    commit => !commit.author || commit.author.login !== author
      || !commit.committer || commit.committer.login !== author,
  );
  if (foreign.length) {
    return `${foreign.length} commit(s) not attributed to \`${author}\``;
  }
  if (author === DEPENDABOT) {
    const unsigned = commits.filter(
      commit => !commit.commit.verification || commit.commit.verification.verified !== true,
    );
    if (unsigned.length) {
      return `${unsigned.length} commit(s) without a valid Dependabot signature`;
    }
  }
  return null;
}

async function evaluate(number) {
  const pr = await api(`/repos/${repo}/pulls/${number}`);

  if (pr.state !== 'open') return skip(number, 'not open');
  if (pr.draft) return skip(number, 'draft');
  if (!pr.head.repo || pr.head.repo.full_name !== repo) return skip(number, 'head is a fork');
  if (baseBranches.indexOf(pr.base.ref) === -1) {
    return skip(number, `targets \`${pr.base.ref}\`, not ${baseBranches.join(' or ')}`);
  }

  // Unlike commit metadata, the PR author is whoever authenticated to open it.
  const author = pr.user.login;
  if (BOT_AUTHORS.indexOf(author) === -1) {
    return skip(number, `author \`${author}\` is not a dependency bot`);
  }

  const blocking = pr.labels
    .map(label => label.name)
    .filter(name => BLOCKING_LABELS.indexOf(name) !== -1);
  if (blocking.length) return skip(number, `carries the \`${blocking[0]}\` label`);

  const commits = whole(
    await api(`/repos/${repo}/pulls/${number}/commits?per_page=${PAGE_SIZE}`),
    'commits',
  );
  const impostor = verifyProvenance(commits, author);
  if (impostor) return skip(number, impostor);

  const changedFiles = whole(
    await api(`/repos/${repo}/pulls/${number}/files?per_page=${PAGE_SIZE}`),
    'changed files',
  ).map(file => file.filename);

  const classification = author === DEPENDABOT
    ? classifyDependabot(
      commits.map(commit => commit.commit.message),
      changedFiles,
      allowedUpdates,
    )
    : classifySnyk({ title: pr.title, branch: pr.head.ref, changedFiles });
  if (!classification.safe) {
    return skip(number, `not a safe update -- ${classification.reason}`);
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
  if (objector) return skip(number, `\`${objector[0]}\` requested changes`);

  const { check_runs: checkRuns, total_count: checkCount } = await api(
    `/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=${PAGE_SIZE}`,
  );
  const combinedStatus = await api(`/repos/${repo}/commits/${pr.head.sha}/status`);
  const checks = evaluateChecks(checkRuns, checkCount, combinedStatus, requiredChecks);
  if (!checks.ok) return skip(number, checks.reason);

  if (pr.mergeable === false) return skip(number, 'has merge conflicts');

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

  mergedCount += 1;
  record(number, 'merged', classification.reason);
  return true;
}

async function main() {
  if (prNumbers.length === 0) console.log('No pull requests to evaluate.');

  for (const number of prNumbers) {
    try {
      await evaluate(number);
    } catch (error) {
      record(number, 'errored', error.message);
      console.error(error.stack);
      process.exitCode = 1;
    }
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `merged=${mergedCount}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY && summary.length) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Dependency auto-merge\n\n${summary.join('\n')}\n`,
    );
  }
}

main();
