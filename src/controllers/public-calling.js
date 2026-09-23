// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const crypto = require('crypto');
const net = require('net');
const express = require('express');
const { readConfig } = require('../services/public-calling/config');
const { createStore } = require('../services/public-calling/store');
const { createDirectory } = require('../services/public-calling/directory');
const { createProviders } = require('../services/public-calling/providers');
const { createService } = require('../services/public-calling/service');

function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 32) {
    return false;
  }
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(actual).digest(),
    crypto.createHash('sha256').update(expected).digest(),
  );
}

function createRouter({
  models,
  config: suppliedConfig,
  provider: suppliedProvider,
  store: suppliedStore,
  directory: suppliedDirectory,
} = {}) {
  const router = express.Router();
  let service;
  const config = () => suppliedConfig || readConfig();
  const getService = () => {
    if (!service) {
      const settings = config();
      const database = models || require('../models'); // eslint-disable-line global-require
      service = createService({
        config: settings,
        store: suppliedStore || createStore(database.sequelize),
        directory: suppliedDirectory || createDirectory(database),
        provider: suppliedProvider || createProviders(settings),
      });
    }
    return service;
  };
  const run = action => (req, res) =>
    Promise.resolve()
      .then(() => action(req))
      .then(result => res.json(result))
      .catch((error) => {
        // Errors omit request bodies, personal data, upstream responses and secrets.
        res
          .status(error.status || 503)
          .json({
            error: error.code || 'calling_unavailable',
            message: error.code ? error.message : 'Browser calling is temporarily unavailable.',
          });
      });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/webhook',
    run((req) => {
      if (!req.publicCallingRawBody) {
        throw Object.assign(new Error('Invalid webhook body.'), {
          status: 400,
          code: 'invalid_webhook',
        });
      }
      return getService().webhook(req.publicCallingRawBody, req.get('authorization'));
    }),
  );
  router.use((req, res, next) => {
    try {
      if (!sameSecret(req.get('x-public-calling-secret'), config().secret)) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      return next();
    } catch (_) {
      return res.status(503).json({ error: 'calling_unavailable' });
    }
  });
  // Scheduler cleanup remains available with the kill switch off.
  router.post(
    '/reap',
    run(() => getService().reap()),
  );
  router.use((req, res, next) => {
    try {
      const settings = config();
      if (!settings.enabled) {
        if (req.method === 'GET' && req.path === '/config') return res.json({ enabled: false });
        const draining =
          (req.method === 'GET' && /^\/calls\/[a-f\d]{32}$/.test(req.path)) ||
          (req.method === 'POST' && /^\/calls\/[a-f\d]{32}\/hangup$/.test(req.path)) ||
          (req.method === 'DELETE' && req.path === '/verification');
        if (!draining) {
          return res
            .status(503)
            .json({
              error: 'calling_disabled',
              message: 'Browser calling is currently unavailable.',
            });
        }
      }
      const session = req.get('x-public-calling-session');
      const ip = req.get('x-public-calling-client-ip');
      if (!/^[a-zA-Z0-9_-]{32,128}$/.test(session || '') || !net.isIP(ip || '')) {
        return res.status(401).json({ error: 'invalid_session' });
      }
      req.publicCallingContext = { session, ip };
      return next();
    } catch (_) {
      return res.status(503).json({ error: 'calling_unavailable' });
    }
  });
  router.get(
    '/config',
    run(req => getService().config(req.publicCallingContext)),
  );
  router.post(
    '/verification/request',
    run(req => getService().requestVerification(req.publicCallingContext, req.body.number)),
  );
  router.post(
    '/verification/confirm',
    run(req => getService().confirmVerification(req.publicCallingContext, req.body.code)),
  );
  router.delete(
    '/verification',
    run(req => getService().forget(req.publicCallingContext)),
  );
  router.post(
    '/calls',
    run(req => getService().create(req.publicCallingContext, req.body)),
  );
  router.get(
    '/calls/:id',
    run(req => getService().status(req.publicCallingContext, req.params.id)),
  );
  router.post(
    '/calls/:id/start',
    run(req => getService().start(req.publicCallingContext, req.params.id)),
  );
  router.post(
    '/calls/:id/hangup',
    run(req => getService().hangup(req.publicCallingContext, req.params.id)),
  );
  return router;
}

module.exports = { createRouter, sameSecret };
