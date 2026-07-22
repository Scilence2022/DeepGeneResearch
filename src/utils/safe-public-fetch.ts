import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { IncomingMessage } from 'node:http';

const blockedAddresses = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  // RFC 8215 local-use NAT64 prefix. Unlike the well-known /96 prefix,
  // multiple embedding layouts are possible, so reject the local-use range.
  ['64:ff9b:1::', 48],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
]);

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) {
    const groups = expandIpv6(address);
    if (!groups) return false;

    const compatible = groups.slice(0, 6).every(group => group === 0);
    const mapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff;
    const wellKnownNat64 =
      groups[0] === 0x64 &&
      groups[1] === 0xff9b &&
      groups.slice(2, 6).every(group => group === 0);
    if (compatible || mapped || wellKnownNat64) {
      const high = groups[6];
      const low = groups[7];
      return isPublicAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    return !blockedAddresses.check(address, 'ipv6');
  }
  return false;
}

function expandIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().split('%', 1)[0];
  if (normalized.includes('.')) {
    const separator = normalized.lastIndexOf(':');
    const dotted = normalized.slice(separator + 1);
    if (separator < 0 || isIP(dotted) !== 4) return null;
    const octets = dotted.split('.').map(Number);
    normalized = `${normalized.slice(0, separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const rawGroups = [...left, ...Array(missing).fill('0'), ...right];
  if (rawGroups.length !== 8 || rawGroups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return rawGroups.map(group => Number.parseInt(group, 16));
}

export function readBoundedTextResponse(response: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const cleanup = () => {
      response.off('data', onData);
      response.off('end', onEnd);
      response.off('aborted', onAborted);
      response.off('error', onError);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > maxBytes) {
        fail(new Error(`Crawler response exceeded ${maxBytes} bytes`));
        response.destroy();
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (!response.complete) {
        fail(new Error('Crawler upstream response ended before the message was complete'));
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onAborted = () => fail(new Error('Crawler upstream response was aborted'));
    const onError = (error: Error) => fail(error);

    response.on('data', onData);
    response.on('end', onEnd);
    response.on('aborted', onAborted);
    response.on('error', onError);
  });
}

export async function resolvePublicUrl(rawUrl: string): Promise<{
  url: URL;
  address: string;
  family: 4 | 6;
}> {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) URLs are allowed');
  }
  if (url.username || url.password) {
    throw new Error('URLs containing credentials are not allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('Private-network URLs are not allowed');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new Error('Private-network URLs are not allowed');
  }

  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

/** Create a DNS-rebinding-safe lookup that supports both Node callback forms. */
export function createPinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return ((_hostname, options, callback) => {
    if (typeof options === 'object' && options?.all) {
      (callback as any)(null, [{ address, family }]);
      return;
    }
    (callback as any)(null, address, family);
  }) as LookupFunction;
}

export async function fetchPublicText(
  rawUrl: string,
  {
    maxBytes = 5 * 1024 * 1024,
    timeoutMs = 15_000,
    maxRedirects = 3,
  }: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<{ url: URL; status: number; contentType: string; body: string }> {
  const resolved = await resolvePublicUrl(rawUrl);
  const request = resolved.url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = request(
      resolved.url,
      {
        headers: {
          accept: 'text/html,text/plain,application/xhtml+xml,application/xml,text/xml,application/json',
          'accept-encoding': 'identity',
          'user-agent': 'DeepGeneResearch-Crawler/1.0',
        },
        // Pin the validated address so DNS rebinding cannot redirect the
        // subsequent connection into a private network.
        lookup: createPinnedLookup(resolved.address, resolved.family),
      },
      response => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          if (maxRedirects <= 0) {
            reject(new Error('Crawler upstream exceeded the redirect limit'));
            return;
          }
          let redirectUrl: string;
          try {
            redirectUrl = new URL(response.headers.location, resolved.url).toString();
          } catch {
            reject(new Error('Crawler upstream returned an invalid redirect URL'));
            return;
          }
          // Re-enter through resolvePublicUrl so every redirect target is
          // independently checked and DNS-pinned against SSRF/rebinding.
          void fetchPublicText(redirectUrl, { maxBytes, timeoutMs, maxRedirects: maxRedirects - 1 })
            .then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Crawler upstream returned ${status}`));
          return;
        }

        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (contentType && !/^(text\/|application\/(?:xhtml\+xml|xml|json))(?:;|$)/.test(contentType)) {
          response.resume();
          reject(new Error(`Crawler upstream returned unsupported content type: ${contentType}`));
          return;
        }
        const contentLength = Number(response.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.resume();
          reject(new Error(`Crawler response exceeded ${maxBytes} bytes`));
          return;
        }

        void readBoundedTextResponse(response, maxBytes).then(
          body => resolve({ url: resolved.url, status, contentType, body }),
          error => {
            req.destroy();
            reject(error);
          }
        );
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Crawler request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
  });
}
