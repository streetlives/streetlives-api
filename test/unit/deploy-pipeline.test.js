// GitHub expressions look like JS template strings but are not - they are the
// literal text of the workflow files.
/* eslint-disable no-template-curly-in-string */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { evaluate } = require('../support/github-expression');
const { runnerFor } = require('../support/shell-step');

const load = file => yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));

const prod = load('.github/workflows/deploy-prod.yml');
const stage = load('.github/workflows/deploy-test-on-develop-merge.yml');
const migrateAction = load('.github/actions/db-migrate/action.yml');
const deployAction = load('.github/actions/lambda-deploy/action.yml');

// YAML 1.1 reads a bare `on:` key as the boolean true.
const ON_KEY = true;
const triggersOf = workflow => workflow.on || workflow[ON_KEY];

// A job with no `if:` carries the implicit condition success() over its needs.
const jobRuns = (job, context) => evaluate(job.if || 'success()', context);

// GitHub skips every step after a failed one unless the condition opts back in
// with always() / failure() / cancelled().
const stepRuns = (step, context = {}) => {
  const optsIntoFailure = /always\(\)|failure\(\)|cancelled\(\)/.test(step.if || '');
  if (context.jobFailed && !optsIntoFailure) return false;
  return step.if ? evaluate(step.if, context) : true;
};

const stepNamed = (steps, name) => {
  const step = steps.find(candidate => candidate.name === name);
  if (!step) throw new Error(`No step named "${name}"`);
  return step;
};

const needsResults = results => ({
  needs: Object.keys(results).reduce(
    (acc, job) => Object.assign(acc, { [job]: { result: results[job] } }),
    {},
  ),
});

const DEPLOYED_SHA = '${{ needs.resolve.outputs.sha }}';

