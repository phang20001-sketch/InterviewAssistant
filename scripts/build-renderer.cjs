const path = require('node:path');

async function buildRenderer() {
  const { build } = await import('vite');
  await build({ configFile: path.resolve(__dirname, '..', 'vite.config.mjs') });
}

module.exports = { buildRenderer };

if (require.main === module) {
  buildRenderer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
