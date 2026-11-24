// Optional host bootstrap. Call before importing Pino or the application.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { PinoInstrumentation } = require('@opentelemetry/instrumentation-pino');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

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
    const logRecordProcessors = [];
    if (options.exportLogs === true && !options.endpoint) throw new TypeError('Log export requires an explicit OTLP endpoint');
    if (options.exportLogs === true) logRecordProcessors.push(new BatchLogRecordProcessor({exporter:new OTLPLogExporter({url:endpoint(options.endpoint,'logs'),timeoutMillis:5000}),maxQueueSize:512,maxExportBatchSize:128,scheduledDelayMillis:1000,exportTimeoutMillis:5000}));
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
        spanProcessors, metricReaders, logRecordProcessors,
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
        // Wire into pipeline.onEvent; never enable instrumentation log sending.
        emitAuroraEvent(input) {
            if (!started || shutdown || options.exportLogs !== true) return false;
            const { normalizeAuroraEvent, auroraCatalog } = require('nyxlink');
            const event = normalizeAuroraEvent(input);
            if (!event) return false;
            const severityNumber = {trace:SeverityNumber.TRACE,debug:SeverityNumber.DEBUG,info:SeverityNumber.INFO,warn:SeverityNumber.WARN,error:SeverityNumber.ERROR,fatal:SeverityNumber.FATAL}[event.severity];
            logs.getLogger('nyxlink-aurora').emit({
                severityNumber,severityText:event.severity.toUpperCase(),
                body:auroraCatalog[event.eventCode].message,
                attributes:{'nyxlink.event_code':event.eventCode,'nyxlink.category':event.category,'nyxlink.outcome':event.outcome,'nyxlink.backend':event.sanitizedContext.backend??'unknown',...(event.durationMs===undefined?{}:{'nyxlink.duration_ms':event.durationMs})},
            });
            return true;
        },
        close() {
            if (!shutdown) shutdown = started ? sdk.shutdown().finally(() => instrument.disable()) : Promise.resolve();
            return shutdown;
        },
    };
}
module.exports = { createHostSDK };
