const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { AuroraEvents, BackendDetector } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

async function fixture(t, level='debug') {
  const context = createPlayer(t); const records = [];
  const logger = new AuroraEvents({level,target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(name=>[name,record=>records.push(record)]))});
  logger.attach(context.manager);
  context.node.backend = BackendDetector.detect({ version: { semver: '3.10.0' }, isNodelink: true }); context.node.isNodeLink = true;
  context.node.sessionId = 'PRIVATE_SESSION';
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain without recording request bodies */ }
    if (req.url === '/v4/loadstream') { res.setHeader('content-type', 'audio/l16'); res.end(Buffer.alloc(16)); }
    else if (req.url.startsWith('/v4/sessions/')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ guildId: context.player.guildId, volume: 100, paused: false, state: { position: 0 }, track: null })); }
    else if (req.url.startsWith('/v4/loadlyrics')) { res.setHeader('content-type', 'application/json'); res.end('{"loadType":"empty","data":{}}'); }
    else { res.setHeader('content-type', 'application/json'); res.setHeader('x-fixture', 'preserved'); res.end('{"returned":"PRIVATE_RESPONSE"}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.node.port = server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await logger.close(); });
  return { ...context, logger, records, server };
}

test('REST and stream-opening metrics work with a silent logger without retaining payloads', async t => {
  const { manager, node } = await fixture(t,'silent');
  const monitor = manager.startPerformanceMonitor(); t.after(() => monitor.close());
  assert.deepEqual(await node.rest.getInfo(), { returned: 'PRIVATE_RESPONSE' });
  const response = await node.rest.loadStream({ encodedTrack: 'PRIVATE_STREAM_TRACK', format: 'raw' });
  for await (const _chunk of response.stream) { /* caller owns audio */ }
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.durations.rest.count, 1); assert.equal(snapshot.durations.streamOpen.count, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_|test-node/);
});

test('HTTP spans preserve header overloads/results while scrubbing session paths, queries and bodies', async t => {
  const { node, player, logger, records } = await fixture(t);
  await logger.observe('search', async () => {
    const info = await node.rest.getInfoWithHeaders();
    assert.deepEqual(info.data, { returned: 'PRIVATE_RESPONSE' }); assert.equal(info.headers['x-fixture'], 'preserved');
    assert.equal((await node.rest.getPlayer(player.guildId)).guildId, player.guildId);
    await node.rest.loadLyrics('PRIVATE_ENCODED_QUERY');
  });
  const http = records.filter(record => record.eventCode === 'REST_COMPLETED');
  assert.equal(http.length,3);
  const parent = records.find(record=>record.eventCode==='SEARCH_COMPLETED');
  assert.ok(http.every(record=>record.parentOperationId===parent.operationId));
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_SESSION|PRIVATE_ENCODED_QUERY|PRIVATE_RESPONSE/);
});

test('stream spans describe only opening and leave audio consumption to the caller', async t => {
  const { node, logger, records } = await fixture(t);
  const result = await node.rest.loadStream({ encodedTrack: 'PRIVATE_STREAM_TRACK', format: 'raw' });
  let bytes = 0; for await (const chunk of result.stream) bytes += chunk.length;
  assert.equal(bytes, 16); assert.equal(result.statusCode, 200);
  assert.ok(records.some(record => record.eventCode === 'STREAM_OPENED'));
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_STREAM_TRACK/);
});

test('failure spans retain actual HTTP status without logging raw backend bodies', async t => {
  const { node, logger, records, server } = await fixture(t);
  server.removeAllListeners('request');
  server.on('request', (_req, res) => { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"message":"PRIVATE_BODY_DETAIL"}'); });
  await assert.rejects(node.rest.getInfoWithHeaders(), error => error.statusCode === 403 && error.body.message === 'PRIVATE_BODY_DETAIL');
  const failure = records.find(record => record.eventCode === 'REST_FAILED');
  assert.equal(failure.sanitizedContext.httpStatus, 403);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_BODY_DETAIL/);
});
