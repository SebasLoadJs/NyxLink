const test = require('node:test');
const assert = require('node:assert/strict');
const { Local, Manager } = require('../dist');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('an uninitialized local adapter can shut down without writing files', async () => {
  const local = new Local();
  await local.shutdown();
});

test('a snapshot read I/O failure is not classified as corrupt JSON', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyx-storage-boundary-'));
  t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const manager = new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}]});
  manager.clientId = '123456789012345678';
  const snapshot = path.join(directory, 'data.'+manager.clientId+'.json');
  await fs.mkdir(snapshot);
  const local = new Local();
  await assert.rejects(local.init(manager,{path:directory}), {code:'EISDIR'});
  await assert.rejects(local.set('value',42), /not initialized/);
  await local.shutdown();
  assert.deepEqual(await fs.readdir(directory), [path.basename(snapshot)]);
});


test('a failure reading WAL does not replace the loaded snapshot or truncate the WAL on shutdown', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'nyx-storage-failed-wal-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const manager = new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}]});
  manager.clientId='123456789012345678';
  const file=path.join(directory,'data.'+manager.clientId+'.json');
  const wal=path.join(directory,'data.'+manager.clientId+'.wal');
  const original=JSON.stringify({data:{saved:'keep me'}},null,2);
  await fs.writeFile(file,original);
  await fs.mkdir(wal);
  const local=new Local();
  await assert.rejects(local.init(manager,{path:directory}), {code:'EISDIR'});
  await local.shutdown();
  assert.equal(await fs.readFile(file,'utf8'),original);
  assert.equal((await fs.stat(wal)).isDirectory(),true);
});
