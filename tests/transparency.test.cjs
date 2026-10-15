const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once, EventEmitter } = require('node:events');
const { _electron } = require('playwright');
const { editActiveModel } = require('./helpers/model-manager.cjs');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');

test(
  'transparent workspace preserves live conversation and restores the normal window',
  { timeout: 120000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'transparency-test-'));
    const requests = [];
    const events = new EventEmitter();
    let pendingResponse;
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({ body, authorization: request.headers.authorization });
      pendingResponse = response;
      events.emit('question');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    let application;
    let page;
    t.after(async () => {
      if (page && !page.isClosed())
        await page.screenshot({ path: path.join(directory, 'last-screen.png') }).catch(() => {});
      if (pendingResponse && !pendingResponse.writableEnded) pendingResponse.end('{}');
      if (application) await application.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    });

    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
      application = await _electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['.'],
        cwd: root,
        env,
      });
      page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      await page.waitForFunction(async () => {
        if (!window.desktop?.getWindowState) return false;
        const state = await window.desktop.bootstrap();
        return document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}`;
      });
    };
    await launch();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Configure only a local fake provider in this disposable workspace.
    await page.locator('[data-view="settings"]').click();
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'transparent-workspace-test',
      apiKey: 'local-transparent-test-key',
      demoMode: false,
    });
    await page.locator('#setting-contentProtection').check({ force: true });
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      () => document.querySelector('#model-name')?.textContent === 'transparent-workspace-test',
    );
    await page.locator('[data-view="assistant"]').click();
    assert.deepEqual(await page.evaluate(() => window.desktop.getWindowState()), {
      transparentMode: false,
      isMaximized: false,
    });
    assert.deepEqual((await page.evaluate(() => window.desktop.bootstrap())).windowState, {
      transparentMode: false,
      isMaximized: false,
    });
    const savedSettings = (await page.evaluate(() => window.desktop.bootstrap())).settings;
    assert.equal(savedSettings.contentProtection, true);

    const normalWindow = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return {
        bounds: window.getBounds(),
        id: window.webContents.id,
        resizable: window.isResizable(),
        opacity: window.getOpacity(),
      };
    });
    assert.equal(normalWindow.resizable, true);
    assert.equal(normalWindow.opacity, 1);
    await page.evaluate(() => {
      window.__transparencyTest = {
        input: document.querySelector('#question-input'),
        answer: document.querySelector('#answer-body'),
        token: 'same-renderer-throughout',
      };
      window.__windowEvents = [];
      window.desktop.onWindowState((state) => window.__windowEvents.push(state));
    });

    const keyboard = async (key, modifiers = {}) =>
      page.evaluate(
        ({ key, modifiers }) => {
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
          );
        },
        { key, modifiers },
      );
    const waitMode = (enabled) =>
      page.waitForFunction(
        (enabled) =>
          document.body.classList.contains('transparent-mode') === enabled &&
          document.documentElement.classList.contains('transparent-mode') === enabled &&
          document.querySelector('#exit-transparency').hidden === !enabled,
        enabled,
      );
    const assertSameRenderer = async () => {
      assert.equal(
        await page.evaluate(
          () =>
            window.__transparencyTest?.token === 'same-renderer-throughout' &&
            window.__transparencyTest.input === document.querySelector('#question-input') &&
            window.__transparencyTest.answer === document.querySelector('#answer-body'),
        ),
        true,
        'mode switches must preserve the original draft and conversation DOM',
      );
      assert.equal(
        await application.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.id,
        ),
        normalWindow.id,
      );
    };

    const draft = '草稿必须保留：解释 JavaScript 闭包与作用域。';
    await page.locator('#question-input').fill(draft);
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    await assertSameRenderer();
    assert.equal(await page.locator('#question-input').inputValue(), draft);
    for (const selector of [
      '.sidebar',
      '.topbar',
      '.page-heading',
      '.demo-banner',
      '.card-header',
      '.mode-tabs',
      '.input-label',
      '.input-meta',
      '.question-actions',
      '.quick-question-area',
      '.answer-empty',
      '.answer-footer',
      '.workspace-bottom',
      '.window-caption',
      '.window-controls',
    ]) {
      assert.equal(
        await page.locator(selector).first().isVisible(),
        false,
        `${selector} must disappear in transparent mode`,
      );
    }
    assert.equal(await page.locator('#question-input').isVisible(), true);
    assert.equal(await page.locator('#exit-transparency').isVisible(), true);
    const backgrounds = await page.evaluate(() => {
      const selectors = [
        'html',
        'body',
        '#window-titlebar',
        '.app-shell',
        '.main-panel',
        '.page-scroll',
        '#view-assistant',
        '.assistant-grid',
        '.question-card',
        '.question-content',
        '.answer-card',
        '#question-input',
        '#answer-body',
      ];
      return selectors.map((selector) => ({
        selector,
        background: getComputedStyle(document.querySelector(selector)).backgroundColor,
      }));
    });
    for (const { selector, background } of backgrounds)
      assert.match(
        background,
        /^rgba\([^)]*,\s*0\)$/,
        `${selector} must have a fully transparent CSS background`,
      );
    const transparentWindow = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const image = await window.webContents.capturePage();
      const bitmap = image.toBitmap();
      const { width, height } = image.getSize();
      const alphaAt = (x, y) => bitmap[(y * width + x) * 4 + 3];
      return {
        bounds: window.getBounds(),
        resizable: window.isResizable(),
        opacity: window.getOpacity(),
        cornerAlphas: [
          alphaAt(0, 0),
          alphaAt(width - 1, 0),
          alphaAt(0, height - 1),
          alphaAt(width - 1, height - 1),
        ],
        hasVisiblePixels: bitmap.some((value, index) => index % 4 === 3 && value > 0),
      };
    });
    assert.equal(transparentWindow.resizable, false);
    assert.equal(transparentWindow.opacity, 1, 'text must retain full window opacity');
    assert.ok(transparentWindow.bounds.width <= 800 && transparentWindow.bounds.height <= 660);
    assert.deepEqual(
      transparentWindow.cornerAlphas,
      [0, 0, 0, 0],
      'native window pixels must be transparent, not painted white/black',
    );
    assert.equal(
      transparentWindow.hasVisiblePixels,
      true,
      'input text and the restore control must still render',
    );

    await keyboard('Escape');
    await waitMode(false);
    await assertSameRenderer();
    assert.equal(await page.locator('#question-input').inputValue(), draft);
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    assert.deepEqual(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      ),
      normalWindow.bounds,
    );
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isResizable(),
      ),
      true,
    );

    // Local key dispatch avoids competing with other test instances' OS shortcuts.
    await page.waitForTimeout(300); // Allow the OS/global-shortcut duplicate guard to expire.
    await keyboard('T', { ctrlKey: true, shiftKey: true });
    await waitMode(true);
    const question = once(events, 'question', { signal: AbortSignal.timeout(10000) });
    await keyboard('Enter', { ctrlKey: true });
    await question;
    await page.locator('.answer-loading').waitFor({ state: 'attached' });
    assert.equal(requests.length, 1, 'Ctrl Enter must send exactly one question');
    assert.equal(requests[0].authorization, 'Bearer local-transparent-test-key');
    assert.equal(requests[0].body.messages.at(-1).content, draft);
    assert.equal(await page.locator('#question-input').inputValue(), draft);

    // An in-flight AI request must not lock window mode controls or reload Chromium.
    await page.locator('#exit-transparency').click();
    await waitMode(false);
    await assertSameRenderer();
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    await assertSameRenderer();
    assert.equal(await page.locator('#question-input').inputValue(), draft);
    const answer = '透明模式回答：闭包保留对词法作用域的引用。';
    pendingResponse.writeHead(200, { 'Content-Type': 'application/json' });
    pendingResponse.end(
      JSON.stringify({
        choices: [
          {
            message: { content: '## 测试回答\n\n' + answer + '\n\n```js\nconst answer = 42;\n```' },
          },
        ],
      }),
    );
    await page.waitForFunction(
      (answer) => document.querySelector('#answer-body')?.textContent.includes(answer),
      answer,
    );
    await page.waitForFunction(() => document.querySelector('#question-input')?.disabled === false);
    await assertSameRenderer();
    assert.equal(await page.locator('#question-input').inputValue(), '');
    assert.equal(await page.locator('.question-bubble').isVisible(), true);
    assert.equal(await page.locator('.markdown-content').isVisible(), true);
    assert.match(await page.locator('.question-bubble').textContent(), /草稿必须保留/);
    for (const meta of await page.locator('.message-meta').all())
      assert.equal(await meta.isVisible(), false);
    const answerStyles = await page.locator('.markdown-content').evaluate((element) => ({
      color: getComputedStyle(element).color,
      opacity: getComputedStyle(element).opacity,
      background: getComputedStyle(element).backgroundColor,
      codeBackground: getComputedStyle(element.querySelector('pre')).backgroundColor,
    }));
    assert.notEqual(answerStyles.color, 'rgba(0, 0, 0, 0)');
    assert.equal(answerStyles.opacity, '1');
    assert.match(answerStyles.background, /^rgba\([^)]*,\s*0\)$/);
    assert.match(answerStyles.codeBackground, /^rgba\([^)]*,\s*0\)$/);
    await page.screenshot({ path: path.join(directory, 'transparent-answer.png') });
    assert.deepEqual(
      (await page.evaluate(() => window.desktop.bootstrap())).settings,
      savedSettings,
      'view changes must never rewrite the model or protection settings',
    );
    assert.ok(
      await page.evaluate(() =>
        window.__windowEvents.some((state) => state.transparentMode === true),
      ),
    );

    await page.locator('#exit-transparency').click();
    await waitMode(false);
    await assertSameRenderer();
    assert.match(await page.locator('#answer-body').textContent(), /透明模式回答/);
    assert.equal(await page.locator('#window-titlebar').isVisible(), true);
    assert.equal(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isResizable(),
      ),
      true,
    );
    assert.deepEqual(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      ),
      normalWindow.bounds,
    );

    await page.locator('#window-maximize').click();
    await page.waitForFunction(
      async () => (await window.desktop.getWindowState()).isMaximized === true,
    );
    await page.waitForFunction(
      () => document.querySelector('#window-maximize').getAttribute('aria-label') === '还原窗口',
    );
    await page.locator('#window-maximize').click();
    await page.waitForFunction(
      async () => (await window.desktop.getWindowState()).isMaximized === false,
    );
    assert.deepEqual(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      ),
      normalWindow.bounds,
    );
    await page.locator('#window-minimize').click();
    await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window.isMinimized()) await new Promise((resolve) => window.once('minimize', resolve));
      window.restore();
      window.show();
    });
    assert.deepEqual(await page.evaluate(() => window.desktop.getWindowState()), {
      transparentMode: false,
      isMaximized: false,
    });
    assert.deepEqual(errors, []);

    // Closing from our custom titlebar must work, and the next launch starts normal.
    const closed = application.waitForEvent('close');
    await page.locator('#window-close').click();
    await closed;
    application = null;
    await launch();
    assert.deepEqual(await page.evaluate(() => window.desktop.getWindowState()), {
      transparentMode: false,
      isMaximized: false,
    });
    assert.equal(await page.locator('.sidebar').isVisible(), true);
    const restored = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(restored.settings.contentProtection, true);
    assert.equal(restored.settings.hasApiKey, true);
    assert.equal(restored.settings.model, 'transparent-workspace-test');
    assert.ok(
      restored.sessions.some((session) =>
        session.messages.some((message) => message.content.includes(answer)),
      ),
    );
  },
);
