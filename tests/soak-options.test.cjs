const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, run } = require('../scripts/test-soak.cjs');

test('long soak remains an explicitly armed 24..72-hour operator action', () => {
  assert.deepEqual(parseArguments([]), { hours: 24, seconds: 86400, armed: false });
  assert.deepEqual(parseArguments(['--hours', '72', '--armed']), { hours: 72, seconds: 259200, armed: true });
  for (const args of [['--hours', '23'], ['--hours', '73'], ['--hours', 'NaN'], ['--hours', '--armed'], ['--armed', '--check'], ['--unknown'], ['--armed', '--armed']]) assert.throws(() => parseArguments(args), TypeError);
});

test('soak configuration checks do not start containers or the worker process', async () => {
  const result = await run(parseArguments(['--hours', '48', '--check']));
  assert.equal(result.networkActionsPerformed, false); assert.equal(result.seconds, 172800); assert.equal(result.armed, false);
});

test('dedicated soak reports are isolated by a bounded CI run/attempt identity',()=>{
 const {soakDirectory}=require('../scripts/test-soak.cjs');const path=require('node:path');const base=path.resolve('.runtime/soak');
 assert.equal(soakDirectory(base),base);assert.equal(soakDirectory(base,'ci-123-2'),path.join(base,'ci-123-2'));
 for(const value of ['',null,'../escape','ci-123-0','ci-123-2/other','ci-123-2.json','ci-0001-2','ci-123456789012345678901-2'])assert.throws(()=>soakDirectory(base,value),TypeError);
});
