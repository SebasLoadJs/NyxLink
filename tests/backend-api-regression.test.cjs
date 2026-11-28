const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const baseline=require('./fixtures/v5.3-public-api-baseline.json');
const native=require('./fixtures/nodelink-native-route-baseline.json');
const {BackendDetector}=require('../dist');
const docs=fs.readFileSync(path.resolve(__dirname,'../docs/api-generated.md'),'utf8');

test('generated API reference retains all stable 5.3 public declaration names and core class method names',()=>{
 const symbols=new Set([...docs.matchAll(/^## (.+)$/gm)].map(m=>m[1]));
 for(const name of baseline.symbols)assert.ok(symbols.has(name),'Removed public declaration: '+name);
 for(const [name,methods] of Object.entries(baseline.methods)){
  const start=docs.indexOf('## '+name+'\n'),end=docs.indexOf('\n## ',start+1);
  const section=docs.slice(start,end<0?undefined:end);
  const current=new Set([...section.matchAll(/^    (?:static )?(?:get |set )?([A-Za-z_$][\w$]*)\s*(?:<[^;]*?>)?\(/gm)].map(m=>m[1]));
  for(const method of methods)assert.ok(current.has(method),'Removed public method: '+name+'.'+method);
 }
});
test('NodeLink native and proposed extension route catalog retains exact wire methods and paths',()=>{
 const nl=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
 const ll=BackendDetector.detect({version:{semver:'4.2.2'}});
 const params={sessionId:'session',guildId:'guild',groupId:'group',mixId:'layer'};
 for(const {operation,method,path,transport} of native.routes){
  const route=nl.resolveExtension(operation,params);
  assert.deepEqual({method:route.method,path:route.path,transport:route.transport},{method,path,transport},operation);
  assert.throws(()=>ll.resolveExtension(operation,params),{code:'FEATURE_UNAVAILABLE'});
 }
});

test('stable 5.3 declaration text remains an ordered subsequence of current public declarations',()=>{
 const stable=require('./fixtures/v5.3-public-declarations.json');
 assert.equal(stable.baseline,baseline.baseline);
 const current=Object.fromEntries([...docs.matchAll(/^## (.+)\n[\s\S]*?^```ts\n([\s\S]*?)^```/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(Object.keys(stable.declarations).sort(),[...baseline.symbols].sort());
 const exceptions={Rest:{'    exchangeYoutubeOAuth(refreshToken: string): Promise<any | null>;':'    exchangeYoutubeOAuth(refreshToken: string, options?: BackendInfoOptions): Promise<any | null>;'}};
 for(const [name,old] of Object.entries(stable.declarations)){
  assert.ok(current[name],'Removed declaration: '+name);
  const lines=current[name].trimEnd().split('\n');let cursor=0;
  for(const line of old.trimEnd().split('\n')){
   const expected=exceptions[name]?.[line]??line;
   while(cursor<lines.length&&lines[cursor]!==expected)cursor++;
   assert.ok(cursor<lines.length,'Changed stable declaration '+name+': '+line);
   cursor++;
  }
 }
});