describe('production pipeline gates', () => {
  it('blocks the deploy when the test job goes red', () => {
    // A red test leaves snapshot and migrate *skipped*, and skipped is not
    // failure - the reason `!failure()` alone would have shipped a red build.
    const context = needsResults({ resolve: 'success', snapshot: 'skipped', migrate: 'skipped' });

    expect(jobRuns(prod.jobs.snapshot, needsResults({ resolve: 'success', test: 'failure' })))
      .toBe(false);
    expect(jobRuns(prod.jobs.deploy, context)).toBe(false);
  });

  it('blocks the deploy when a migration fails', () => {
    const context = needsResults({ resolve: 'success', snapshot: 'success', migrate: 'failure' });

    expect(jobRuns(prod.jobs.deploy, context)).toBe(false);
  });

  it('deploys when migrations were deliberately skipped', () => {
    // workflow_dispatch with run_migrations: false - the redeploy/rollback path.
    const context = needsResults({ resolve: 'success', snapshot: 'success', migrate: 'skipped' });

    expect(jobRuns(prod.jobs.deploy, context)).toBe(true);
  });

  it('deploys when every gate passes, and never once cancelled', () => {
    const results = { resolve: 'success', snapshot: 'success', migrate: 'success' };

    expect(jobRuns(prod.jobs.deploy, needsResults(results))).toBe(true);
    expect(jobRuns(prod.jobs.deploy, Object.assign(needsResults(results), { cancelled: true })))
      .toBe(false);
  });

  it('migrates on a master merge and honours the dispatch checkbox', () => {
    const { migrate } = prod.jobs;

    // The inputs context is empty on push, so any comparison against `false`
    // would silently skip migrations on a release.
    expect(jobRuns(migrate, Object.assign(
      needsResults({ resolve: 'success', snapshot: 'success' }),
      { github: { event_name: 'push' }, inputs: {} },
    ))).toBe(true);

    [true, false].forEach((runMigrations) => {
      expect(jobRuns(migrate, Object.assign(
        needsResults({ resolve: 'success', snapshot: 'success' }),
        { github: { event_name: 'workflow_dispatch' }, inputs: { run_migrations: runMigrations } },
      ))).toBe(runMigrations);
    });
  });

  it('does not regress to either expression form that broke these gates', () => {
    // Both of these read as correct and both shipped broken gates.
    const push = { github: { event_name: 'push' }, inputs: {} };
    expect(evaluate('inputs.run_migrations != false', push)).toBe(false);
    expect(prod.jobs.migrate.if).not.toMatch(/inputs\.run_migrations\s*!=/);

    const redBuild = needsResults({ snapshot: 'skipped', migrate: 'skipped' });
    expect(evaluate('always() && !failure()', redBuild)).toBe(true);
    expect(jobRuns(prod.jobs.deploy, redBuild)).toBe(false);
  });

  it('snapshots the database before anything migrates it', () => {
    expect(prod.jobs.snapshot.needs).toContain('test');
    expect(prod.jobs.migrate.needs).toContain('snapshot');
    expect(prod.jobs.deploy.needs).toContain('migrate');
  });

  it('tests, migrates and deploys one immutable resolved SHA', () => {
    // A branch or tag can move mid-run; the tests must green-light exactly the
    // revision that is deployed.
    expect(prod.jobs.test.with.ref).toBe(DEPLOYED_SHA);
    expect(stepNamed(prod.jobs.migrate.steps, 'Checkout the revision being deployed').with.ref)
      .toBe(DEPLOYED_SHA);
    expect(stepNamed(prod.jobs.deploy.steps, 'Checkout the revision being deployed').with.ref)
      .toBe(DEPLOYED_SHA);
  });

  it('takes the migration helper from the workflow revision, not the deployed one', () => {
    // The rollback path deploys refs that predate this pipeline and therefore
    // contain neither the composite action nor the SSL settings it needs.
    const helperCheckout = stepNamed(
      prod.jobs.migrate.steps,
      "Checkout the migration helper from this workflow's revision",
    );
    const migrateStep = stepNamed(prod.jobs.migrate.steps, 'Migrate production database');

    expect(helperCheckout.with.ref).toBe('${{ github.sha }}');
    expect(helperCheckout.with.path).toBe('.deploy-helpers');
    expect(migrateStep.uses).toBe(`./${helperCheckout.with.path}/.github/actions/db-migrate`);
    expect(migrateStep.with['config-path'])
      .toBe(`${helperCheckout.with.path}/sequelize/config/database.js`);
    // The CLI config requires the shared SSL helper and its certificate bundle,
    // so those have to come along or the pinned config cannot even load.
    expect(helperCheckout.with['sparse-checkout']).toMatch(/src\/utils/);
    expect(helperCheckout.with['sparse-checkout']).toMatch(/src\/certs/);
    // The migrations themselves still come from the tree being deployed.
    expect(helperCheckout.with['sparse-checkout']).not.toMatch(/sequelize\/migrations/);
  });
});

describe('stage pipeline gates', () => {
  it('runs tests, then migrations, then the deploy', () => {
    expect(triggersOf(stage).push.branches).toEqual(['develop']);
    expect(stage.jobs.test.uses).toBe('./.github/workflows/ci.yml');
    expect(stage.jobs.migrate.needs).toBe('test');
    expect(stage.jobs.deploy.needs).toBe('migrate');
  });

  it('blocks the deploy on red tests and on failed migrations', () => {
    expect(jobRuns(stage.jobs.migrate, needsResults({ test: 'failure' }))).toBe(false);
    expect(jobRuns(stage.jobs.deploy, needsResults({ migrate: 'failure' }))).toBe(false);
    expect(jobRuns(stage.jobs.deploy, needsResults({ migrate: 'success' }))).toBe(true);
  });
});

