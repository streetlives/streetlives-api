/**
 * Runs monitoring/deploy.sh for real under bash, with a stub `aws` ahead of the PATH.
 *
 * The script's job is to refuse a deploy whose alarms would watch nothing - an alarm on the
 * wrong ApiName/Stage never fires, so a wrong target means production silently has no
 * alarm. These tests check that every unconfirmable target stops it before
 * `cloudformation deploy`.
 */

// The stub is bash, not JS: ${...} in it is shell expansion.
/* eslint-disable no-template-curly-in-string */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../monitoring/deploy.sh');
const TEMPLATE = path.resolve(__dirname, '../../monitoring/alarms.yaml');

// REST_APIS is the account's APIs as "name=id" pairs. NO_STAGE lists ids without a prod
// stage. METRIC_<ApiName> is what get-metric-statistics prints for that API (default one
// datapoint of 100). METRICS_FAIL makes the metric query fail as an AWS error would.
const AWS_STUB = [
  '#!/bin/bash',
  'printf \'%s\\n\' "aws $*" >> "$CALLS_LOG"',
  'arg_after() { local want=$1; shift; while [ $# -gt 0 ]; do',
  '  if [ "$1" = "$want" ]; then printf \'%s\' "$2"; return; fi; shift; done; }',
  'case "$1 $2" in',
  '  "apigateway get-rest-apis")',
  '    q=$(arg_after --query "$@"); name=${q#*==\\\'}; name=${name%%\\\'*}',
  '    ids=""',
  '    for pair in ${REST_APIS-}; do',
  '      [ "${pair%%=*}" = "$name" ] || continue',
  '      if [ -z "$ids" ]; then ids=${pair#*=}; else ids="$ids$(printf \'\\t\')${pair#*=}"; fi',
  '    done',
  '    printf \'%s\\n\' "$ids" ;;',
  '  "apigateway get-stage")',
  '    id=$(arg_after --rest-api-id "$@")',
  '    for missing in ${NO_STAGE-}; do',
  '      if [ "$missing" = "$id" ]; then echo "NotFoundException" >&2; exit 254; fi',
  '    done',
  '    echo "{}" ;;',
  '  "cloudwatch get-metric-statistics")',
  '    if [ -n "${METRICS_FAIL:-}" ]; then echo "AccessDeniedException" >&2; exit 255; fi',
  '    dims=$(arg_after --dimensions "$@"); name=${dims#Name=ApiName,Value=}',
  '    var="METRIC_$name"',
  '    printf \'%s\\n\' "${!var-100.0}" ;;',
  '  "cloudformation validate-template"|"cloudformation deploy") echo "{}" ;;',
  '  *) echo "unexpected aws call: $*" >&2; exit 9 ;;',
  'esac',
  '',
].join('\n');

const PUBLIC = 'StreetlivesPublicApi=rdxk79h7wa';
const HEALTHY_APIS = `${PUBLIC} StreetlivesInternalApi=czmlz2z6h3 Other=abc1234567`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitoring-deploy-'));
const bin = path.join(dir, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'aws'), AWS_STUB, { mode: 0o755 });

let counter = 0;
const run = (env = {}, args = []) => {
  counter += 1;
  const callsLog = path.join(dir, `calls-${counter}`);
  fs.writeFileSync(callsLog, '');
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      PATH: `${bin}:${process.env.PATH}`,
      CALLS_LOG: callsLog,
      REST_APIS: HEALTHY_APIS,
    }, env),
  });
  return Object.assign({}, result, {
    calls: fs.readFileSync(callsLog, 'utf8').split('\n').filter(Boolean),
  });
};

const deployed = result => result.calls.some(call => call.startsWith('aws cloudformation deploy'));

describe('monitoring/deploy.sh', () => {
  it('deploys to us-east-1 when every target checks out', () => {
    const result = run();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const deploy = result.calls.find(call => call.startsWith('aws cloudformation deploy'));
    expect(deploy).toContain('--region us-east-1');
    expect(deploy).toContain('--stack-name streetlives-monitoring');
    expect(deploy).toContain(`--template-file ${TEMPLATE}`);
  });

  it('checks without deploying under --check-only', () => {
    const result = run({}, ['--check-only']);

    expect(result.status).toBe(0);
    expect(result.calls.some(call => call.includes('validate-template'))).toBe(true);
    expect(deployed(result)).toBe(false);
  });

  it('queries the prod stage metric of each API by its exact ApiName, in us-east-1', () => {
    const result = run({}, ['--check-only']);
    const metricCalls = result.calls.filter(call => call.includes('get-metric-statistics'));

    expect(metricCalls).toHaveLength(2);
    ['StreetlivesPublicApi', 'StreetlivesInternalApi'].forEach((name, i) => {
      expect(metricCalls[i])
        .toContain(`--dimensions Name=ApiName,Value=${name} Name=Stage,Value=prod`);
      expect(metricCalls[i]).toContain('--region us-east-1');
      expect(metricCalls[i]).toContain('--namespace AWS/ApiGateway --metric-name Count');
    });
  });

  it('refuses an ApiName that no longer exists (renamed or retired API)', () => {
    const result = run({ REST_APIS: PUBLIC });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('StreetlivesInternalApi should belong only to czmlz2z6h3');
    expect(deployed(result)).toBe(false);
  });

  it('refuses an ApiName shared by two APIs, whose metrics would be mixed', () => {
    const result = run({ REST_APIS: `${HEALTHY_APIS} StreetlivesInternalApi=zzzzzzzzzz` });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('resolves to: czmlz2z6h3');
    expect(deployed(result)).toBe(false);
  });

  it('refuses an ApiName that now belongs to a different API', () => {
    const result = run({ REST_APIS: `${PUBLIC} StreetlivesInternalApi=zzzzzzzzzz` });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('resolves to: zzzzzzzzzz');
    expect(deployed(result)).toBe(false);
  });

  it('refuses an API without a prod stage', () => {
    const result = run({ NO_STAGE: 'czmlz2z6h3' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('StreetlivesInternalApi (czmlz2z6h3) has no prod stage');
    expect(deployed(result)).toBe(false);
  });

  it('refuses an API with no datapoints at all', () => {
    const result = run({ METRIC_StreetlivesPublicApi: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('StreetlivesPublicApi (rdxk79h7wa) has no prod requests');
    expect(deployed(result)).toBe(false);
  });

  it('refuses an API whose datapoints are all zero', () => {
    const result = run({ METRIC_StreetlivesInternalApi: '0.0\t0.0' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('StreetlivesInternalApi (czmlz2z6h3) has no prod requests');
    expect(deployed(result)).toBe(false);
  });

  it('adds up several daily datapoints', () => {
    const result = run({ METRIC_StreetlivesPublicApi: '10.0\t20.0\t30.0' }, ['--check-only']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('StreetlivesPublicApi is rdxk79h7wa, prod handled 60 requests');
  });

  it('stops on an AWS error instead of reading it as an answer', () => {
    const result = run({ METRICS_FAIL: '1' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AccessDeniedException');
    expect(deployed(result)).toBe(false);
  });

  it('refuses a template that alarms an API the script does not check', () => {
    const drifted = path.join(dir, 'drifted.yaml');
    fs.writeFileSync(drifted, fs.readFileSync(TEMPLATE, 'utf8')
      .replace(/Value: StreetlivesInternalApi/g, 'Value: SomeNewApi'));

    const result = run({ ALARMS_TEMPLATE: drifted });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("don't match TARGETS");
    expect(result.calls).toHaveLength(0);
  });
});
