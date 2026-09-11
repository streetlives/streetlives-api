// GitHub expressions look like JS template strings but are not - they are the
// literal text of the workflow files.
/* eslint-disable no-template-curly-in-string */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { evaluate } = require('../support/github-expression');

const load = file => yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));

const prod = load('.github/workflows/deploy-prod.yml');
const stage = load('.github/workflows/deploy-test-on-develop-merge.yml');
const migrateAction = load('.github/actions/db-migrate/action.yml');

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
    expect(stepNamed(prod.jobs.deploy.steps, 'Checkout').with.ref).toBe(DEPLOYED_SHA);
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

  it('has nothing to close when the group was never opened', () => {
    const context = {
      jobFailed: true,
      steps: { 'open-sg': { outcome: 'failure', outputs: { 'rule-id': '' } } },
    };

    expect(stepRuns(closeStep, context)).toBe(false);
  });

  it('revokes by rule id, so it can never clobber an unrelated rule', () => {
    expect(openStep.run).toContain('SecurityGroupRules[0].SecurityGroupRuleId');
    expect(closeStep.run).toContain('--security-group-rule-ids "$RULE_ID"');
    expect(closeStep.run).not.toContain('--ip-permissions');
  });

  it('masks the password and never interpolates an input into a script', () => {
    // Actions substitutes ${{ }} as literal text before bash parses the line, so
    // a password containing a backtick or $(...) would otherwise execute.
    expect(stepNamed(steps, 'Mask credentials').run).toContain('::add-mask::');
    steps.forEach((step) => {
      expect(step.run || '').not.toMatch(/\$\{\{\s*inputs\./);
    });
  });

  it('verifies the RDS server certificate before sending credentials', () => {
    const caStep = stepNamed(steps, 'Fetch RDS certificate bundle');
    const sequelizeSteps = steps.filter(step => (step.run || '').includes('sequelize-cli'));

    expect(caStep.run).toContain('truststore.pki.rds.amazonaws.com');
    expect(steps.indexOf(caStep)).toBeLessThan(steps.indexOf(sequelizeSteps[0]));
    expect(sequelizeSteps.length).toBeGreaterThan(0);
    sequelizeSteps.forEach((step) => {
      expect(step.run).toContain('--config "$CONFIG_PATH"');
      expect(step.env.CONFIG_PATH).toBe('${{ inputs.config-path }}');
    });
  });
});
