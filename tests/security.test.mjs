import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import app from '../worker/index.js';
import {handleHubApi} from '../worker/hub-api.js';
import {readJson, rateLimit, equalSecret, validUuid} from '../worker/security.js';
import {routedRequest} from '../api/index.js';
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  return {prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){return {meta:{changes:sqlite.prepare(sql).run(...values).changes}}}}}};
}
const request=(path,method='GET',body,headers={})=>new Request('https://security.test'+path,{method,headers:{origin:'https://security.test','cf-connecting-ip':'192.0.2.80','content-type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
test('security headers protect pages, API errors, missing routes, and moderation responses',async()=>{
  for(const path of ['/','/community','/moderate','/api/voices','/unknown']){
    const r=await app.fetch(request(path),{});
    assert.equal(r.headers.get('x-frame-options'),'DENY');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert(r.headers.get('permissions-policy').includes('web-share=(self)'));
    assert(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    if(r.headers.get('content-type')?.startsWith('text/html')) {
      const html=await r.text(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
      const expected=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script))).toString('base64');
      const csp=r.headers.get('content-security-policy');
      assert(csp.includes("'sha256-"+expected+"'"));
      assert(!csp.split(';').find(s=>s.trim().startsWith('script-src ')).includes('unsafe-inline'));
    }
  }
});
test('body parser rejects MIME tricks, arrays, invalid UTF-8 and streamed oversized bodies',async()=>{
  await assert.rejects(readJson(request('/','POST','{}',{'content-type':'application/jsonevil'})),{status:415});
  for(const body of ['[]','null','bad'])await assert.rejects(readJson(request('/','POST',body)),{status:400});
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(9000));c.enqueue(new Uint8Array(9000));c.close();}});
  await assert.rejects(readJson(new Request('https://security.test/',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'})),{status:413});
  await assert.rejects(readJson(new Request('https://security.test/',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([123,34,97,34,58,34,255,34,125])})),{status:400});
});
test('distributed limits survive separate callers and reset at the next window',async t=>{
  const db=database(t),now=1791412800000,r=request('/api/lookup');
  for(let i=0;i<3;i++)await rateLimit(r,db,now,'test-lookup',3);
  await assert.rejects(rateLimit(r,db,now,'test-lookup',3),{status:429});
  await rateLimit(r,db,now+900000,'test-lookup',3);
  await rateLimit(request('/api/lookup','GET',undefined,{'cf-connecting-ip':'192.0.2.81'}),db,now,'test-lookup',3);
});
test('forged origin and edit keys cannot change voices; repeated key guessing is throttled',async t=>{
  const db=database(t),env={DB:db},now=1791412800000,key='a'.repeat(64),body={editKey:key,consent:true,topic:'trust',message:'This is a security test voice.'};
  const created=await handleHubApi(request('/api/voices','POST',body),env,now),id=(await created.json()).id,path='/api/voices/'+id;
  assert.equal((await handleHubApi(request(path,'DELETE',{editKey:key},{origin:'https://attacker.test'}),env,now)).status,403);
  for(let i=0;i<30;i++)assert.equal((await handleHubApi(request(path,'DELETE',{editKey:'b'.repeat(64)}),env,now)).status,403);
  assert.equal((await handleHubApi(request(path,'DELETE',{editKey:key}),env,now)).status,429);
  assert.equal((await handleHubApi(request('/api/voices'),env,now)).status,200);
  assert.equal((await handleHubApi(request(path,'DELETE',{editKey:key}),env,now+900000)).status,200);
});
test('weak moderator configuration and repeated token guessing fail closed',async t=>{
  const db=database(t),now=1791412800000;
  assert.equal((await handleHubApi(request('/api/moderation','GET',undefined,{authorization:'Bearer weak'}),{DB:db,ADMIN_TOKEN:'weak'},now)).status,401);
  for(let i=1;i<60;i++)assert.equal((await handleHubApi(request('/api/moderation'),{DB:db,ADMIN_TOKEN:'a'.repeat(64)},now)).status,401);
  assert.equal((await handleHubApi(request('/api/moderation'),{DB:db,ADMIN_TOKEN:'a'.repeat(64)},now)).status,429);
  assert(await equalSecret('same','same'));assert(!(await equalSecret('same','different')));
});
test('reserved rewrite parameters cannot smuggle traversal, duplicates, or query fragments',()=>{
  for(const path of ['?__path=api/voices&__path=moderate','?__path=../moderate','?__path=api%2Fvoices%3Fx=1','?__path=https%3A%2F%2Fevil.test'])assert.throws(()=>routedRequest(new Request('https://security.test/api/index'+path)),{status:400});
  const r=routedRequest(request('/api/index?__path=api/voices','GET',undefined,{'cf-connecting-ip':'forged','oai-authenticated-user-id':'forged'}));
  assert.equal(r.headers.get('cf-connecting-ip'),null);assert.equal(r.headers.get('oai-authenticated-user-id'),null);
  assert(!validUuid('-'.repeat(36)));assert(validUuid(crypto.randomUUID()));
});
test('lookup abuse is stopped before upstream access even without configured storage',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No upstream expected');};
  try{
    for(let i=0;i<60;i++)assert.equal((await app.fetch(request('/api/lookup?query=0xinvalid'),{})).status,400);
    assert.equal((await app.fetch(request('/api/lookup?query=defiouza'),{})).status,429);assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
