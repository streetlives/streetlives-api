import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';

const app = express();
app.server = http.createServer(app);

app.use(morgan('dev'));

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Hello.');
});

app.server.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Started listening on port ${app.server.address().port}`);
});

export default app;
