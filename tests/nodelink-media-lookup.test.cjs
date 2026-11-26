'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {once}=require('node:events');
const {Rest,NodeLinkAdapter,LavalinkAdapter,FeatureUnavailableError}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const id='12345678-1234-1234-1234-123456789abc', code='USABC1234567';
test('explicit media lookups use the exact NodeLink route and validate provider identity',async t=>{
 const {node}=createPlayer(t);node.isNodeLink=true;node.backend=new NodeLinkAdapter('test',new Set());
 let requests=0,status=200;let body={provider:'musicbrainz',isrc:code,recordings:[]};
 const server=http.createServer((req,res)=>{requests++;assert.equal(req.method,'GET');assert.equal(req.headers.authorization,'test-only');const u=new URL(req.url,'http://localhost');assert.equal(u.pathname,'/v4/loadmedia');assert.equal(u.searchParams.get('isrc'),code);res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());node.port=server.address().port;
 const rest=new Rest(node);assert.deepEqual(await rest.loadMedia({isrc:'US-ABC-12-34567'}),body);
 for(const value of [{},{isrc:code,artistMbid:id},{isrc:'bad'},{url:'https://example.com'}])await assert.rejects(rest.loadMedia(value),TypeError);
 assert.equal(requests,1);body={provider:'musicbrainz',isrc:'GBABC1234567',recordings:[]};await assert.rejects(rest.loadMedia({isrc:code}),/Invalid media lookup/);
 status=503;body={error:'MusicBrainz disabled'};await assert.rejects(rest.loadMedia({isrc:code}),/503/);assert.equal(node.backend.featureStatus('loadmedia'),'available');
 node.isNodeLink=false;node.backend=new LavalinkAdapter('4.2.2',new Set());await assert.rejects(rest.loadMedia({isrc:code}),FeatureUnavailableError);assert.equal(requests,3);
});
test('Fanart and MusicBrainz contracts require exact IDs and safe asset hosts',()=>{
 const {validateMediaLookup}=require('../dist/src/backends/NodeLinkMediaLookup.js');
 const work={provider:'musicbrainz',mbid:id,title:'Work',credits:[],workMbids:[]};
 assert.deepEqual(validateMediaLookup(work,'workMbid',id),work);
 const artwork={provider:'fanart.tv',mbid:id,name:'Artist',artwork:[{url:'https://assets.fanart.tv/a.jpg'}],banners:[],backgrounds:[],logos:[]};
 assert.equal(validateMediaLookup(artwork,'artistMbid',id).artwork[0].url,artwork.artwork[0].url);
 assert.throws(()=>validateMediaLookup({...artwork,artwork:[{url:'https://evil.test/a'}]},'artistMbid',id),/Invalid media lookup/);
});
