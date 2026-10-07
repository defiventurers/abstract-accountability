import app from '../worker/index.js';
import { getDatabase } from '../lib/database.js';
import { fault, secureResponse } from '../worker/security.js';
export function routedRequest(request){
  const url=new URL(request.url),path=url.searchParams.get('__path');
  if(path!==null){
    if(url.searchParams.getAll('__path').length!==1 || !/^[a-z0-9/._-]{0,160}$/i.test(path) || path.includes('..') || path.includes('//')) throw fault('Invalid route.',400);
    url.searchParams.delete('__path');url.pathname='/'+path.replace(/^\/+/, '');
  }
  const headers=new Headers(request.headers);
  // The adapter forwards Vercel's trusted client IP; the application never trusts a caller's CF header here.
  headers.delete('cf-connecting-ip');headers.delete('oai-authenticated-user-id');
  const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
  if(ip)headers.set('cf-connecting-ip',ip);
  return new Request(url, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half'});
}
export default {async fetch(request){
  try{return await app.fetch(routedRequest(request),{DB:getDatabase(),ADMIN_TOKEN:process.env.ADMIN_TOKEN,SITE_URL:process.env.SITE_URL},{});}
  catch(error){return secureResponse(Response.json({error:error.status?error.message:'The service is temporarily unavailable.'},{status:error.status||503,headers:{'cache-control':'no-store'}}));}
}};
