import assert from 'node:assert/strict';
import pino from 'pino';
import { prettyFactory } from 'pino-pretty';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { Manager, SearchResult, createPinoSink } from 'nyxlink';

async function main(): Promise<void> {
    const lines: string[] = [];
    const logger = pino({ level: 'trace' }, { write(line: string) { lines.push(line); } });
    const spanExporter = new InMemorySpanExporter();
    const traces = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spanExporter)] });
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60_000 });
    const meters = new MeterProvider({ readers: [reader] });
    const manager = new Manager({
        nodes: [{ host: '127.0.0.1', port: 2333, password: 'fixture', secure: false }],
        options: {
            logging: { level: 'info', console: false, sink: createPinoSink(logger) },
            telemetry: { meter: meters.getMeter('nyxlink-test'), tracer: traces.getTracer('nyxlink-test') },
        },
    });
    try {
        manager.logger!.info('Node', 'connected', { token: 'secret-canary-987' });
        manager.logger!.warn('Node', 'warning');
        assert.equal(lines.length, 2);
        const records = lines.map(line => JSON.parse(line));
        assert.deepEqual(records.map(record => record.level), [30, 40]);
        assert.equal(records[0].nyxlinkLevel, 3);
        assert.equal(records[0].module, 'Node');
        assert.match(records[0].msg, /connected/);
        assert.doesNotMatch(lines.join(''), /secret-canary-987/);
        const pretty = prettyFactory({ colorize: false });
        assert.match(String(pretty(lines[0])), /INFO.*connected/);
        // Stub only the upstream search response, not telemetry.
        const searcher = manager as unknown as { searches: { search: () => Promise<SearchResult> } };
        searcher.searches.search = async () => new SearchResult({ loadType: 'empty', data: {} });
        await manager.search({ query: 'private-query-canary' });
        await traces.forceFlush();
        await meters.forceFlush();
        const spans = spanExporter.getFinishedSpans();
        assert.equal(spans.length, 1);
        assert.equal(spans[0].name, 'nyxlink.search');
        assert.equal(spans[0].attributes['nyxlink.outcome'], 'empty');
        const metrics = JSON.stringify(metricExporter.getMetrics());
        assert.match(metrics, /nyxlink.events/);
        assert.match(metrics, /nyxlink.search.duration/);
        assert.match(metrics, /search.empty/);
        assert.doesNotMatch(metrics + JSON.stringify(spans[0].attributes), /private-query-canary/);
    } finally {
        await manager.shutdown();
        await Promise.all([traces.shutdown(), meters.shutdown()]);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
