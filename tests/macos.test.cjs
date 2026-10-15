const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron } = require('playwright');

test(
  'macOS retains the app after closing, reopens on activation and explains denied capture permission',
  { skip: process.platform !== 'darwin', timeout: 30000 },
  async (t) => {
    const root = path.resolve(__dirname, '..');
    await fs.mkdir(path.join(root, 'work'), { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, 'work', 'macos-test-'));
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const application = await _electron.launch({
      executablePath: require('electron'),
      args: ['.'],
      cwd: root,
      env,
    });
    t.after(async () => {
      await application.close();
      await fs.rm(directory, { recursive: true, force: true });
    });
    let page = await application.firstWindow();
    await page.waitForFunction(() => window.desktop?.platform === 'darwin');
    assert.equal(await page.locator('kbd').first().textContent(), '⌘ ↵');
    await application.evaluate(({ systemPreferences }) => {
      systemPreferences.getMediaAccessStatus = () => 'denied';
    });
    await assert.rejects(
      page.evaluate(() => window.desktop.listScreens()),
      /隐私与安全性/,
    );
    const closed = page.waitForEvent('close');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    assert.equal(
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      0,
    );
    const reopened = application.waitForEvent('window');
    await application.evaluate(({ app }) => app.emit('activate'));
    page = await reopened;
    await page.waitForFunction(() => window.desktop?.platform === 'darwin');
    const snapshot = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(snapshot.appInfo.platform, 'darwin');
    assert.ok(
      await application.evaluate(({ Menu }) =>
        Menu.getApplicationMenu().items.some((item) =>
          item.submenu?.items.some((child) => child.role === 'quit'),
        ),
      ),
    );
  },
);
