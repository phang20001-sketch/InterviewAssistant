const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRendererHandler } = require('../src/renderer-protocol.cjs');

test('compiled renderer serves known assets and rejects unrelated files and origins', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-renderer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'index.html'), '<div id="app"></div>');
  await fs.writeFile(path.join(root, 'assets', 'app-123.js'), 'compiled');
  await fs.mkdir(path.join(root, 'assets', 'private-directory'));
  const requested = [];
  const handler = await createRendererHandler(root, async (url) => {
    requested.push(url);
    return new Response('ok');
  });
  for (const url of ['studio://app/index.html', 'studio://app/assets/app-123.js?v=1']) {
    assert.equal((await handler(new Request(url))).status, 200);
  }
  for (const url of [
    'studio://other/index.html',
    'studio://app/src/main.cjs',
    'studio://app/assets/../../workspace.json',
    'studio://app/assets/%2e%2e%2fworkspace.json',
    'studio://app/assets/private-directory',
    'studio://app/assets/missing.js',
  ]) {
    assert.equal((await handler(new Request(url))).status, 404);
  }
  assert.equal(
    (await handler(new Request('studio://app/index.html', { method: 'POST' }))).status,
    404,
  );
  assert.equal(requested.length, 2);
});
