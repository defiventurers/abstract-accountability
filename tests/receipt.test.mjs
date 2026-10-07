import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validAddress, elapsed, earliestRecord, lookupNetwork, handleLookup, makeCardSvg, NOTICE_AT } from '../worker/index.js';

const address = '0x1fd596c130b90c93f5d9c09008b75ae81476cac0';
const other = '0x' + '2'.repeat(40);
const hash = '0x' + 'a'.repeat(64);
const blockHash = '0x' + 'b'.repeat(64);
const now = Date.parse('2026-10-07T12:00:00.000Z');
const row = { hash, blockNumber:'20', timeStamp:'1737982800', from:address, to:other, isError:'0' };
function provider({ rows = [row], apiError, rpcError, chain = 2741, timestamp = row.timeStamp, included = true, receiptAddress = address } = {}) {
  return async (url, init) => {
    if (url.includes('/api?')) {
      if (apiError) return Response.json({status:'0',message:'NOTOK',result:apiError});
      return Response.json({status:rows.length ? '1':'0',message:rows.length ? 'OK':'No transactions found',result:rows});
    }
    const body = JSON.parse(init.body);
    assert.ok(body.every(r => ['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber'].includes(r.method)));
    const rpc = [
      {id:1,result:'0x' + chain.toString(16)},
      {id:2,result:{transactionHash:hash,blockNumber:'0x14',blockHash,from:receiptAddress,to:other,status:'0x1'}},
      {id:3,result:{number:'0x14',hash:blockHash,timestamp:'0x' + Number(timestamp).toString(16),transactions:included ? [hash]:[]}},
    ];
    if (rpcError) rpc[1] = {id:2,error:{message:'archive unavailable'}};
    return Response.json(rpc.reverse());
  };
}
test('address validation excludes zero, malformed and injection values', () => {
  assert.equal(validAddress(address),true);
  for (const a of ['0x'+'0'.repeat(40),'0x123','https://example.com',address+'<script>','0x'+'g'.repeat(40)]) assert.equal(validAddress(a),false);
});
test('elapsed time preserves UTC days and remaining hours across leap day', () => {
  assert.deepEqual(elapsed('2024-02-28T23:30:00Z','2024-03-01T02:45:00Z'),{days:1,hours:3,minutes:15,totalHours:27,afterEndpoint:false});
  assert.equal(elapsed('2026-10-07T00:00:00Z',NOTICE_AT).afterEndpoint,true);
  assert.throws(() => elapsed('bad',NOTICE_AT));
});
test('RPC cross-check permits shuffled batch responses and verifies evidence', async () => {
  const n = await lookupNetwork('mainnet',address,provider(),now);
  assert.equal(n.status,'found'); assert.equal(n.first.hash,hash); assert.equal(n.first.direction,'sent');
  assert.equal(n.first.timestamp,new Date(Number(row.timeStamp)*1000).toISOString());
  assert.ok(n.sourceUrl.includes('sort=asc')); assert.equal(n.first.chainId,2741);
});
test('empty histories remain distinct from provider failures', async () => {
  assert.equal((await lookupNetwork('mainnet',address,provider({rows:[]}),now)).status,'no-records');
  assert.equal((await lookupNetwork('mainnet',address,provider({apiError:'Max rate limit reached'}),now)).status,'unavailable');
  assert.equal((await lookupNetwork('mainnet',address,provider({rpcError:true}),now)).status,'unavailable');
});
test('mismatched chain, timestamp, inclusion or address never produces a date', async () => {
  for (const config of [{chain:11124},{timestamp:Number(row.timeStamp)+1},{included:false},{receiptAddress:other}]) {
    const n = await lookupNetwork('mainnet',address,provider(config),now);
    assert.equal(n.status,'unavailable'); assert.equal(n.first,null);
  }
});
test('unordered history, future timestamps and unrelated explorer records are rejected', async () => {
  for (const rows of [[row,{...row,blockNumber:'19'}],[{...row,timeStamp:String(Math.floor(now/1000)+60)}],[{...row,from:other,to:other}]]) assert.equal((await lookupNetwork('mainnet',address,provider({rows}),now)).status,'unavailable');
});
test('earlier testnet wins without treating an unavailable mainnet as empty', () => {
  const first = {network:'testnet',timestamp:'2024-07-01T12:00:00Z'};
  assert.equal(earliestRecord([{status:'unavailable',first:null},{status:'found',first},{status:'found',first:{network:'mainnet',timestamp:'2025-02-01T12:00:00Z'}}]),first);
});
test('validation happens before upstream calls', async () => {
  const response = await handleLookup(new Request('https://test/api/lookup?address=0x123'),() => { throw Error('Must not call upstream'); },now);
  assert.equal(response.status,400);
});
test('partial receipt exposes checked coverage and self-reported association', async () => {
  const response = await handleLookup(new Request('https://test/api/lookup?address='+address+'&testnet=1&testnetAddress='+other),async (url,init) => url.includes('testnet') ? Response.json({status:'0',message:'NOTOK',result:'rate limited'}) : provider()(url,init),now);
  const body = await response.json(); assert.equal(body.partial,true); assert.equal(body.differentTestnetAddress,true); assert.equal(body.earliest.network,'mainnet'); assert.equal(body.networks.length,2);
});
test('SVG escapes text, keeps no-data demonstrations and coverage warnings visible', () => {
  const svg = makeCardSvg({first:{network:'mainnet',timestamp:'2025-01-27T12:00:00Z',hash},address:'<script>&',until:NOTICE_AT,partial:true,tag:true,theme:'ink'});
  assert.ok(svg.includes('&lt;script&gt;&amp;')); assert.ok(svg.includes('PARTIAL EXPLORER COVERAGE')); assert.ok(svg.includes('ELAPSED TIME, NOT HOURS WORKED')); assert.ok(svg.includes('width="1200" height="675"')); assert.ok(!svg.includes('NaN'));
  assert.ok(makeCardSvg({first:{network:'mainnet',timestamp:'2025-01-27T12:00:00Z'},until:NOTICE_AT,demo:true}).includes('EXAMPLE — NOT A WALLET LOOKUP'));
});
test('simple wallet search and supporting pages parse and preserve read-only wallet operations', async () => {
  const response = await worker.fetch(new Request('https://receipt.example/'),{},{}), html = await response.text();
  const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  assert.equal((html.match(/<form id="wallet-form"[\s\S]*?<\/form>/)[0].match(/<input /g)||[]).length,1);
  assert.ok(html.includes('id="results" class="results" aria-label="Your wallet results" hidden'));
  assert.ok(html.includes('data-choose-theme="dark"'));
  assert.ok(html.includes('data-choose-theme="light"'));
  assert.ok(html.includes('Both buttons ship immediately.'));
  assert.ok(script.includes("new URLSearchParams({query,testnet:'1'})"));
  assert.equal((html.match(/class="entry"/g)||[]).length,0);
  const record = await (await worker.fetch(new Request('https://receipt.example/record'),{},{})).text();
  const method = await (await worker.fetch(new Request('https://receipt.example/method'),{},{})).text();
  for(const page of [record,method]) assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]+)<\/script>/)[1]));
  assert.equal((record.match(/class="entry"/g)||[]).length,6);
  assert.ok(record.includes('not a dated Abstract product-delivery commitment'));
  assert.ok(method.includes('same supplied address on both mainnet and testnet'));
  assert.equal((await worker.fetch(new Request('https://test/',{method:'POST'}),{},{})).status,405);
  assert.equal((await worker.fetch(new Request('https://test/missing'),{},{})).status,404);
  assert.equal((await worker.fetch(new Request('https://test/',{method:'HEAD'}),{},{})).body,null);
  assert.ok(!script.includes('eth_sendTransaction'));
});
test('single-address lookup checks both networks and picks the older verified testnet record', async () => {
  const olderRow = {...row,timeStamp:String(Number(row.timeStamp)-86400)};
  const response = await handleLookup(new Request('https://test/api/lookup?address='+address+'&testnet=1'),async (url,init) => (
    url.includes('testnet') ? provider({chain:11124,rows:[olderRow],timestamp:olderRow.timeStamp})(url,init) : provider()(url,init)
  ),now);
  const body = await response.json();
  assert.equal(body.networks.length,2);
  assert.deepEqual(body.networks.map(n => n.status),['found','found']);
  assert.equal(body.differentTestnetAddress,false);
  assert.equal(body.earliest.network,'testnet');
  assert.equal(body.networks[0].first.explorerUrl,'https://abscan.org/tx/'+hash);
  assert.equal(body.networks[1].first.explorerUrl,'https://sepolia.abscan.org/tx/'+hash);
});
test('hosted cache requires no default-cache capability and reuses successful snapshots', async () => {
  const originalFetch = globalThis.fetch, descriptor = Object.getOwnPropertyDescriptor(globalThis,'caches');
  let calls = 0;
  Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw Error('Default cache access is forbidden');}});
  globalThis.fetch = async (...args) => { calls++; return provider()(...args); };
  try {
    const request = new Request('https://cache-test/api/lookup?address='+address);
    const first = await worker.fetch(request,{},{}), a = await first.json();
    assert.equal(first.status,200); assert.equal(a.earliest.hash,hash);
    const hits = calls, b = await (await worker.fetch(request,{},{})).json();
    assert.equal(calls,hits); assert.equal(a.generatedAt,b.generatedAt);
  } finally { globalThis.fetch=originalFetch; if(descriptor)Object.defineProperty(globalThis,'caches',descriptor);else delete globalThis.caches; }
});
