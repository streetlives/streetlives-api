import packageJson from '../../package.json';

describe('Lambda deployment commands', () => {
  ['deploy:dev', 'deploy:prod'].forEach((scriptName) => {
    it(`${scriptName} limits update-function-code output to a non-secret field`, () => {
      const command = packageJson.scripts[scriptName];

      expect(command).toContain('aws lambda update-function-code');
      expect(command).toContain('--query FunctionArn --output text');
    });

    // Stage and production deploys can run concurrently. A fixed S3 key lets one
    // run overwrite or delete the other's artifact between upload and
    // update-function-code, which can push the Stage build to production.
    it(`${scriptName} uploads, deploys and cleans up the same per-run S3 key`, () => {
      const command = packageJson.scripts[scriptName];
      const key = '${DEPLOY_S3_KEY:-dist.zip}';

      expect(command).toContain(`--s3-key ${key}`);
      // Upload and cleanup must address that same key, or the deploy either
      // fetches a stale object or leaves the artifact behind.
      expect(command.split(key).length - 1).toBe(3);
      expect(command).not.toMatch(/--s3-key dist\.zip(\s|$)/);
    });
  });
});
