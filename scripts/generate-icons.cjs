// Run with Node 22.13+ after npm ci. Only the existing Electron and Playwright
// development dependencies are used; no native image utilities are required.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const assetsDirectory = path.resolve(__dirname, '../assets');
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icnsTypes = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10'],
]);

function createIco(images) {
  const header = Buffer.alloc(6 + icoSizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;

  for (const [index, size] of icoSizes.entries()) {
    const image = images.get(size);
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  }

  return Buffer.concat([header, ...icoSizes.map((size) => images.get(size))]);
}

function createIcns(images) {
  const chunks = [...icnsTypes].map(([size, type]) => {
    const image = images.get(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([header, image]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

async function generateIcons() {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'interview-studio-icons-'));
  const mainFile = path.join(temporaryDirectory, 'main.cjs');
  let application;

  try {
    await fs.writeFile(
      mainFile,
      `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(temporaryDirectory, 'profile'))});
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false });
  window.loadURL('about:blank');
});
`,
    );
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({
      executablePath: require('electron'),
      args: [mainFile],
      env: environment,
    });
    const page = await application.firstWindow();
    const source = await fs.readFile(path.join(assetsDirectory, 'icon.svg'), 'utf8');
    const sizes = [...new Set([...icoSizes, ...icnsTypes.keys()])];
    const encodedImages = await page.evaluate(
      async ({ source, sizes }) => {
        const image = new Image();
        const blob = new Blob([source], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        try {
          image.src = url;
          await image.decode();
          return sizes.map((size) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            canvas.getContext('2d').drawImage(image, 0, 0, size, size);
            return [size, canvas.toDataURL('image/png').split(',')[1]];
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { source, sizes },
    );
    const images = new Map(
      encodedImages.map(([size, encoded]) => [size, Buffer.from(encoded, 'base64')]),
    );
    await fs.writeFile(path.join(assetsDirectory, 'icon.png'), images.get(1024));
    await fs.writeFile(path.join(assetsDirectory, 'icon.ico'), createIco(images));
    await fs.writeFile(path.join(assetsDirectory, 'icon.icns'), createIcns(images));
    console.log('Generated icon.png (1024px), icon.ico (7 sizes), and icon.icns (7 sizes).');
  } finally {
    if (application) await application.close();
    const temporaryRoot = path.resolve(os.tmpdir());
    const cleanupDirectory = path.resolve(temporaryDirectory);
    const isGeneratedDirectory =
      path.dirname(cleanupDirectory) === temporaryRoot &&
      path.basename(cleanupDirectory).startsWith('interview-studio-icons-');

    if (!isGeneratedDirectory) {
      throw new Error('Refusing to remove a directory outside the icon generator temporary area.');
    }

    await fs.rm(cleanupDirectory, { recursive: true, force: true });
  }
}

generateIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
