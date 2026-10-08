import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {receiptShareText,shareReceipt} from '../worker/sharing.js';
const file=new File(['PNG'],'abstract-time-receipt.png',{type:'image/png'});
const data={file,text:receiptShareText(616,'https://abstract-accountability.vercel.app')};
test('X composer link preserves text and opens one isolated tab',()=>{
  const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
  const fn=source.match(/function openTextDraft\(text\) \{[\s\S]*?\n\}/)[0];
  const events=[],link={click(){events.push('click')},remove(){events.push('remove')}};
  const document={createElement(tag){assert.equal(tag,'a');return link},body:{append(item){assert.equal(item,link);events.push('append')}}};
  vm.runInNewContext(fn+'; openTextDraft(text);',{URL,URLSearchParams,document,text:data.text});
  const draft=new URL(link.href);
  assert.equal(draft.origin,'https://x.com');assert.equal(draft.pathname,'/intent/post');
  assert.equal(draft.searchParams.get('text'),data.text);
  assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
  assert.deepEqual(events,['append','click','remove']);
});
test('Post on X opens the composer before downloading the PNG',async()=>{
  const calls=[];assert.equal(await shareReceipt(data,{}, {download:f=>calls.push(['download',f]),openDraft:t=>calls.push(['open',t])}),'downloaded');
  assert.deepEqual(calls,[['open',data.text],['download',file]]);
});
test('Post on X opens the composer even when PNG export is unavailable',async()=>{
  const calls=[];assert.equal(await shareReceipt({text:data.text}, {}, {download(){assert.fail()},openDraft:t=>calls.push(t)}),'text-only');
  assert.deepEqual(calls,[data.text]);
});
test('X copy attributes the reported loss and invites a first-interaction lookup',()=>{
  assert(data.text.includes('@LucaNetz'));assert(data.text.includes('@pudgypenguins'));assert(data.text.includes('@AbstractChain'));
  assert(data.text.endsWith('Our prime years > Igloo’s reported 8-figure loss.'));
  assert(data.text.includes('Find out your first txn & days commited to Abstract👇\nhttps://abstract-accountability.vercel.app\n\nOur prime years > Igloo’s reported 8-figure loss.'));
  assert(!data.text.includes('hours worked'));
});
