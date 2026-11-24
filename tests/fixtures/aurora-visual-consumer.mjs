import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { Manager, version } from 'nyxlink';
import { createPresentation, renderIncident } from './aurora-visual.mjs';

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

for(const columns of [40,80,120]){
    for(const state of ['recovered','degraded','failed','cancelled']){
        const output=renderIncident({state,sourceBackend:'lavalink',backend:'nodelink',durationMs:182,reasonCode:state==='degraded'?'source-cleanup-failed':undefined},{columns,color:false});
        assert.match(output,new RegExp('FAILOVER '+state.toUpperCase()));
        assert.match(output,/LAVALINK.*NODELINK/);
        assert.match(output,/182ms/);
        assert.equal(stripAnsi(output),output);
        assert.ok(output.split('\n').every(line=>stringWidth(line)<=columns));
        if(state==='degraded')assert.match(output,/Source cleanup failed/);
    }
}
const unknown=renderIncident({state:'failed',backend:'private-node',reasonCode:'private-secret'},{columns:40,unicode:false});
assert.match(unknown,/Duration: N\/A/);
assert.doesNotMatch(unknown,/private-/);

for(const columns of [40,80,120]){
 const output=createPresentation({columns,color:false,isTTY:false}).event({eventCode:'DASHBOARD_SNAPSHOT',timestamp:'2026-01-01T12:34:56Z',sanitizedContext:{nodeCount:2,playerCount:0,playingCount:0,queuedTracks:4,sourceCount:3,password:'PRIVATE_CANARY'}});
 assert.match(output,/Nodes: 2/);assert.match(output,/Players: 0/);assert.match(output,/Queue: 4/);
 assert.doesNotMatch(output,/PRIVATE_CANARY/);assert.ok(output.split('\n').every(line=>stringWidth(stripAnsi(line))<=columns));
}
