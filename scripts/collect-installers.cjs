const fs = require('node:fs/promises');
const path = require('node:path');

async function collectInstallers(results) {
  for (const result of results) {
    const platform = { darwin: 'macos', win32: 'windows' }[result.platform];
    if (!platform) continue;
    const directory = path.join(__dirname, platform, 'installers');
    await fs.mkdir(directory, { recursive: true });
    for (const artifact of result.artifacts) {
      if (!/\.(zip|exe|dmg)$/i.test(artifact)) continue;
      await fs.copyFile(artifact, path.join(directory, path.basename(artifact)));
    }
  }
}
module.exports = { collectInstallers };
