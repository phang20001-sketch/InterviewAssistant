const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once, EventEmitter } = require('node:events');
const { _electron } = require('playwright');
const { editActiveModel } = require('./helpers/model-manager.cjs');

const root = path.resolve(__dirname, '..');

test(
  'transparent appearance keeps hints in sync, supports font size, and persists during Q&A',
  { timeout: 120000 },
  async (t) => {
    const work = path.join(root, 'work');
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'opacity-test-'));
    const requests = [];
    const events = new EventEmitter();
    let holdResponse = true;
    let pendingResponse;
    const complete = (response, content) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    };
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString()),
        authorization: request.headers.authorization,
      });
      if (holdResponse) {
        pendingResponse = response;
        events.emit('pending');
      } else complete(response, '键盘继续问答成功。');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    let application;
    let page;
    const errors = [];
    t.after(async () => {
      if (pendingResponse && !pendingResponse.writableEnded) pendingResponse.end('{}');
      if (page && !page.isClosed())
        await page.screenshot({ path: path.join(directory, 'last-screen.png') }).catch(() => {});
      if (application) await application.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
      application = await _electron.launch({
        executablePath: require('electron'),
        args: ['.'],
        cwd: root,
        env,
      });
      page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.waitForFunction(async () => {
        if (!window.desktop?.getWindowState) return false;
        const state = await window.desktop.bootstrap();
        return document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}`;
      });
    };
    await launch();

    // This isolated profile only talks to the local fake provider above.
    await page.locator('[data-view="settings"]').click();
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-opacity-test',
      apiKey: 'local-opacity-test-key',
      demoMode: false,
    });
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      () => document.querySelector('#model-name')?.textContent === 'local-opacity-test',
    );
    await page.locator('[data-view="assistant"]').click();

    const bootstrap = () => page.evaluate(() => window.desktop.bootstrap());
    const waitMode = (enabled) =>
      page.waitForFunction(
        (enabled) => document.body.classList.contains('transparent-mode') === enabled,
        enabled,
      );
    const effectiveOpacity = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          let opacity = 1;
          for (let node = element; node instanceof Element; node = node.parentElement)
            opacity *= Number(getComputedStyle(node).opacity);
          return opacity;
        });
    const normalStyles = await page.locator('#question-input').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        background: style.backgroundColor,
        opacity: style.opacity,
        fontSize: style.fontSize,
      };
    });
    const originalWindow = await application.evaluate(({ BrowserWindow }) => ({
      id: BrowserWindow.getAllWindows()[0].webContents.id,
      bounds: BrowserWindow.getAllWindows()[0].getBounds(),
    }));
    const setRange = async (selector, value) => {
      await page.locator(selector).evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    };
    const waitSaved = (text, background, fontSize) =>
      page.waitForFunction(
        async ({ text, background, fontSize }) => {
          const { settings } = await window.desktop.bootstrap();
          return (
            settings.transparentTextOpacity === text &&
            settings.transparentBackgroundOpacity === background &&
            (fontSize === undefined || settings.transparentFontSize === fontSize)
          );
        },
        { text, background, fontSize },
      );
    const nativeSurface = () =>
      application.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const image = await window.webContents.capturePage();
        const bitmap = image.toBitmap();
        const { width, height } = image.getSize();
        const alphaAt = (x, y) => bitmap[(y * width + x) * 4 + 3];
        return {
          opacity: window.getOpacity(),
          id: window.webContents.id,
          alphas: [alphaAt(1, 1), alphaAt(1, height - 2), alphaAt(width - 2, height - 2)],
        };
      });
    const assertNativeBackground = async (opacity) => {
      // Two paint frames allow Chromium's compositor to apply the live range value.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const native = await nativeSurface();
      assert.equal(
        native.opacity,
        1,
        'the native window must not multiply the separate text/background opacity',
      );
      assert.equal(native.id, originalWindow.id, 'adjustment must keep the live renderer');
      for (const alpha of native.alphas)
        assert.ok(
          Math.abs(alpha - opacity * 255) <= 2,
          `background alpha ${alpha} should represent ${opacity}`,
        );
    };

    const draft = '透明界面点击发送：说明事件循环。';
    await page.locator('#question-input').fill(draft);
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    assert.equal(await page.locator('#transparent-text-opacity').inputValue(), '100');
    assert.equal(await page.locator('#transparent-background-opacity').inputValue(), '0');
    assert.equal(await page.locator('#transparent-font-size').inputValue(), '16');
    for (const selector of [
      '#transparent-toolbar',
      '#transparent-send',
      '#transparent-capture-answer',
      '#exit-transparency',
      '#transparent-text-opacity',
      '#transparent-background-opacity',
      '#transparent-font-size',
    ]) {
      assert.equal(
        await page.locator(selector).isVisible(),
        true,
        `${selector} must remain available in transparent mode`,
      );
    }
    await assertNativeBackground(0);

    await setRange('#transparent-text-opacity', 40);
    assert.equal(await effectiveOpacity('#question-input'), 0.4);
    for (const selector of [
      '#transparent-text-opacity-value',
      '#transparent-background-opacity-value',
      '#transparent-font-size-value',
    ]) {
      assert.equal(await effectiveOpacity(selector), 0.4, 'hints must follow text opacity once');
    }
    await setRange('#transparent-font-size', 20);
    assert.equal(
      await page.locator('#question-input').evaluate((input) => getComputedStyle(input).fontSize),
      '20px',
    );
    assert.equal(await effectiveOpacity('#question-input'), 0.4);
    await assertNativeBackground(0);
    await setRange('#transparent-background-opacity', 65);
    assert.equal(
      await effectiveOpacity('#question-input'),
      0.4,
      'background changes must not further fade the input',
    );
    await assertNativeBackground(0.65);
    await setRange('#transparent-text-opacity', 0);
    assert.equal(await effectiveOpacity('#question-input'), 0);
    assert.ok(
      (await effectiveOpacity('#transparent-toolbar')) > 0,
      'controls must stay usable even when all Q&A text is invisible',
    );
    assert.ok((await effectiveOpacity('#transparent-send')) > 0);
    assert.equal(await effectiveOpacity('#transparent-text-opacity-value'), 0);
    assert.equal(await effectiveOpacity('#transparent-background-opacity-value'), 0);
    assert.equal(await effectiveOpacity('#transparent-font-size-value'), 0);
    assert.equal(await page.locator('#transparent-font-size').isEnabled(), true);
    assert.equal(await page.locator('#transparent-text-opacity-value').textContent(), '0%');
    assert.equal(await page.locator('#transparent-background-opacity-value').textContent(), '65%');
    await assertNativeBackground(0.65);
    await setRange('#transparent-text-opacity', 100);
    await setRange('#transparent-background-opacity', 100);
    assert.equal(await effectiveOpacity('#question-input'), 1);
    await assertNativeBackground(1);

    // The smallest transparent window must leave every action and slider clickable.
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ width: 480, height: 620 }),
    );
    await page.waitForFunction(() => innerWidth === 480);
    const layout = await page.evaluate(() => {
      const selectors = [
        '#transparent-send',
        '#transparent-capture-answer',
        '#exit-transparency',
        '#transparent-text-opacity',
        '#transparent-background-opacity',
        '#transparent-font-size',
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          selector,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          uncovered: hit === element || element.contains(hit),
        };
      });
    });
    for (const rect of layout) {
      assert.ok(
        rect.width > 20 && rect.height > 0 && rect.left >= 0 && rect.right <= 480 && rect.top >= 0,
        `${rect.selector} must fit in the narrow window`,
      );
      assert.equal(
        rect.uncovered,
        true,
        `${rect.selector} must not be covered by another control or drag surface`,
      );
    }
    assert.ok(layout[0].left <= 24, 'send must start at the left edge of the toolbar');
    assert.ok(layout[1].right < 260, 'all three actions must remain grouped on the left');
    assert.ok(layout[2].right < 260, 'restore must follow the other left-side actions');
    for (let left = 0; left < layout.length; left++) {
      for (let right = left + 1; right < layout.length; right++) {
        const a = layout[left],
          b = layout[right];
        assert.ok(
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
          `${a.selector} and ${b.selector} must not overlap`,
        );
      }
    }

    const pending = once(events, 'pending', { signal: AbortSignal.timeout(10000) });
    await page.locator('#transparent-send').click();
    await pending;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, 'Bearer local-opacity-test-key');
    assert.equal(requests[0].body.messages.at(-1).content, draft);
    assert.equal(await page.locator('#transparent-send').isDisabled(), true);
    assert.equal(await page.locator('#question-input').inputValue(), draft);
    for (const selector of [
      '#transparent-text-opacity',
      '#transparent-background-opacity',
      '#transparent-font-size',
      '#exit-transparency',
    ])
      assert.equal(await page.locator(selector).isDisabled(), false);

    // Rapid input events while a model call is pending must save only appearance fields.
    for (const [text, background] of [
      [15, 20],
      [85, 30],
      [45, 70],
    ]) {
      await setRange('#transparent-text-opacity', text);
      await setRange('#transparent-background-opacity', background);
    }
    await setRange('#transparent-font-size', 32);
    await setRange('#transparent-font-size', 22);
    assert.equal(await effectiveOpacity('#question-input'), 0.45);
    assert.equal(await effectiveOpacity('#transparent-font-size-value'), 0.45);
    await assertNativeBackground(0.7);
    await page.locator('#exit-transparency').click();
    await waitMode(false);
    const restoredStyles = await page.locator('#question-input').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        background: style.backgroundColor,
        opacity: style.opacity,
        fontSize: style.fontSize,
      };
    });
    assert.deepEqual(
      restoredStyles,
      normalStyles,
      'transparent appearance must not change the normal UI',
    );
    assert.deepEqual(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds(),
      ),
      originalWindow.bounds,
    );
    assert.equal(await page.locator('#question-input').inputValue(), draft);
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    const firstAnswer = '点击发送成功，事件循环会调度任务。';
    complete(pendingResponse, firstAnswer);
    await page.waitForFunction(
      (answer) => document.querySelector('#answer-body')?.textContent.includes(answer),
      firstAnswer,
    );
    await page.waitForFunction(() => document.querySelector('#question-input')?.disabled === false);
    await waitSaved(45, 70, 22);
    assert.equal(await effectiveOpacity('.question-bubble'), 0.45);
    assert.equal(await effectiveOpacity('.markdown-content'), 0.45);
    assert.equal(
      await page.locator('#transparent-text-opacity').inputValue(),
      '45',
      'the completed ask snapshot must not overwrite newer slider changes',
    );
    assert.equal(await page.locator('#transparent-background-opacity').inputValue(), '70');
    assert.equal(await page.locator('#transparent-font-size').inputValue(), '22');
    for (const selector of ['#question-input', '.question-bubble', '.markdown-content']) {
      assert.equal(
        await page
          .locator(selector)
          .first()
          .evaluate((element) => getComputedStyle(element).fontSize),
        '22px',
        'all Q&A text must use the selected font size after a reply',
      );
    }
    await assertNativeBackground(0.7);

    holdResponse = false;
    await page.locator('#question-input').fill('透明模式继续按 Ctrl Enter 提问。');
    await page.locator('#question-input').press('Control+Enter');
    await page.waitForFunction(() =>
      document.querySelector('#answer-body')?.textContent.includes('键盘继续问答成功。'),
    );
    await page.waitForFunction(() => document.querySelector('#question-input')?.disabled === false);
    assert.equal(
      requests.length,
      2,
      'the keyboard shortcut must produce exactly one additional answer',
    );
    assert.equal(await page.locator('#question-input').inputValue(), '');
    assert.equal(await page.locator('#transparent-capture-answer').isVisible(), true);

    await setRange('#transparent-text-opacity', 35);
    await setRange('#transparent-background-opacity', 60);
    await setRange('#transparent-font-size', 24);
    await waitSaved(35, 60, 24);
    const saved = await bootstrap();
    assert.equal(saved.settings.hasApiKey, true);
    assert.equal(saved.settings.model, 'local-opacity-test');
    assert.ok(
      saved.sessions.some((session) =>
        session.messages.some((message) => message.content === firstAnswer),
      ),
      'saving opacity must preserve the completed conversation',
    );
    await application.close();
    application = null;
    await launch();
    const persisted = await bootstrap();
    assert.equal(persisted.settings.transparentTextOpacity, 35);
    assert.equal(persisted.settings.transparentBackgroundOpacity, 60);
    assert.equal(persisted.settings.transparentFontSize, 24);
    assert.equal(persisted.settings.hasApiKey, true);
    assert.equal(
      await effectiveOpacity('#question-input'),
      1,
      'the next launch still starts with an unaffected normal UI',
    );
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    assert.equal(await page.locator('#transparent-text-opacity').inputValue(), '35');
    assert.equal(await page.locator('#transparent-background-opacity').inputValue(), '60');
    assert.equal(await page.locator('#transparent-font-size').inputValue(), '24');
    assert.equal(
      await page
        .locator('.markdown-content')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
      '24px',
    );
    assert.equal(await effectiveOpacity('.markdown-content'), 0.35);
    // A restarted renderer has a new id; check its independently painted alpha here.
    const restartedSurface = await nativeSurface();
    assert.equal(restartedSurface.opacity, 1);
    for (const alpha of restartedSurface.alphas) assert.ok(Math.abs(alpha - 153) <= 2);
    assert.equal(requests.length, 2, 'restoring saved opacity and answers must not call a model');
    assert.deepEqual(errors, []);
  },
);
