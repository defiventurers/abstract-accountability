import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import app,{makeCardSvg,NOTICE_AT} from '../worker/index.js';
import {receiptExportHtml,RECORD_DATA} from '../worker/product.js';
import {HUB_DATA} from '../worker/hub.js';
import {handleHubApi} from '../worker/hub-api.js';
import {adaptClient} from '../lib/database.js';
import {migrate} from '../scripts/migrate.mjs';

const now=Date.parse('2026-10-09T00:00:00Z'),key='a'.repeat(64);
const first={timestamp:'2025-01-28T22:37:38Z',network:'mainnet',hash:'0x'+'b'.repeat(64),explorerUrl:'https://abscan.org/tx/0x'+'b'.repeat(64)};
const receipt={address:'0x'+'c'.repeat(40),earliest:first,generatedAt:'2026-10-08T21:00:00Z',partial:true,editKey:'DO-NOT-EXPORT',networks:[{network:'mainnet',first,status:'found'},{network:'testnet',first:null,status:'unavailable'}]};
function request(path,method='GET',body,origin='https://test'){return new Request('https://test'+path,{method,headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.4'},...(body?{body:JSON.stringify(body)}:{})});}
async function database(t){const dir=await mkdtemp(join(tmpdir(),'aa-product-')),client=createClient({url:'file:'+join(dir,'test.db')}),db=adaptClient(client);await migrate(db);t.after(async()=>{client.close();await rm(dir,{recursive:true,force:true});});return db;}
async function call(db,path,method='GET',body,origin){const r=await handleHubApi(request(path,method,body,origin),{DB:db,ADMIN_TOKEN:'a'.repeat(40)},now);return{status:r.status,body:await r.json()};}

test('Answer Watch links are permanent, valid, sourced and safe on every page',async()=>{
  for(const path of ['/answers','/exit',...HUB_DATA.questions.map(q=>'/answers/'+q.id)]){
    const r=await app.fetch(request(path),{});assert.equal(r.status,200);
    const html=await r.text();new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.match(r.headers.get('content-security-policy'),/script-src 'sha256-/);
    assert(html.includes('Answer Watch'));assert(html.includes('href="'+path+'"')||html.includes('content="https://test'+path+'"'));
    assert.equal((await app.fetch(request(path,'HEAD'),{})).body,null);
  }
  assert.equal((await app.fetch(request('/answers/unknown'),{})).status,404);
  assert.equal((await app.fetch(request('/answers/xp-purpose','POST',{}),{})).status,405);
  const q=HUB_DATA.questions.find(q=>q.id==='xp-purpose');assert.equal(q.status,'Follow-up needed');assert(q.sources.length>0);
  assert.equal(RECORD_DATA.milestones[0].kind,'Evidence wanted');
});

test('receipt pack keeps UTC endpoints, coverage and references without publishing or leaking private edit keys',()=>{
  const html=receiptExportHtml(receipt,NOTICE_AT,'I came for rewards.',RECORD_DATA.sourceLinks);
  assert(html.includes('615 whole calendar days'));assert(html.includes('14,760 calendar hours'));
  assert(html.includes(NOTICE_AT));assert(html.includes(first.hash));assert(html.includes('testnet'));assert(html.includes('unavailable'));
  assert(html.includes('Some network history was unavailable'));assert(!html.includes('DO-NOT-EXPORT'));
  assert(!html.includes('<script'));assert(html.includes("default-src 'none'"));
});

test('local export escapes hostile text and filenames and rejects executable URLs and disguised SVG data',()=>{
  const html=receiptExportHtml(receipt,NOTICE_AT,'<script>alert(1)</script> & "my story"',[['<img onerror=alert(1)>','javascript:alert(1)']],[{name:'"><script>alert(2)</script>',dataUrl:'data:image/png;base64,AAAA'},{name:'bad.svg',dataUrl:'data:image/svg+xml;base64,AAAA'}]);
  assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));assert(!html.includes('data:image/svg+xml'));
  assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img onerror'));assert(html.includes('data:image/png;base64,AAAA'));
  assert.throws(()=>receiptExportHtml({...receipt,earliest:{...first,timestamp:'invalid'}},NOTICE_AT,'',[]));
});

test('clear card keeps first transaction date, endpoint, calendar conversion and bold ending across tones',()=>{
  for(const tone of ['accountability','receipts','quest']){
    const svg=makeCardSvg({first,address:receipt.address,until:NOTICE_AT,tone,theme:'mint',partial:true,tag:true});
    assert(svg.includes('28 Jan 2025'));assert(svg.includes('615 days'));assert(svg.includes('CALENDAR DAYS TO THE WIND-DOWN NOTICE'));
    assert(svg.includes('14,760 calendar hours'));assert(svg.includes('font-weight="800" letter-spacing="-.5">Never bite a hand that feeds you.'));
    assert(svg.includes('@LucaNetz + @AbstractChain'));
  }
  assert(makeCardSvg({first,until:receipt.generatedAt,tag:true}).includes('CALENDAR DAYS TO THE LOOKUP DATE'));
  assert(makeCardSvg({first:{...first,timestamp:'2026-10-07T00:00:00Z'},until:NOTICE_AT}).includes('After notice'));
});

test('topic-filtered voices and reactions persist, deduplicate, respect visibility and never inflate ledger days',async t=>{
  const db=await database(t);
  const a=await call(db,'/api/voices','POST',{message:'I need a clear migration route and a sourced answer.',topic:'migration',consent:true,editKey:key});
  const id=a.body.id;assert.equal(a.status,201);
  await call(db,'/api/voices','POST',{message:'I want a clear explanation for the XP expectations.',topic:'xp',consent:true,editKey:'b'.repeat(64)});
  assert.equal((await call(db,'/api/voices?topic=migration')).body.entries.length,1);
  assert.equal((await call(db,'/api/voices?topic=unknown')).status,400);
  const body={entryId:id,kind:'same',signalKey:'c'.repeat(64)};
  assert.equal((await call(db,'/api/voice-reactions','POST',body,'https://evil')).status,403);
  for(let n=0;n<3;n++)assert.equal((await call(db,'/api/voice-reactions','POST',body)).body.count,1);
  assert.equal((await call(db,'/api/voice-reactions','POST',{...body,kind:'helpful'})).body.count,1);
  assert.equal((await call(db,'/api/voice-reactions','POST',{...body,kind:'made-up'})).status,400);
  const voice=(await call(db,'/api/voices?topic=migration')).body.entries[0];assert.deepEqual(voice.reactions,{same:1,helpful:1});
  const totals=await(await app.fetch(request('/api/community'),{DB:db})).json();assert.equal(totals.stats.days,0);
  await db.prepare('UPDATE community_voices SET visible=0 WHERE id=?').bind(id).run();
  assert.equal((await call(db,'/api/voice-reactions','POST',body)).status,404);
  assert.equal((await call(db,'/api/voices?topic=migration')).body.entries.length,0);
  assert.equal((await call(db,'/api/voices/'+id,'DELETE',{editKey:'d'.repeat(64)})).status,403);
  assert.equal((await call(db,'/api/voices/'+id,'DELETE',{editKey:key})).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM voice_reactions WHERE entry_id=?').bind(id).first()).n,0);
});

test('question-linked source categories are validated and remain private until reviewed',async t=>{
  const db=await database(t),body={sourceUrl:RECORD_DATA.sourceLinks[0][1],eventDate:'2026-10-06',title:'A dated public statement',summary:'The announcement provides a date. The decision date remains an open question.',topic:'communication',consent:true,category:'response',questionId:'shutdown-timeline'};
  const a=await call(db,'/api/evidence','POST',body);assert.equal(a.status,201);
  assert.equal((await call(db,'/api/evidence?question=shutdown-timeline')).body.entries.length,0);
  assert.equal((await call(db,'/api/evidence','POST',{...body,category:'proven fraud'})).status,400);
  assert.equal((await call(db,'/api/evidence','POST',{...body,questionId:'invented'})).status,400);
  assert.equal((await call(db,'/api/evidence?question=unknown')).status,400);
  await db.prepare("UPDATE evidence_submissions SET status='published',published_at=? WHERE id=?").bind(now,a.body.id).run();
  const published=(await call(db,'/api/evidence?question=shutdown-timeline')).body.entries;assert.equal(published.length,1);
  assert.equal(published[0].category,'response');assert.equal(published[0].questionId,'shutdown-timeline');
  assert.equal((await call(db,'/api/evidence?question=xp-purpose')).body.entries.length,0);
});
