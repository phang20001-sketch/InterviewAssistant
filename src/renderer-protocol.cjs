const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Only expose the compiled entry and actual Vite assets, never arbitrary files
// from the source tree or the user's workspace.
async function createRendererHandler(rendererDirectory, fetchFile) {
  const files = new Map([['/index.html', path.join(rendererDirectory, 'index.html')]]);
  const assetsDirectory = path.join(rendererDirectory, 'assets');
  const assets = await fs.readdir(assetsDirectory, { withFileTypes: true });
  for (const entry of assets) {
    if (entry.isFile()) {
      files.set('/assets/' + entry.name, path.join(assetsDirectory, entry.name));
    }
  }

  return async (request) => {
    const url = new URL(request.url);
    const filename = files.get(url.pathname);
    if (url.hostname !== 'app' || !filename || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Not found', { status: 404 });
    }
    return fetchFile(pathToFileURL(filename).href);
  };
}

module.exports = { createRendererHandler };
