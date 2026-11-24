const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('master catalog, backlog and modernization retain unique original IDs',()=>{
 const features=[...read('docs/feature-contract-matrix.md').matchAll(/^\| `(F\d\d)` \|/gm)].map(x=>x[1]);
 assert.deepEqual(features,Array.from({length:27},(_,i)=>'F'+String(i+1).padStart(2,'0')));
 const backlog=[...read('docs/master-plan-reconciliation.md').matchAll(/^\| (P\d-\d{3}) \|/gm)].map(x=>x[1]);
 assert.equal(backlog.length,38);assert.equal(new Set(backlog).size,38);
 assert.deepEqual(backlog.map(id=>Number(id.split('-')[1])),Array.from({length:38},(_,i)=>i+1));
 const chapters=[...read('docs/modernization-status.md').matchAll(/^\| (\d+) — /gm)].map(x=>Number(x[1]));
 assert.deepEqual(chapters,Array.from({length:24},(_,i)=>i));
});
test('all ten mandatory workstreams link to concrete files and existing catalog/backlog IDs',()=>{
 const matrix=read('docs/plan-acceptance-matrix.md');
 const rows=matrix.split('\n').filter(line=>/^\| [A-J] \|/.test(line));
 assert.deepEqual(rows.map(row=>row.split('|')[1].trim()),Array.from('ABCDEFGHIJ'));
 const f=new Set(),p=new Set();
 for(const row of rows){
  const cells=row.split('|').map(s=>s.trim());
  for(const id of cells[3].split(' '))f.add(id);
  for(const id of cells[4].split(' '))p.add(id);
  for(const cell of cells.slice(5,8)){
   const refs=[...cell.matchAll(/`([^`]+)`/g)].map(m=>m[1]);assert.ok(refs.length>=1);
   for(const ref of refs)assert.ok(fs.statSync(path.join(root,ref)).isFile(),ref);
  }
  assert.ok(cells[8]);
 }
 const knownF=[...read('docs/feature-contract-matrix.md').matchAll(/^\| `(F\d\d)` \|/gm)].map(x=>x[1]);
 const knownP=[...read('docs/master-plan-reconciliation.md').matchAll(/^\| (P\d-\d{3}) \|/gm)].map(x=>x[1]);
 for(const id of f)assert.ok(knownF.includes(id),id);
 for(const id of p)assert.ok(knownP.includes(id),id);
 assert.deepEqual([...f].sort(),knownF.slice().sort());
 assert.deepEqual([...p].sort(),knownP.slice().sort());
 const chapters=[...matrix.matchAll(/^\| (\d+) \| [A-J ]+ \|$/gm)].map(x=>Number(x[1]));
 assert.deepEqual(chapters,Array.from({length:24},(_,i)=>i));
});
