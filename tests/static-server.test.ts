import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { afterEach, test } from 'node:test';

import { tryServeStatic } from '../server/static-server.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        })
    )
  );
  servers.length = 0;
});

async function staticFixture() {
  const root = await mkdtemp(join(tmpdir(), 'agent-viz-static-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<div id="root"></div>', 'utf8');
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("ok");', 'utf8');
  return root;
}

async function listenWithStatic(root: string): Promise<string> {
  const server = createServer(async (req, res) => {
    if (await tryServeStatic(req, res, root)) return;
    res.writeHead(404);
    res.end('not found');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('serves static files from the production build directory', async () => {
  const baseUrl = await listenWithStatic(await staticFixture());

  const response = await fetch(`${baseUrl}/assets/app.js`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(await response.text(), 'console.log("ok");');
});

test('falls back to index.html for browser routes', async () => {
  const baseUrl = await listenWithStatic(await staticFixture());

  const response = await fetch(`${baseUrl}/sessions/trace-blue-river`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<div id="root"></div>');
});

test('does not serve files outside the static root', async () => {
  const baseUrl = await listenWithStatic(await staticFixture());

  const response = await fetch(`${baseUrl}/../package.json`);

  assert.equal(response.status, 404);
});
