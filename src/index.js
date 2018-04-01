import app from './app';
import config from './config';

app.server = app.listen(config.port);

// eslint-disable-next-line no-console
console.log(`Started listening on port ${config.port}`);

export default app;
