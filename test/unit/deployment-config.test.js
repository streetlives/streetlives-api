import packageJson from '../../package.json';

describe('Lambda deployment commands', () => {
  ['deploy:dev', 'deploy:prod'].forEach((scriptName) => {
    it(`${scriptName} limits update-function-code output to a non-secret field`, () => {
      const command = packageJson.scripts[scriptName];

      expect(command).toContain('aws lambda update-function-code');
      expect(command).toContain('--query FunctionArn --output text');
    });
  });
});
