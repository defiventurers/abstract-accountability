import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { resolveIdentity, handleLookup, normalizeUsername, validUsername, PORTAL_SEARCH } from '../worker/index.js';

const address = '0xf1ae4d33eb5db1a9672723df9f5d329cb9c97a91';
const other = '0x' + '2'.repeat(40);
const now = Date.parse('2026-10-07T16:00:00Z');
const user = { name: 'CoinRaven', address };
const search = users => async () => Response.json({ results: { users, apps: [], tokens: [] } });

test('username normalization supports @ and whitespace, while rejecting malformed address input', () => {
  assert.equal(normalizeUsername('  @CoinRaven  '), 'CoinRaven');
  assert.equal(validUsername('@CoinRaven'), true);
  for (const input of ['', '@', 'ab', 'a'.repeat(31), '0x123', 'https://example.com', '<script>', 'abc\nxyz']) assert.equal(validUsername(input), false, input);
});

test('an address bypasses Portal search entirely', async () => {
  assert.deepEqual(await resolveIdentity(' ' + address + ' ', () => { throw Error('No Portal call for addresses'); }, now), { kind: 'address', address, username: null });
});

test('an exact case-insensitive name wins over the first fuzzy result', async () => {
  let calls = 0;
  const identity = await resolveIdentity('  @coinraven  ', async (url, init) => {
    calls++;
    const requested = new URL(url);
    assert.equal(requested.origin + requested.pathname, PORTAL_SEARCH);
    assert.equal(requested.searchParams.get('query'), 'coinraven');
    assert.equal(init.headers.accept, 'application/json');
    return Response.json({ results: { users: [{ name: 'CoinRavenFans', address: other }, user], apps: [], tokens: [] } });
  }, now);
  assert.equal(calls, 1);
  assert.equal(identity.kind, 'username');
  assert.equal(identity.address, address);
  assert.equal(identity.username, 'CoinRaven');
  assert.equal(identity.resolvedAt, new Date(now).toISOString());
});

test('no exact match, including a token-only match, returns no wallet', async () => {
  for (const users of [[], [{ name: 'CoinRavenFans', address: other }]]) {
    const identity = await resolveIdentity('CoinRaven', async () => Response.json({ results: { users, apps: [], tokens: [{ name: 'CoinRaven', address }] } }), now);
    assert.equal(identity.status, 404);
    assert.equal(identity.code, 'username-not-found');
    assert.equal(identity.address, undefined);
  }
});

test('duplicate names with different wallets require an address; repeated rows for one wallet are safe', async () => {
  const ambiguous = await resolveIdentity('coinraven', search([user, { name: 'coinraven', address: other }]), now);
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguous.address, undefined);
  const repeated = await resolveIdentity('coinraven', search([user, { ...user, address: address.toUpperCase() }]), now);
  assert.equal(repeated.kind, 'username');
  assert.equal(repeated.address.toLowerCase(), address);
});

test('invalid provider addresses, bad shapes, HTTP errors and timeouts remain unavailable', async () => {
  const failures = [
    search([{ ...user, address: '0x123' }]),
    async () => Response.json({ results: { tokens: [] } }),
    async () => Response.json({ error: 'rate limited' }, { status: 429 }),
    async () => new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }),
    async () => { throw new DOMException('Timeout', 'TimeoutError'); },
  ];
  for (const fetcher of failures) {
    const identity = await resolveIdentity('coinraven', fetcher, now);
    assert.equal(identity.code, 'username-unavailable');
    assert.equal(identity.status, 503);
    assert.equal(identity.address, undefined);
    assert.match(identity.error, /Paste your wallet address/);
  }
});

test('username failures do not call explorers or produce transaction dates', async () => {
  let calls = 0;
  const response = await handleLookup(new Request('https://receipt.example/api/lookup?query=coinraven&testnet=1'), async url => {
    calls++;
    assert.ok(url.startsWith(PORTAL_SEARCH));
    return Response.json({ results: { users: [], apps: [], tokens: [] } });
  }, now);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, 'username-not-found');
  assert.equal(body.earliest, undefined);
  assert.equal(calls, 1);
});

test('username lookup checks the resolved wallet on both networks and preserves resolution evidence', async () => {
  const queriedNetworks = [];
  const response = await handleLookup(new Request('https://receipt.example/api/lookup?' + new URLSearchParams({ query: '@coinraven', testnet: '1' })), async url => {
    if (url.startsWith(PORTAL_SEARCH)) return search([user])();
    const requested = new URL(url);
    assert.equal(requested.searchParams.get('address'), address);
    queriedNetworks.push(requested.hostname);
    return Response.json({ status: '0', message: 'No transactions found', result: [] });
  }, now);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identity.username, 'CoinRaven');
  assert.equal(body.address, address);
  assert.equal(body.testnetAddress, address);
  assert.equal(body.networks.length, 2);
  assert.ok(queriedNetworks.some(host => host.includes('mainnet')));
  assert.ok(queriedNetworks.some(host => host.includes('testnet')));
  assert.equal(body.earliest, null);
});

test('invalid separately supplied testnet addresses fail before any username or chain request', async () => {
  let calls = 0;
  const response = await handleLookup(new Request('https://receipt.example/api/lookup?query=coinraven&testnet=1&testnetAddress=invalid'), () => { calls++; throw Error('No upstream call'); }, now);
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('the hosted query parameter follows username resolution instead of address-only cache validation', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return url.startsWith(PORTAL_SEARCH) ? search([user])() : Response.json({ status: '0', message: 'No transactions found', result: [] });
  };
  try {
    const response = await worker.fetch(new Request('https://username-route/api/lookup?query=coinraven&testnet=1'), {}, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.identity.username, user.name);
    assert.equal(calls.length, 3);
    assert.equal(body.networks[0].address, address);
    assert.equal(body.networks[1].address, address);
  } finally { globalThis.fetch = originalFetch; }
});
