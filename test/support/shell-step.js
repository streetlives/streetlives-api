/**
 * Runs a workflow step's real `run:` script under bash, with stub `aws` and
 * `curl` binaries ahead of the PATH.
 *
 * The security-group lifecycle is the highest-consequence thing in this
 * pipeline - getting the revoke wrong leaves the production database open to an
 * address - and asserting on the text of the YAML does not exercise any of it.
 * This runs the script the runner would run and records what it called.
 */

// The stub scripts below are bash, not JS: ${...} in them is shell expansion.
/* eslint-disable no-template-curly-in-string */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Stateful enough to be worth trusting: revoked rules stop coming back from
// describe, so a step that re-checks its own cleanup sees a real answer.
// DESCRIBE_FAILS makes every lookup fail; DESCRIBE_FAILS_FIRST fails the first
// N; DESCRIBE_FAILS_AFTER fails everything past the Nth; DESCRIBE_VISIBLE_AFTER
// hides the rules from the first N lookups, the way EC2's eventual consistency
// does. REVOKE_NOOP makes revoke report success without removing anything.
const AWS_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "aws $*" >> "$CALLS_LOG"',
  'revoked="${CALLS_LOG}.revoked"',
  'attempts="${CALLS_LOG}.describes"',
  'case "$1 $2" in',
  '  "ec2 authorize-security-group-ingress")',
  '    printf \'%s\\n\' "${AUTHORIZE_OUTPUT-sgr-0000000000000000a}" ;;',
  '  "ec2 describe-security-group-rules")',
  '    n=$(( $(cat "$attempts" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$attempts"',
  '    if [ -n "${DESCRIBE_FAILS:-}" ] || [ "$n" -le "${DESCRIBE_FAILS_FIRST:-0}" ] \\',
  '       || { [ -n "${DESCRIBE_FAILS_AFTER:-}" ] && [ "$n" -gt "$DESCRIBE_FAILS_AFTER" ]; }; then',
  '      echo "AccessDeniedException" >&2; exit 255',
  '    fi',
  '    if [ "$n" -le "${DESCRIBE_VISIBLE_AFTER:-0}" ]; then printf \'None\\n\'; exit 0; fi',
  '    out=""',
  '    for id in ${DESCRIBE_OUTPUT-None}; do',
  '      grep -qx "$id" "$revoked" 2>/dev/null && continue',
  '      if [ -z "$out" ]; then out="$id"; else out="$out$(printf \'\\t\')$id"; fi',
  '    done',
  '    printf \'%s\\n\' "${out:-None}" ;;',
  '  "ec2 revoke-security-group-ingress")',
  '    if [ -z "${REVOKE_NOOP:-}" ]; then',
  '      for arg in "$@"; do case "$arg" in sgr-*) echo "$arg" >> "$revoked" ;; esac; done',
  '    fi',
  '    printf \'True\\n\' ;;',
  '  *) echo "unexpected aws call: $*" >&2; exit 9 ;;',
  'esac',
  '',
].join('\n');

const ZERO_SHA = '0000000000000000000000000000000000000000';

const GIT_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "git $*" >> "$CALLS_LOG"',
  'case "$1 $2" in',
  `  "rev-parse HEAD") printf '%s\\n' "\${HEAD_SHA-${ZERO_SHA}}" ;;`,
  `  "rev-parse FETCH_HEAD") printf '%s\\n' "\${TIP_SHA-${ZERO_SHA}}" ;;`,
  '  fetch*) exit 0 ;;',
  '  *) echo "unexpected git call: $*" >&2; exit 9 ;;',
  'esac',
  '',
].join('\n');

// So a retry loop's backoff does not cost the test suite real seconds.
const SLEEP_STUB = ['#!/bin/bash', 'exit 0', ''].join('\n');

// A smoke check asks for `-w %{http_code}` and reads the code off stdout, so
// the stub has to answer with one - exiting 0 while printing nothing would look
// like an unreachable API. CURL_HTTP_CODE is what it reports; every other
// caller (the checkip lookup in db-migrate) gets the old silent behaviour.
const CURL_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "curl $*" >> "$CALLS_LOG"',
  'case "$*" in',
  '  *http_code*) printf \'%s\' "${CURL_HTTP_CODE:-200}" ;;',
  'esac',
  'exit ${CURL_STATUS:-0}',
  '',
].join('\n');

let counter = 0;
const uniqueName = (prefix) => {
  counter += 1;
  return `${prefix}-${counter}`;
};

/**
 * @param {object} step a parsed workflow/action step with a `run:` script
 * @returns {function(object): object} call it with env overrides; returns the
 *   spawn result plus `calls` (the stubbed commands, in order) and `outputs`
 *   (whatever the script appended to $GITHUB_OUTPUT)
 */
const runnerFor = (step) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gha-step-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'aws'), AWS_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), CURL_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sleep'), SLEEP_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'git'), GIT_STUB, { mode: 0o755 });

  const script = path.join(dir, 'step.sh');
  fs.writeFileSync(script, step.run);

  return (env = {}) => {
    const callsLog = path.join(dir, uniqueName('calls'));
    const outputs = path.join(dir, uniqueName('outputs'));
    fs.writeFileSync(callsLog, '');
    fs.writeFileSync(outputs, '');

    const result = spawnSync('bash', [script], {
      cwd: dir,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: `${bin}:${process.env.PATH}`,
        CALLS_LOG: callsLog,
        GITHUB_OUTPUT: outputs,
      }, env),
    });

    return Object.assign({}, result, {
      calls: fs.readFileSync(callsLog, 'utf8').split('\n').filter(Boolean),
      outputs: fs.readFileSync(outputs, 'utf8'),
    });
  };
};

module.exports = { runnerFor };
