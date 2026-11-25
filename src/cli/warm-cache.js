/* eslint-disable no-console */
// `npm run cache:warm [-- --flush]`: fills the local (or any reachable) Valkey cache with every
// location's /locations-by-slug response. See src/services/cache-warm.js. Deployed environments
// are warmed through the Lambda instead, since their cache is only reachable inside the VPC.
import { warmLocationCache } from '../services/cache-warm';
import models from '../models';
import { resetForTesting as disconnectCache } from '../services/cache';

const main = async () => {
  const flush = process.argv.includes('--flush');
  const started = Date.now();
  const result = await warmLocationCache({ flush });
  console.log(JSON.stringify({ ...result, seconds: (Date.now() - started) / 1000 }, null, 2));
  return result.failed.length ? 1 : 0;
};

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectCache();
    await models.sequelize.close();
  });
