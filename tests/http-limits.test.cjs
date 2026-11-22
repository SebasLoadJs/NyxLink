const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');
const { makeRequest, makeStreamRequest } = require('../dist/src/Util');

async function server(t, handler) {
  const active = http.createServer(handler);
  active.listen(0, '127.0.0.1');
  await once(active, 'listening');
  t.after(() => { active.closeAllConnections(); return new Promise(resolve => active.close(resolve)); });
  return 'http://127.0.0.1:' + active.address().port;
}

test('HTTP deadline rejects a response that keeps sending bytes', {timeout:5000}, async t => {
  const origin = await server(t, (_req, res) => {
    res.writeHead(200, {'content-type':'text/plain'});
    res.write('a');
    const timer = setInterval(() => res.write('a'), 15);
    res.once('close', () => clearInterval(timer));
  });
  await assert.rejects(makeRequest(origin, {throwOnError:true}, 150, 0), {code:'ETIMEDOUT'});
});

test('compressed HTTP responses are bounded by decoded size and never retried', {timeout:10000}, async t => {
  const body = zlib.gzipSync(Buffer.alloc(33 * 1024 * 1024, 65));
  let requests = 0;
  const origin = await server(t, (_req, res) => {
    requests++;
    res.writeHead(200, {'content-encoding':'gzip','content-type':'text/plain'});
    res.end(body);
  });
  await assert.rejects(makeRequest(origin, {throwOnError:true}, 5000, 2, 0), {code:'HTTP_RESPONSE_TOO_LARGE'});
  assert.equal(requests,1);
});

test('truncated compressed responses reject instead of hanging', {timeout:5000}, async t => {
  const origin = await server(t, (_req, res) => {
    res.writeHead(200, {'content-encoding':'gzip'});
    res.end(Buffer.from([31,139,8,0,0]));
  });
  await assert.rejects(makeRequest(origin, {throwOnError:true}, 1000, 0));
});

test('ordinary JSON redirect-shaped properties are not transport directives', async t => {
  const origin = await server(t, (_req, res) => {
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify({_redirect:'/not-a-redirect', value:42}));
  });
  assert.deepEqual(await makeRequest(origin, {throwOnError:true}, 1000, 0), {_redirect:'/not-a-redirect', value:42});
});

test('permanent HTTP errors do not retry even in legacy mode', async t => {
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.writeHead(401); res.end(); });
  assert.equal(await makeRequest(origin, {}, 1000, 3, 0), undefined);
  await assert.rejects(makeRequest(origin, {throwOnError:true}, 1000, 3, 0), {statusCode:401});
  assert.equal(requests,2);
});

test('excessive Retry-After is respected without starting an earlier retry', async t => {
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.writeHead(429, {'retry-after':'120'}); res.end(); });
  await assert.rejects(makeRequest(origin, {throwOnError:true}, 1000, 3, 0), {statusCode:429,retryAfterMs:120000});
  assert.equal(requests,1);
});

test('streaming URL policy rejects credentials and leaves caller headers untouched', async t => {
  const origin = await server(t, (_req, res) => res.end('hello'));
  const headers = {HOST:'incorrect.invalid','X-Test':'value'};
  const result = await makeStreamRequest(origin, {headers}, 1000);
  let data = '';
  for await (const chunk of result.stream) data += chunk.toString();
  assert.equal(data,'hello');
  assert.deepEqual(headers,{HOST:'incorrect.invalid','X-Test':'value'});
  await assert.rejects(makeStreamRequest(origin.replace('://','://user:secret@'), {}, 1000), {code:'HTTP_POLICY_REJECTED'});
});
