import express from 'express';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';
import { Logger } from './Logger';

const app = express();
const METRICS_PORT = process.env.METRICS_PORT || 9090;

// Enable default metrics collection (CPU, memory, etc.)
collectDefaultMetrics({
  prefix: 'wathiqly_',
});

/**
 * Global Metrics Definitions
 */

// Saga Metrics
export const sagaTotalCounter = new Counter({
  name: 'wathiqly_saga_total',
  help: 'Total number of sagas started',
  labelNames: ['type', 'status'],
});

export const sagaActiveGauge = new Gauge({
  name: 'wathiqly_saga_active',
  help: 'Number of currently active sagas',
  labelNames: ['type'],
});

// HTTP Metrics
export const eventHandlerLatency = new Histogram({
  name: 'wathiqly_event_handler_latency_seconds',
  help: 'Duration of event handler execution in seconds',
  labelNames: ['event_type', 'handler_name', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const httpRequestDuration = new Histogram({
  name: 'wathiqly_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const startMetricsServer = () => {
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex instanceof Error ? ex.message : String(ex));
      Logger.error('Failed to get metrics', ex);
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.listen(METRICS_PORT, () => {
    Logger.info(`[MetricsServer] Listening on port ${METRICS_PORT}, exposing /metrics and /health endpoints.`);
  });
};
