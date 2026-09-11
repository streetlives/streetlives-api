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

const AWS_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "aws $*" >> "$CALLS_LOG"',
  'case "$1 $2" in',
  '  "ec2 authorize-security-group-ingress")',
  '    printf \'%s\\n\' "${AUTHORIZE_OUTPUT-sgr-0000000000000000a}" ;;',
  '  "ec2 describe-security-group-rules")',
  '    if [ -n "${DESCRIBE_FAILS:-}" ]; then echo "AccessDeniedException" >&2; exit 255; fi',
  '    printf \'%s\\n\' "${DESCRIBE_OUTPUT-None}" ;;',
  '  "ec2 revoke-security-group-ingress")',
  '    printf \'True\\n\' ;;',
  '  *) echo "unexpected aws call: $*" >&2; exit 9 ;;',
  'esac',
  '',
].join('\n');

// So a retry loop's backoff does not cost the test suite real seconds.
const SLEEP_STUB = ['#!/bin/bash', 'exit 0', ''].join('\n');

const CURL_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "curl $*" >> "$CALLS_LOG"',
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
