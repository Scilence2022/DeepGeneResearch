const MAX_TOKEN_AGE_MS = 100_000;
const encoder = new TextEncoder();
const signContext = 'dgr-browser-proxy-v1';

function importKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function generateSignature(secret: string, timestamp: number): Promise<string> {
  if (!secret) return '';
  const key = await importKey(secret);
  const message = encoder.encode(`${signContext}:${timestamp}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const digest = Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${timestamp}.${digest}`;
}

export async function verifySignature(token: string, secret: string, now: number): Promise<boolean> {
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!secret || !match) return false;
  const age = now - Number(match[1]);
  if (age < -5_000 || age > MAX_TOKEN_AGE_MS) return false;
  const key = await importKey(secret);
  const signature = Uint8Array.from(match[2].match(/../g)!, byte => Number.parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`${signContext}:${match[1]}`));
}