describe('the database migration action', () => {
  const { steps } = migrateAction.runs;
  const closeStep = stepNamed(steps, 'Close RDS security group');
  const openStep = stepNamed(steps, 'Open RDS security group to this runner');

  it('closes the security group after a failed migration', () => {
    const context = {
      jobFailed: true,
      steps: { 'open-sg': { outcome: 'success', outputs: { 'rule-id': 'sgr-0123456789abcdef0' } } },
    };

    expect(stepRuns(closeStep, context)).toBe(true);
    // Applying migrations is what failed, so it must not be retried on the way out.
    expect(stepRuns(stepNamed(steps, 'Apply migrations'), context)).toBe(false);
  });

  it('closes the security group after a successful migration', () => {
    const context = {
      steps: { 'open-sg': { outcome: 'success', outputs: { 'rule-id': 'sgr-0123456789abcdef0' } } },
    };

    expect(stepRuns(closeStep, context)).toBe(true);
  });

  describe('the security group lifecycle, run for real against a stubbed AWS', () => {
    const openRule = runnerFor(openStep);
    const closeRule = runnerFor(closeStep);
    const GROUP = 'sg-0123456789abcdef0';
    const RUN = '424242';
    const CREATED = 'sgr-0000000000000000a';
    const LEFTOVER = 'sgr-0000000000000000b';

    const opening = extra => Object.assign({
      SECURITY_GROUP_ID: GROUP,
      DATABASE_PORT: '5432',
      RUNNER_IP: '203.0.113.7',
      RUN_ID: RUN,
    }, extra);

    const closing = extra => Object.assign({
      SECURITY_GROUP_ID: GROUP,
      RULE_ID: CREATED,
      RUN_ID: RUN,
    }, extra);

    const revokedIn = result => result.calls
      .filter(call => call.includes('revoke-security-group-ingress'))
      .join(' ');

    it('records the rule it created, so the revoke has something to aim at', () => {
      const result = openRule(opening());

      expect(result.status).toBe(0);
      expect(result.outputs.trim()).toBe(`rule-id=${CREATED}`);
      expect(result.calls[0]).toContain(`--group-id ${GROUP}`);
      // Tagged with the run id, which is what makes the sweep below safe.
      expect(result.calls[0]).toContain(`gha run ${RUN}`);
    });

    it('fails loudly when AWS reports no rule, rather than migrating anyway', () => {
      const result = openRule(opening({ AUTHORIZE_OUTPUT: 'None' }));

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Failed to create a security group rule');
    });

    it('revokes the rule it recorded', () => {
      const result = closeRule(closing({ DESCRIBE_OUTPUT: CREATED }));

      expect(result.status).toBe(0);
      // Recorded and discovered are the same rule: revoked once, not twice.
      expect(revokedIn(result)).toContain(`--security-group-rule-ids ${CREATED}`);
      expect(result.calls.filter(call => call.includes('revoke')).length).toBe(1);
    });

    it('recovers a rule whose creation response was lost', () => {
      // AWS created it, the response never came back, so nothing was recorded -
      // without the sweep the database would stay open to the runner's address.
      const result = closeRule(closing({ RULE_ID: '', DESCRIBE_OUTPUT: LEFTOVER }));

      expect(result.status).toBe(0);
      expect(revokedIn(result)).toContain(LEFTOVER);
    });

    it('revokes a leftover from an earlier attempt along with its own', () => {
      const result = closeRule(closing({ DESCRIBE_OUTPUT: `${LEFTOVER}\t${CREATED}` }));

      expect(revokedIn(result)).toContain(CREATED);
      expect(revokedIn(result)).toContain(LEFTOVER);
    });

    it('only ever sweeps rules this run created', () => {
      const result = closeRule(closing({ RULE_ID: '' }));
      const describeCall = result.calls
        .find(call => call.includes('describe-security-group-rules'));

      expect(describeCall).toContain(`Name=group-id,Values=${GROUP}`);
      expect(describeCall).toContain(`Description=='gha run ${RUN}'`);
    });

    it('revokes nothing when there is nothing left open', () => {
      // "None" is what the CLI prints for an empty result.
      const result = closeRule(closing({ RULE_ID: '', DESCRIBE_OUTPUT: 'None' }));

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No ingress rule left to revoke');
      expect(revokedIn(result)).toBe('');
    });

    it('still revokes what it recorded when the sweep itself fails', () => {
      const result = closeRule(closing({ DESCRIBE_FAILS: '1' }));

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('::warning::');
      expect(revokedIn(result)).toContain(CREATED);
    });

    it('closes the group after a failed migration', () => {
      // The step is unconditional precisely so this cannot be skipped.
      expect(closeStep.if).toBe('always()');
      expect(stepRuns(closeStep, { jobFailed: true })).toBe(true);
      expect(revokedIn(closeRule(closing({ DESCRIBE_OUTPUT: CREATED })))).toContain(CREATED);
    });

    it('never revokes by CIDR, which could clobber an unrelated rule', () => {
      const result = closeRule(closing({ DESCRIBE_OUTPUT: CREATED }));

      expect(openStep.run).toContain('SecurityGroupRules[0].SecurityGroupRuleId');
      expect(revokedIn(result)).not.toContain('--ip-permissions');
    });
  });

  it('masks the password and never interpolates an input into a script', () => {
    // Actions substitutes ${{ }} as literal text before bash parses the line, so
    // a password containing a backtick or $(...) would otherwise execute.
    expect(stepNamed(steps, 'Mask credentials').run).toContain('::add-mask::');
    steps.forEach((step) => {
      expect(step.run || '').not.toMatch(/\$\{\{\s*inputs\./);
    });
  });

  it('connects through the pinned, certificate-verifying config', () => {
    const sequelizeSteps = steps.filter(step => (step.run || '').includes('sequelize-cli'));

    expect(sequelizeSteps.length).toBeGreaterThan(0);
    sequelizeSteps.forEach((step) => {
      // .sequelizerc resolves its config from the cwd, which on a rollback is
      // the old tree - so the config has to be named explicitly.
      expect(step.run).toContain('--config "$CONFIG_PATH"');
      expect(step.env.CONFIG_PATH).toBe('${{ inputs.config-path }}');
    });
  });

  describe('the guard on connections a migration opens for itself', () => {
    // Run the step's actual script against throwaway trees: this is the
    // rollback path, and it is the one place the pipeline refuses to proceed.
    const guard = stepNamed(steps, 'Require verified TLS on every connection a migration opens');
    let scriptPath;

    const treeWith = ({ verifiesTls, migration }) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployed-tree-'));
      fs.mkdirSync(path.join(root, 'sequelize/migrations'), { recursive: true });
      if (verifiesTls) {
        fs.mkdirSync(path.join(root, 'src/utils'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src/utils/ssl.js'), '');
      }
      if (migration) {
        fs.writeFileSync(path.join(root, 'sequelize/migrations/20240101000000-x.js'), migration);
      }
      return root;
    };

    const run = cwd => spawnSync('bash', [scriptPath], { cwd, encoding: 'utf8' });

    beforeAll(() => {
      scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-')), 'guard.sh');
      fs.writeFileSync(scriptPath, guard.run);
    });

    it('refuses to migrate a revision whose migrations connect unverified', () => {
      const tree = treeWith({
        verifiesTls: false,
        migration: "import models from '../../src/models';",
      });

      const result = run(tree);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('::error::');
      // The operator needs to be told the way out, not just stopped.
      expect(result.stdout).toContain('run_migrations: false');
      expect(result.stdout).toContain('20240101000000-x.js');
    });

    it('allows a revision that verifies TLS itself', () => {
      const tree = treeWith({
        verifiesTls: true,
        migration: "import models from '../../src/models';",
      });

      expect(run(tree).status).toBe(0);
    });

    it('allows an old revision whose migrations open no connection of their own', () => {
      const tree = treeWith({
        verifiesTls: false,
        migration: 'module.exports = { up: queryInterface => queryInterface.addColumn() };',
      });

      expect(run(tree).status).toBe(0);
    });

    it('allows a tree with no migrations directory at all', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-tree-'));

      expect(run(root).status).toBe(0);
    });

    it('runs before anything connects', () => {
      const connecting = steps.filter(step => (step.run || '').includes('sequelize-cli'));

      connecting.forEach(step => expect(steps.indexOf(guard)).toBeLessThan(steps.indexOf(step)));
    });
  });
});

describe('the production smoke check', () => {
  const smoke = stepNamed(prod.jobs.deploy.steps, 'Smoke check');
  const runSmoke = runnerFor(smoke);
  const URL = 'https://api.example.test';

  it('cannot be skipped: a deploy nobody exercised is not a green deploy', () => {
    // A Lambda update can settle successfully while the handler or the API
    // Gateway integration still returns errors.
    expect(smoke.if).toBeUndefined();

    const result = runSmoke({ PROD_API_URL: '' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::');
    expect(result.stdout).toContain('PROD_API_URL');
  });

  it('calls the deployed API when the URL is configured', () => {
    const result = runSmoke({ PROD_API_URL: URL });

    expect(result.status).toBe(0);
    expect(result.calls.join(' ')).toContain(`${URL}/languages`);
  });

  it('retries a cold start before failing the deploy', () => {
    const result = runSmoke({ PROD_API_URL: URL, CURL_STATUS: '22' });

    expect(result.status).toBe(1);
    expect(result.calls.filter(call => call.startsWith('curl')).length).toBe(5);
  });
});

describe('deploying a ref that predates this pipeline', () => {
  const { steps } = prod.jobs.deploy;
  const scriptsRun = steps
    .filter(step => step.run)
    .map(step => step.run)
    .join('\n');

  it('never runs the deployed tree\'s own deploy script', () => {
    // A pre-pipeline `deploy:prod` used --zip-file, ignored DEPLOY_S3_KEY and
    // never waited for the update to settle.
    expect(scriptsRun).not.toMatch(/deploy:prod|package-deploy/);
  });

  it('only runs npm scripts that every rollback target already has', () => {
    const invoked = (scriptsRun.match(/npm run [\w:-]+/g) || [])
      .map(command => command.replace('npm run ', ''))
      .sort();

    expect(invoked).toEqual(['build', 'clean', 'package']);
  });

  it('uploads, updates and waits from the workflow\'s own revision', () => {
    const helper = stepNamed(steps, "Checkout the deployment helper from this workflow's revision");
    const deployStep = stepNamed(steps, 'Deploy to production');

    expect(helper.with.ref).toBe('${{ github.sha }}');
    expect(deployStep.uses).toBe(`./${helper.with.path}/.github/actions/lambda-deploy`);
    expect(deployStep.with['s3-key']).toBe('${{ env.DEPLOY_S3_KEY }}');
  });

  it('smoke-checks only once the update has settled', () => {
    const names = steps.map(step => step.name);
    const update = stepNamed(
      deployAction.runs.steps,
      'Update the function and wait for it to settle',
    );

    expect(names.indexOf('Deploy to production')).toBeLessThan(names.indexOf('Smoke check'));
    expect(update.run.indexOf('update-function-code'))
      .toBeLessThan(update.run.indexOf('wait function-updated-v2'));
    // The #216 guard: no function configuration in the deploy log.
    expect(update.run).toContain('--query FunctionArn --output text');
  });

  it('removes the artifact it staged even when the deploy fails', () => {
    const remove = stepNamed(deployAction.runs.steps, 'Remove the artifact');

    expect(remove.if).toBe('always()');
    expect(remove.run).toContain('"s3://$S3_BUCKET/$S3_KEY"');
  });

  it('stages the two environments under distinct per-run keys', () => {
    const keys = [prod.jobs.deploy.env.DEPLOY_S3_KEY, stage.jobs.deploy.env.DEPLOY_S3_KEY];

    expect(keys[0]).not.toBe(keys[1]);
    keys.forEach(key => expect(key).toMatch(/github\.run_id/));
  });

  it('deploys stage through the very same action', () => {
    expect(stepNamed(stage.jobs.deploy.steps, 'Deploy to the test environment').uses)
      .toBe('./.github/actions/lambda-deploy');
  });
});
