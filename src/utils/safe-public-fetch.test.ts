import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createPinnedLookup, isPublicAddress, readBoundedTextResponse, resolvePublicUrl } from './safe-public-fetch';

describe('safe public crawler URLs', () => {
  it('rejects loopback, link-local, private, carrier-grade NAT, and IPv4-mapped IPv6 addresses', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/',
      'http://100.64.0.1/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::127.0.0.1]/',
      'http://[::7f00:1]/',
      'http://[64:ff9b::7f00:1]/',
      'http://[64:ff9b:1::7f00:1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
    ]) {
      await expect(resolvePublicUrl(url)).rejects.toThrow('Private-network URLs are not allowed');
    }
  });

  it('accepts public address literals', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicAddress('64:ff9b::808:808')).toBe(true);
  });

  it('pins both scalar and all-address Node DNS lookup callback forms', async () => {
    const pinnedLookup = createPinnedLookup('8.8.8.8', 4) as any;
    const scalar = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      pinnedLookup('example.org', { family: 0, all: false }, (error: Error | null, address: string, family: number) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    const all = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
      pinnedLookup('example.org', { family: 0, all: true }, (error: Error | null, addresses: Array<{ address: string; family: number }>) => {
        if (error) reject(error);
        else resolve(addresses);
      });
    });

    expect(scalar).toEqual({ address: '8.8.8.8', family: 4 });
    expect(all).toEqual([{ address: '8.8.8.8', family: 4 }]);
  });

  it('rejects aborted and incomplete upstream response bodies', async () => {
    const aborted = new EventEmitter() as IncomingMessage;
    aborted.complete = false;
    const abortedRead = readBoundedTextResponse(aborted, 1024);
    aborted.emit('data', Buffer.from('partial'));
    aborted.emit('aborted');
    await expect(abortedRead).rejects.toThrow('was aborted');

    const incomplete = new EventEmitter() as IncomingMessage;
    incomplete.complete = false;
    const incompleteRead = readBoundedTextResponse(incomplete, 1024);
    incomplete.emit('data', Buffer.from('partial'));
    incomplete.emit('end');
    await expect(incompleteRead).rejects.toThrow('before the message was complete');

    const errored = new EventEmitter() as IncomingMessage;
    errored.complete = false;
    const erroredRead = readBoundedTextResponse(errored, 1024);
    errored.emit('error', new Error('upstream reset'));
    await expect(erroredRead).rejects.toThrow('upstream reset');
  });
});
