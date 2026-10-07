import { HUB_DATA } from './hub.js';
const respond=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const cleanText=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
export function sourceUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||value.length>1000)return null;const allowed=['x.com','twitter.com','youtube.com','www.youtube.com','youtu.be','abs.xyz','docs.abs.xyz','portal.abs.xyz','lucanetz.substack.com','github.com','www.theblock.co','www.coindesk.com','unchainedcrypto.com'];if(!allowed.includes(u.hostname))return null;return u.toString();}catch{return null;}}
async function bodyOf(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error('Use a JSON request.'),{status:415});const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('A body is required.'),{status:400});let bytes=0,chunks=[];while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>16384){await reader.cancel();throw Object.assign(Error('The submission is too long.'),{status:413});}chunks.push(r.value);}const all=new Uint8Array(bytes);let pos=0;for(const chunk of chunks){all.set(chunk,pos);pos+=chunk.length;}try{const b=JSON.parse(new TextDecoder().decode(all));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw Object.assign(Error('Invalid submission.'),{status:400});}}
async function rateLimit(request,db,now,namespace,limit){const window=Math.floor(now/900000),ip=request.headers.get('cf-connecting-ip')||'unknown',key=await hash(namespace+':'+window+':'+ip),r=await db.prepare('INSERT INTO community_limits (key,window,attempts) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,window).first();await db.prepare('DELETE FROM community_limits WHERE window < ?').bind(window-96).run();if(Number(r?.attempts)>limit)throw Object.assign(Error('Please wait a little before submitting again.'),{status:429});}
function evidenceRow(row){return{id:row.id,sourceUrl:row.source_url,eventDate:row.event_date,title:row.title,summary:row.summary,topic:row.topic,publishedAt:row.published_at?new Date(row.published_at).toISOString():null,reviewNote:row.review_note,status:row.status};}
export async function updateFeed(db){let entries=[];if(db){try{const r=await db.prepare("SELECT * FROM evidence_submissions WHERE status='published' ORDER BY published_at DESC LIMIT 100").all();entries=r.results.map(row=>({id:row.id,publishedAt:new Date(row.published_at).toISOString(),topic:row.topic,type:'Reviewed community submission',title:row.title,body:row.summary,url:row.source_url}));}catch{}}return [...HUB_DATA.updates,...entries].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));}
export async function handleHubApi(request,env,now=Date.now()){
 const url=new URL(request.url),db=env?.DB,path=url.pathname;
 try{
  if(path==='/api/updates'&&request.method==='GET')return respond({items:await updateFeed(db),reviewedAt:HUB_DATA.reviewedAt});
  if(path==='/api/questions'&&request.method==='GET'){let counts=new Map();if(db){const rows=await db.prepare('SELECT question_id,COUNT(*) AS signals FROM question_signals GROUP BY question_id').all();counts=new Map(rows.results.map(r=>[r.question_id,Number(r.signals)]));}return respond({questions:HUB_DATA.questions.map(q=>({...q,signals:db?(counts.get(q.id)||0):null})),storageAvailable:!!db});}
  if(path==='/api/evidence'&&request.method==='GET'){if(!db)return respond({entries:[],storageAvailable:false});const rows=await db.prepare("SELECT * FROM evidence_submissions WHERE status='published' ORDER BY published_at DESC LIMIT 100").all();return respond({entries:rows.results.map(evidenceRow),storageAvailable:true});}
  if(path==='/api/voices'||/^\/api\/voices\/[0-9a-f-]{36}$/.test(path)){
   if(!db)return respond({error:'The voice wall is temporarily unavailable.'},503);
   if(request.method==='GET'&&path==='/api/voices'){const rows=await db.prepare('SELECT id,message,topic,created_at,updated_at FROM community_voices WHERE visible=1 ORDER BY created_at DESC,id DESC LIMIT 100').all();return respond({entries:rows.results.map(r=>({id:r.id,message:r.message,topic:r.topic,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()}))});}
   if(!['POST','PATCH','DELETE'].includes(request.method))return respond({error:'Method not supported.'},405);
   if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return respond({error:'Submit from this site.'},403);
   const b=await bodyOf(request);if(!/^[0-9a-f]{64}$/.test(b.editKey||''))return respond({error:'A private edit key is required.'},400);
   const keyHash=await hash(b.editKey),id=path.slice('/api/voices/'.length);
   if(request.method==='DELETE'){const r=await db.prepare('DELETE FROM community_voices WHERE id=? AND edit_hash=?').bind(id,keyHash).run();return r.meta?.changes?respond({removed:true}):respond({error:'The entry or private edit key could not be verified.'},403);}
   if(!cleanText(b.message,10,2500)||!['trust','xp','fees','communication','builders','roadmap'].includes(b.topic))return respond({error:'Choose a topic and write 10–2,500 characters.'},400);
   if(request.method==='PATCH'){const r=await db.prepare('UPDATE community_voices SET message=?,topic=?,updated_at=? WHERE id=? AND edit_hash=?').bind(b.message.trim(),b.topic,now,id,keyHash).run();return r.meta?.changes?respond({updated:true}):respond({error:'The entry or private edit key could not be verified.'},403);}
   if(path!=='/api/voices'||b.consent!==true)return respond({error:'Choose to publish your message.'},400);
   const existing=await db.prepare('SELECT id FROM community_voices WHERE edit_hash=?').bind(keyHash).first();if(existing)return respond({id:existing.id,alreadyAdded:true});
   await rateLimit(request,db,now,'voices',3);const newId=crypto.randomUUID();await db.prepare('INSERT INTO community_voices (id,message,topic,edit_hash,created_at,updated_at,visible) VALUES (?,?,?,?,?,?,1) ON CONFLICT(edit_hash) DO NOTHING').bind(newId,b.message.trim(),b.topic,keyHash,now,now).run();const entry=await db.prepare('SELECT id FROM community_voices WHERE edit_hash=?').bind(keyHash).first();return respond({id:entry.id},201);
  }
  if(path==='/api/moderation'){
   const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
   if(!env?.ADMIN_TOKEN||!token||await hash(token)!==await hash(env.ADMIN_TOKEN))return respond({error:'The private moderation token is required.'},401);
   if(!db)return respond({error:'Connect the shared database to use the review desk.'},503);
   if(request.method==='GET'){const results=await db.batch([db.prepare("SELECT * FROM evidence_submissions WHERE status='pending' ORDER BY submitted_at ASC LIMIT 100"),db.prepare("SELECT c.id,c.message,c.visible,GROUP_CONCAT(r.reason, '; ') AS reasons,'community' AS kind FROM community_contributions c JOIN community_reports r ON r.entry_id=c.id GROUP BY c.id UNION ALL SELECT v.id,v.message,v.visible,GROUP_CONCAT(r.reason, '; ') AS reasons,'voice' AS kind FROM community_voices v JOIN community_reports r ON r.entry_id=v.id GROUP BY v.id LIMIT 100")]);return respond({evidence:results[0].results.map(evidenceRow),reported:results[1].results.map(r=>({...r,visible:!!r.visible}))});}
   if(request.method!=='POST')return respond({error:'Method not supported.'},405);
   if(request.headers.get('origin')!==url.origin)return respond({error:'Submit from this site.'},403);
   const b=await bodyOf(request);if(!/^[0-9a-f-]{36}$/.test(b.id||''))return respond({error:'Invalid entry.'},400);
   if(b.kind==='evidence'&&['published','rejected'].includes(b.status)&&cleanText(b.reviewNote??'',0,500)){
    const changed=await db.prepare("UPDATE evidence_submissions SET status=?,review_note=?,published_at=? WHERE id=? AND status='pending'").bind(b.status,(b.reviewNote||'').trim(),b.status==='published'?now:null,b.id).run();return changed.meta?.changes?respond({updated:true}):respond({error:'This submission is missing or already reviewed.'},409);
   }
   if(['community','voice'].includes(b.kind)&&typeof b.visible==='boolean'){const changed=await db.prepare('UPDATE '+(b.kind==='voice'?'community_voices':'community_contributions')+' SET visible=?,updated_at=? WHERE id=?').bind(b.visible?1:0,now,b.id).run();return changed.meta?.changes?respond({updated:true}):respond({error:'Entry not found.'},404);}
   return respond({error:'Choose a valid review action.'},400);
  }
  if(!['/api/evidence','/api/questions','/api/reports'].includes(path))return respond({error:'Not found.'},404);
  if(request.method!=='POST')return respond({error:'Method not supported.'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return respond({error:'Submit from this site.'},403);
  if(!db)return respond({error:'Shared posting is not available yet. Your receipt and the public record still work.'},503);
  const b=await bodyOf(request);
  if(path==='/api/evidence'){
   const source=sourceUrl(b.sourceUrl),eventTime=Date.parse((b.eventDate||'')+'T00:00:00Z');
   if(b.consent!==true||!source||!cleanText(b.title,5,120)||!cleanText(b.summary,15,2000)||!Object.hasOwn(HUB_DATA.topics,b.topic)||!/^\d{4}-\d{2}-\d{2}$/.test(b.eventDate||'')||!Number.isFinite(eventTime)||new Date(eventTime).toISOString().slice(0,10)!==b.eventDate||eventTime>now||eventTime<Date.parse('2023-01-01T00:00:00Z'))return respond({error:'Add a public source, a valid past date, a title, your summary, a topic, and your consent.'},400);
   await rateLimit(request,db,now,'evidence',5);const id=crypto.randomUUID();await db.prepare('INSERT INTO evidence_submissions (id,source_url,event_date,title,summary,topic,status,submitted_at,review_note) VALUES (?,?,?,?,?,?,?, ?,?)').bind(id,source,b.eventDate,b.title.trim(),b.summary.trim(),b.topic,'pending',now,'').run();return respond({id,status:'pending'},201);
  }
  if(path==='/api/questions'){
   if(!HUB_DATA.questions.some(q=>q.id===b.questionId)||!/^[0-9a-f]{64}$/.test(b.signalKey||''))return respond({error:'Choose a valid question.'},400);
   await rateLimit(request,db,now,'signals',30);const key=await hash(b.questionId+':'+b.signalKey);await db.prepare('INSERT INTO question_signals (key,question_id,created_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(key,b.questionId,now).run();const count=await db.prepare('SELECT COUNT(*) AS signals FROM question_signals WHERE question_id=?').bind(b.questionId).first();return respond({signals:Number(count.signals)});
  }
  if(path==='/api/reports'){
   if(!/^[0-9a-f-]{36}$/.test(b.entryId||'')||!/^[0-9a-f]{64}$/.test(b.signalKey||'')||!cleanText(b.reason,3,300))return respond({error:'Describe what needs moderator review in 3–300 characters.'},400);
   if(!await db.prepare('SELECT id FROM community_contributions WHERE id=? UNION ALL SELECT id FROM community_voices WHERE id=?').bind(b.entryId,b.entryId).first())return respond({error:'Entry not found.'},404);
   await rateLimit(request,db,now,'reports',10);const key=await hash(b.entryId+':'+b.signalKey);await db.prepare('INSERT INTO community_reports (key,entry_id,reason,created_at) VALUES (?,?,?,?) ON CONFLICT(key) DO NOTHING').bind(key,b.entryId,b.reason.trim(),now).run();return respond({received:true},201);
  }
 }catch(error){if(error.status)return respond({error:error.message},error.status);console.warn('Hub request unavailable');return respond({error:'This request couldn’t be completed right now. Please try again.'},503);}
}
const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function rssResponse(request,env){const origin=env?.SITE_URL||new URL(request.url).origin,items=await updateFeed(env?.DB);return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Abstract Accountability</title><link>${xml(origin+'/updates')}</link><description>Statements, community receipts, and unanswered questions.</description>${items.map(i=>`<item><guid isPermaLink="false">${xml(i.id)}</guid><title>${xml(i.title)}</title><link>${xml(i.url)}</link><description>${xml(i.type+': '+i.body)}</description><pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate><category>${xml(i.topic)}</category></item>`).join('')}</channel></rss>`,{headers:{'content-type':'application/rss+xml; charset=utf-8','cache-control':'public,max-age=60','x-content-type-options':'nosniff'}});}
export function sitemapResponse(request,env){const origin=env?.SITE_URL||new URL(request.url).origin;return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/record','/community','/updates','/action','/evidence','/method'].map(p=>`<url><loc>${xml(origin+p)}</loc></url>`).join('')}</urlset>`,{headers:{'content-type':'application/xml; charset=utf-8'}});}
