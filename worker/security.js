const encoder = new TextEncoder();
const fallbackLimits = new Map();
export const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const validUuid = value => typeof value === 'string' && new RegExp('^' + UUID_PATTERN + '$').test(value);
export const fault = (message, status) => Object.assign(new Error(message), {status});
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function equalSecret(a, b) {
  // Compare fixed-length digests without an early exit based on matching bytes.
  const [left, right] = await Promise.all([hash(a), hash(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
export async function readJson(request) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') || '')) throw fault('Use a JSON request.', 415);
  if (Number(request.headers.get('content-length')) > 16384) throw fault('The submission is too long.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw fault('A request body is required.', 400);
  const chunks = []; let bytes = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 16384) { await reader.cancel(); throw fault('The submission is too long.', 413); }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(all));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    return body;
  } catch { throw fault('Invalid submission.', 400); }
}
export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export async function rateLimit(request, db, now, namespace, limit) {
  const window = Math.floor(now / 900000);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = await hash(namespace + ':' + window + ':' + ip);
  let attempts;
  if (db) {
    const row = await db.prepare('INSERT INTO community_limits (key,window,attempts) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key, window).first();
    attempts = Number(row?.attempts);
    // Deterministic occasional pruning keeps the hot path to one atomic statement.
    if (attempts === 1) await db.prepare('DELETE FROM community_limits WHERE window < ?').bind(window - 96).run();
  } else {
    for (const [k, row] of fallbackLimits) if (row.window < window) fallbackLimits.delete(k);
    const row = fallbackLimits.get(key);
    if (!row && fallbackLimits.size >= 2048) throw fault('The service is busy. Please try again shortly.', 429);
    attempts = (row?.attempts || 0) + 1;
    fallbackLimits.set(key, {window, attempts});
  }
  if (attempts > limit) throw fault('Please wait a little before trying again.', 429);
}
export async function secureResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), web-share=(self), clipboard-write=(self)');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  const html = headers.get('content-type')?.startsWith('text/html');
  let body = response.body;
  if (html && body) {
    const text = await response.text(); body = text;
    const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const hashes = await Promise.all(scripts.map(async ([, script]) => {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(script)));
      return "'sha256-" + btoa(String.fromCharCode(...digest)) + "'";
    }));
    headers.set('content-security-policy', "default-src 'self'; script-src " + (hashes.join(' ') || "'none'") + "; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  } else {
    headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  }
  return new Response(body, {status:response.status, statusText:response.statusText, headers});
}
