import { createClient } from '@libsql/client';
export function adaptClient(client){
  const output=r=>({results:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),meta:{changes:r.rowsAffected}});
  return {client,prepare(sql){let args=[];return {get statement(){return{sql,args}},bind(...values){args=values;return this},async first(){const r=output(await client.execute({sql,args}));return r.results[0]||null},async all(){return output(await client.execute({sql,args}))},async run(){return output(await client.execute({sql,args}))}}},async batch(statements){return(await client.batch(statements.map(s=>s.statement),'write')).map(output)}};
}
let cached=null,cachedUrl=null;
export function getDatabase(env=process.env){
  const url=env.TURSO_DATABASE_URL;
  if(!url)return null;
  if(env.VERCEL&&url.startsWith('file:'))throw Error('A local file database cannot persist on Vercel. Use your Turso cloud URL.');
  if(!cached||cachedUrl!==url){cached=adaptClient(createClient({url,authToken:env.TURSO_AUTH_TOKEN}));cachedUrl=url;}
  return cached;
}
