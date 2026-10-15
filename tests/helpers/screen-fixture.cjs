const fs = require('node:fs/promises');
const path = require('node:path');

// UI workflows use a local icon rather than the user's desktop or OS capture consent.
async function installScreenFixture(application) {
  const image = await fs.readFile(path.join(__dirname, '../../assets/icon.png'), 'base64');
  await application.evaluate(
    ({ desktopCapturer, nativeImage, screen, systemPreferences }, image) => {
      if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';
      desktopCapturer.getSources = async () =>
        screen.getAllDisplays().map((display) => ({
          id: `screen:${display.id}:0`,
          display_id: String(display.id),
          name: '测试屏幕',
          thumbnail: nativeImage.createFromBuffer(Buffer.from(image, 'base64')),
        }));
    },
    image,
  );
}
module.exports = { installScreenFixture };
