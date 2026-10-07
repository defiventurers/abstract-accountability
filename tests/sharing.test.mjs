import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptShareText,shareReceipt} from '../worker/sharing.js';
const file=new File(['PNG'],'abstract-time-receipt.png',{type:'image/png'});
const data={file,text:receiptShareText(616,'https://abstract-accountability.vercel.app')};
test('native sharing receives the PNG and copy during the click, without an intervening await',async()=>{
  let called=false,payload;const capability={canShare:({files})=>files[0]===file,share:value=>{called=true;payload=value;return Promise.resolve();}};
  const result=shareReceipt(data,capability,{download(){assert.fail()},openDraft(){assert.fail()}});
  assert(called);assert.equal(payload.files[0].type,'image/png');assert.equal(payload.text,data.text);assert.equal(await result,'shared');
});
test('desktop fallback downloads the PNG and opens only an editable text draft',async()=>{
  const calls=[];assert.equal(await shareReceipt(data,{}, {download:f=>calls.push(f),openDraft:t=>calls.push(t)}),'downloaded');
  assert.equal(calls[0],file);assert.equal(calls[1],data.text);
});
test('cancelling the share sheet does not open X, download, or publish anything',async()=>{
  const capabilities={canShare:()=>true,share:async()=>{throw Object.assign(Error(),{name:'AbortError'})}};
  assert.equal(await shareReceipt(data,capabilities,{download(){assert.fail()},openDraft(){assert.fail()}}),'cancelled');
});
test('a rejected native share offers a second user action instead of opening a blocked popup',async()=>{
  assert.equal(await shareReceipt(data,{canShare:()=>true,share:async()=>{throw Error('Unsupported target')}},{download(){assert.fail()},openDraft(){assert.fail()}}),'failed');
});
test('X copy attributes the reported loss and invites a first-interaction lookup',()=>{
  assert(data.text.includes('@LucaNetz'));assert(data.text.includes('@pudgypenguins'));assert(data.text.includes('@AbstractChain'));
  assert(data.text.includes('Igloo reports an eight-figure loss.'));assert(data.text.endsWith('Our prime years cost more—and we can’t buy them back.'));
  assert(data.text.includes('first day + days you gave'));assert(data.text.includes('https://abstract-accountability.vercel.app'));assert(!data.text.includes('hours worked'));
});
