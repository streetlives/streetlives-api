import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import setupRoutes from './routes';

const app = express();
app.server = http.createServer(app);

app.use(morgan('dev'));

app.use(bodyParser.json());

setupRoutes(app);

app.server.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Started listening on port ${app.server.address().port}`);
});

export default app;
