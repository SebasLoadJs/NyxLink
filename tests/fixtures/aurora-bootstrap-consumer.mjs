import assert from 'node:assert/strict';
import { Manager, NodeState } from 'nyxlink';
import { runAuroraBootstrap } from './aurora-bootstrap.mjs';

const manager = new Manager({ nodes: [{ host: 'localhost', port: 2333, password: 'fixture', secure: false }] });
const lines = [], frames = [];
let released = false;
const terminal = {
    acquire: () => ({ update: frame => { frames.push(frame); return true; }, release: () => { released = true; } }),
    write: line => { lines.push(line); return true; },
};
const node = { identifier: 'fixture', connected: false, destroyed: false, state: NodeState.CONNECTING };
manager.init = async () => {
    manager.nodes.nodes.set(node.identifier, node);
    return manager;
};
const timer = setTimeout(() => {
    node.connected = true; node.state = NodeState.READY;
    manager.emit('nodeReady', node, {});
}, 200);
try {
    const result = await runAuroraBootstrap(manager, '123456789012345678', terminal, { timeoutMs: 2000 });
    assert.equal(result.phase, 'ready');
    assert.equal(result.ready, 1);
    assert.equal(released, true);
    assert.match(lines[0], /Manager initialized/);
    assert.match(lines.at(-1), /ready · 1\/1 ready/);
    assert.ok(frames.some(frame => frame.includes('Initializing manager')));
    assert.ok(frames.some(frame => frame.includes('AUDIO NETWORK')));
} finally {
    clearTimeout(timer);
    manager.nodes.nodes.clear();
    await manager.shutdown();
}
