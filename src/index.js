// Node server entry point when not running in lambda.
import app from './app';
import config from './config';
import models from './models';

models.sequelize.sync().then(() => {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Started listening on port ${config.port}`);
  });
});

export default app;
