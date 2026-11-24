// Optional host bootstrap. Call before importing Pino or the application.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { PinoInstrumentation } = require('@opentelemetry/instrumentation-pino');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

function endpoint(base, signal) {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new TypeError('Use an explicit HTTP(S) OTLP base endpoint without credentials or query');
    url.pathname = url.pathname.replace(/\/$/, '') + '/v1/' + signal;
    return url.toString();
}
function createHostSDK(options = {}) {
    const spanProcessors = options.spanProcessor ? [options.spanProcessor] : [];
    const metricReaders = [];
    if (options.endpoint) {
        spanProcessors.push(new SimpleSpanProcessor(new OTLPTraceExporter({
            url: endpoint(options.endpoint, 'traces'), timeoutMillis: 5000,
        })));
        metricReaders.push(new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: endpoint(options.endpoint, 'metrics'), timeoutMillis: 5000 }),
            exportIntervalMillis: 60000,
        }));
    }
    // Explicit arrays prevent environment-driven defaults from enabling exporters.
    // Automatic log correlation is optional; never send a second copy of Pino logs.
    const instrument = new PinoInstrumentation({
        disableLogSending: true,
        disableLogCorrelation: options.automaticCorrelation !== true,
    });
    const sdk = new NodeSDK({
        serviceName: 'nyxlink-host', autoDetectResources: false,
        spanProcessors, metricReaders, logRecordProcessors: [],
        instrumentations: options.automaticCorrelation === true ? [instrument] : [],
    });
    let started = false;
    let shutdown;
    return {
        start() {
            if (started || shutdown) throw new Error('Host SDK already started or closed');
            sdk.start();
            started = true;
        },
        close() {
            if (!shutdown) shutdown = started ? sdk.shutdown().finally(() => instrument.disable()) : Promise.resolve();
            return shutdown;
        },
    };
}
module.exports = { createHostSDK };
