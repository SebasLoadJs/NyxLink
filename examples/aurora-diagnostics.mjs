import Table from 'cli-table3';
import prettyBytes from 'pretty-bytes';
import prettyMs from 'pretty-ms';
import { createLogUpdate } from 'log-update';

export function capabilityTable(nodes) {
    const table = new Table({ head: ['Node', 'Backend', 'Ready', 'Ping', 'Memory', 'Capabilities'],
        style: { head: [], border: [] } });
    for (const node of nodes) {
        const available = node.capabilities.filter(x => x.state === 'available').length;
        const unknown = node.capabilities.filter(x => x.state === 'unknown').length;
        table.push([node.alias, node.backend, node.ready ? 'yes' : 'no',
            node.latencyMs === undefined ? 'N/A' : prettyMs(node.latencyMs),
            node.memoryUsedBytes === undefined ? 'N/A' : prettyBytes(node.memoryUsedBytes),
            node.capabilities.length ? available + ' available / ' + unknown + ' unknown' : 'N/A']);
    }
    return table.toString();
}
export function musicLine(snapshot) {
    const position = snapshot.positionMs === undefined ? 'N/A' : prettyMs(snapshot.positionMs);
    const duration = snapshot.durationMs === undefined ? 'N/A' : prettyMs(snapshot.durationMs);
    const ratio = snapshot.durationMs > 0 && snapshot.positionMs !== undefined
        ? Math.min(1, Math.max(0, snapshot.positionMs / snapshot.durationMs)) : undefined;
    const progress = ratio === undefined ? '' : ' [' + '='.repeat(Math.floor(ratio * 10)) + '-'.repeat(10 - Math.floor(ratio * 10)) + ']';
    return 'MUSIC ' + snapshot.state.toUpperCase() + ' ' + position +
        (snapshot.estimated ? '~' : '') + (snapshot.stream ? ' LIVE' : ' / ' + duration) + progress;
}
// Standalone diagnostic mode only: this owns its output region, never run beside a coordinator.
export function startStandaloneMusicView(strip, options = {}) {
    const stream = options.stream ?? process.stdout;
    if (!stream.isTTY || process.env.CI || 'NO_COLOR' in process.env || process.env.TERM === 'dumb') {
        stream.write(musicLine(strip.snapshot()) + '\n');
        return () => {};
    }
    const render = createLogUpdate(stream, { showCursor: true });
    const draw = () => render(musicLine(strip.snapshot()));
    draw();
    const timer = setInterval(draw, 250);
    timer.unref?.();
    let closed = false;
    return () => { if (closed) return; closed = true; clearInterval(timer); render.clear(); render.done(); };
}
