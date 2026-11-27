const test=require('node:test'),assert=require('node:assert/strict');
const {digest}=require('../scripts/audit-plugin-artifact-candidates.cjs');
const {createHash}=require('node:crypto');
const bytes=Buffer.from([80,75,3,4,1,2,3]);
test('candidate auditor hashes data without extraction and rejects origin, size, non-ZIP',async()=>{
 const hash=createHash('sha256').update(bytes).digest('hex');
 assert.deepEqual(await digest('https://github.com/example/file',bytes.length,async()=>new Response(bytes)),{sha256:hash,bytes:bytes.length});
 await assert.rejects(digest('https://example.com/a',undefined,async()=>new Response(bytes)),{code:'REJECTED_ORIGIN'});
 await assert.rejects(digest('https://github.com/example/file',99,async()=>new Response(bytes)),{code:'SIZE_MISMATCH'});
 await assert.rejects(digest('https://github.com/example/file',undefined,async()=>new Response('not a jar')),{code:'NOT_ZIP'});
 await assert.rejects(digest('https://github.com/example/file',undefined,async()=>new Response(null,{status:302,headers:{location:'https://evil.example/a'}})),{code:'REJECTED_ORIGIN'});
});
