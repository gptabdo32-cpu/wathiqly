import express from 'express';
import { register } from 'prom-client';
import { Logger } from './Logger';

const app = express();
const METRICS_PORT = process.env.METRICS_PORT || 9090;

export const startMetricsServer = () => {
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
      Logger.error('Failed to get metrics', ex);
    }
  });

  app.listen(METRICS_PORT, () => {
    Logger.info(`Metrics server listening on port ${METRICS_PORT}, exposing /metrics endpoint.`);
  });
};
