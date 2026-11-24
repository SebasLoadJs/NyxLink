import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { Manager, version } from 'nyxlink';
import { createPresentation } from './aurora-visual.mjs';

const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'private-fixture', secure: false }],
    options: { node: { autoMovePlayers: true } },
});
try {
    for (const columns of [40, 80, 120]) {
        const presentation = createPresentation({ columns, color: false, isTTY: false });
        const banner = presentation.banner(manager);
        assert.match(banner, new RegExp('Version\\s+' + version.replaceAll('.', '\\.')));
        assert.match(banner, /Backends\s+Lavalink \+ NodeLink/);
        assert.match(banner, /Failover\s+Enabled/);
        assert.doesNotMatch(banner, /private-fixture|PID|Telemetry|Logging/);
        assert.equal(stripAnsi(banner), banner);
        assert.ok(banner.split('\n').every(line => stringWidth(line) <= columns));
    }
    const compact = createPresentation({ columns: 40, unicode: false });
    assert.match(compact.banner({ options: {} }), /Failover\s+Disabled/);
    const line = compact.event({ eventCode: 'FAILOVER_RECOVERED', timestamp: '2026-01-01T12:34:56Z',
        durationMs: 182, sanitizedContext: { backend: 'nodelink', secret: 'private-fixture' } });
    assert.match(line, /Recovery confirmed by protocol/);
    assert.match(line, /182ms/);
    assert.doesNotMatch(line, /private-fixture/);
} finally { await manager.shutdown(); }
