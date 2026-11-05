export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

function checkStructure(value: unknown) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let values = 1;
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (!entry.value || typeof entry.value !== 'object') continue;
    const children: unknown[] = Array.isArray(entry.value) ? entry.value : Object.values(entry.value);
    values += children.length;
    if (entry.depth >= 32 || children.length > 2_048 || values > 20_000) {
      throw new RequestBodyError(413, 'JSON request is too complex');
    }
    for (const child of children) stack.push({ value: child, depth: entry.depth + 1 });
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new RequestBodyError(413, 'Request body is too large');
  }
  if (!request.body) throw new RequestBodyError(400, 'JSON request body is required');

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new RequestBodyError(413, 'Request body is too large');
      }
      body += decoder.decode(value, { stream: true });
    }
    const result: unknown = JSON.parse(body + decoder.decode());
    checkStructure(result);
    return result;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, 'Invalid JSON request body');
  } finally {
    reader.releaseLock();
  }
}
