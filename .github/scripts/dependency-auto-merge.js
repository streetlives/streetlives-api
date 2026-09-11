// Approves and merges bot-authored dependency PRs that pass the policy in
// dependency-update-policy.js and have green CI.
//
// Runs from the default branch via workflow_run, so it must never check out or
// execute PR code -- everything here goes through the REST API.
//
// Environment (set by dependency-auto-merge.yml):
//   PR_NUMBERS       comma-separated PR numbers to evaluate
//   REQUIRED_CHECKS  JSON array of check-run names that must have succeeded
//   ALLOWED_UPDATES  JSON map of dependency-type -> allowed semver bumps
//   MERGE_METHOD     squash | merge | rebase

/* eslint-disable no-console */
const { appendFileSync } = require('fs');

const { classifyDependabot, classifySnyk } = require('./dependency-update-policy');

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const mergeMethod = process.env.MERGE_METHOD || 'squash';
const requiredChecks = JSON.parse(process.env.REQUIRED_CHECKS || '[]');
const allowedUpdates = JSON.parse(process.env.ALLOWED_UPDATES || '{}');
const prNumbers = (process.env.PR_NUMBERS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map(Number);

const BOT_AUTHORS = ['dependabot[bot]', 'snyk-bot'];
const BLOCKING_LABELS = ['do-not-merge', 'no-auto-merge'];
// Conclusions that are fine on a bot PR: the Codex reviewer skips bot authors
// entirely, which surfaces as a skipped run rather than a success.
const PASSING_CONCLUSIONS = ['success', 'skipped', 'neutral'];

const summary = [];

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

async function checkState(headSha) {
  const { check_runs: checkRuns } = await api(
    `/repos/${repo}/commits/${headSha}/check-runs?per_page=100`,
  );
  const byName = new Map(checkRuns.map((run) => [run.name, run]));

  for (const name of requiredChecks) {
    const run = byName.get(name);
    if (!run) return { ok: false, reason: `required check \`${name}\` has not reported` };
    if (run.status !== 'completed') return { ok: false, reason: `\`${name}\` is still ${run.status}` };
    if (run.conclusion !== 'success') {
      return { ok: false, reason: `\`${name}\` concluded \`${run.conclusion}\`` };
    }
  }

  const failed = checkRuns.filter(
    (run) => run.status === 'completed' && PASSING_CONCLUSIONS.indexOf(run.conclusion) === -1,
  );
  if (failed.length) {
    return {
      ok: false,
      reason: `failing checks: ${failed.map((run) => `\`${run.name}\``).join(', ')}`,
    };
  }

  const pending = checkRuns.filter((run) => run.status !== 'completed');
  if (pending.length) {
    return {
      ok: false,
      reason: `still running: ${pending.map((run) => `\`${run.name}\``).join(', ')}`,
    };
  }

  const status = await api(`/repos/${repo}/commits/${headSha}/status`);
  if (status.total_count > 0 && status.state !== 'success') {
    return { ok: false, reason: `commit status is \`${status.state}\`` };
  }
  return { ok: true };
}

async function evaluate(number) {
  const pr = await api(`/repos/${repo}/pulls/${number}`);

  if (pr.state !== 'open') return skip(number, 'not open');
  if (pr.draft) return skip(number, 'draft');
  if (!pr.head.repo || pr.head.repo.full_name !== repo) return skip(number, 'head is a fork');

  const author = pr.user.login;
  if (BOT_AUTHORS.indexOf(author) === -1) {
    return skip(number, `author \`${author}\` is not a dependency bot`);
  }

  const blocking = pr.labels
    .map((label) => label.name)
    .filter((name) => BLOCKING_LABELS.indexOf(name) !== -1);
  if (blocking.length) return skip(number, `carries the \`${blocking[0]}\` label`);

  // Anyone with write access can push to a bot's branch. Only merge automatically
  // while every commit is still the bot's own work.
  const commits = await api(`/repos/${repo}/pulls/${number}/commits?per_page=100`);
  const foreign = commits.filter((commit) => !commit.author || commit.author.login !== author);
  if (foreign.length) {
    return skip(number, `${foreign.length} commit(s) not authored by \`${author}\``);
  }

  const classification = author === 'dependabot[bot]'
    ? classifyDependabot(commits.map((commit) => commit.commit.message), allowedUpdates)
    : classifySnyk({ title: pr.title, branch: pr.head.ref });
  if (!classification.safe) {
    return skip(number, `not a safe update -- ${classification.reason}`);
  }

  const reviews = await api(`/repos/${repo}/pulls/${number}/reviews?per_page=100`);
  const latestByReviewer = new Map();
  reviews.forEach((review) => {
    if (review.state === 'COMMENTED') return;
    latestByReviewer.set(review.user.login, review.state);
  });
  const objector = [...latestByReviewer].find(([, state]) => state === 'CHANGES_REQUESTED');
  if (objector) return skip(number, `\`${objector[0]}\` requested changes`);

  const checks = await checkState(pr.head.sha);
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
          `- Verified checks: ${requiredChecks.map((name) => `\`${name}\``).join(', ')}`,
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

  if (process.env.GITHUB_STEP_SUMMARY && summary.length) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Dependency auto-merge\n\n${summary.join('\n')}\n`,
    );
  }
}

main();
