import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = candidate.slice(root.length);
  return candidate === root || relative.startsWith(sep);
}

function staticPathForUrl(staticRoot: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = normalize(decoded).replace(/^[/\\]+/, '');
  const candidate = resolve(staticRoot, relativePath);
  return isInsideRoot(staticRoot, candidate) ? candidate : null;
}

async function sendFile(res: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
  } catch {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  });

  await new Promise<void>((resolveStream, reject) => {
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolveStream);
    stream.pipe(res);
  });
  return true;
}

export async function tryServeStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string
): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const staticRoot = resolve(staticDir);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const candidate = staticPathForUrl(staticRoot, url.pathname);
  if (!candidate) return false;

  if (await sendFile(res, candidate)) return true;
  if (extname(candidate)) return false;
  return sendFile(res, join(staticRoot, 'index.html'));
}
