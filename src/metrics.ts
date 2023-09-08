import { Counter, Histogram } from 'prom-client';

export const requestCounter = new Counter({
  name: 'dwn_requests_total',
  help: 'all dwn requests processed',
  labelNames: ['method', 'status', 'error'],
});

export const responseHistogram = new Histogram({
  name: 'http_response',
  help: 'response histogram',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  labelNames: ['route', 'code'],
});
