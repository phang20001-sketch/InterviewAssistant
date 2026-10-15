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
  'one-click screen answers select the current display and work transparently without losing drafts',
  { timeout: 120000 },
  async (t) => {
    const work = path.join(root, 'work');
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'screen-answer-test-'));
    const requests = [];
    const events = new EventEmitter();
    let responseMode = 'success';
    let pendingResponse;
    const complete = (
      response,
      answers = [
        { number: '12', answer: 'A' },
        { number: '14', answer: 'B' },
      ],
    ) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers }) } }] }),
      );
    };
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({ body, authorization: request.headers.authorization });
      if (responseMode === 'hold') {
        pendingResponse = response;
        events.emit('pending');
      } else if (responseMode === 'reject') {
        response.writeHead(429, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'private-provider-error' } }));
      } else complete(response);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    let application;
    let page;
    t.after(async () => {
      if (pendingResponse && !pendingResponse.writableEnded) pendingResponse.end('{}');
      if (page && !page.isClosed())
        await page.screenshot({ path: path.join(directory, 'last-screen.png') }).catch(() => {});
      if (application) await application.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const errors = [];
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
        if (!window.desktop?.captureCurrentScreen) return false;
        const state = await window.desktop.bootstrap();
        return document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}`;
      });
    };
    await launch();

    // The screen source is a deterministic local icon, never the user's desktop.
    const fixture =
      'data:image/png;base64,' +
      (await fs.readFile(path.join(root, 'assets/icon.png'))).toString('base64');
    const expectedImage = await application.evaluate(
      ({ desktopCapturer, nativeImage, BrowserWindow, screen, systemPreferences }, dataUrl) => {
        if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';
        const target = nativeImage.createFromDataURL(dataUrl).resize({ width: 96, height: 96 });
        const other = nativeImage.createFromDataURL(dataUrl).resize({ width: 32, height: 32 });
        globalThis.__screenAnswerCapture = {
          calls: [],
          failure: null,
          singleSource: false,
          mismatch: false,
        };
        desktopCapturer.getSources = async (options) => {
          const window = BrowserWindow.getAllWindows()[0];
          const display = screen.getDisplayMatching(window.getBounds());
          const probe = globalThis.__screenAnswerCapture;
          probe.calls.push({ visible: window.isVisible(), displayId: String(display.id), options });
          if (probe.failure) {
            const message = probe.failure;
            probe.failure = null;
            throw new Error(message);
          }
          const selected = {
            id: 'screen:1:0',
            display_id: probe.mismatch ? 'not-current-either' : String(display.id),
            name: '软件所在屏幕',
            thumbnail: target,
          };
          if (probe.singleSource) return [{ ...selected, display_id: '' }];
          return [
            {
              id: 'screen:999:0',
              display_id: 'not-the-current-display',
              name: '另一个屏幕',
              thumbnail: other,
            },
            selected,
          ];
        };
        return 'data:image/png;base64,' + target.toPNG().toString('base64');
      },
      fixture,
    );
    const native = async () =>
      application.evaluate(({ BrowserWindow }) => ({
        visible: BrowserWindow.getAllWindows()[0].isVisible(),
        calls: globalThis.__screenAnswerCapture.calls,
      }));
    const waitIdle = () =>
      page.waitForFunction(
        () =>
          document.querySelector('#capture-answer')?.disabled === false &&
          document.querySelector('#question-input')?.disabled === false,
      );
    const waitMode = (enabled) =>
      page.waitForFunction(
        (enabled) => document.body.classList.contains('transparent-mode') === enabled,
        enabled,
      );
    const currentMessages = () =>
      page.evaluate(async () => {
        const state = await window.desktop.bootstrap();
        return state.sessions.find((item) => item.id === state.activeSessionId)?.messages || [];
      });
    const lastAnswer = async () =>
      (await currentMessages()).filter((message) => message.role === 'assistant').at(-1)?.content;
    const assertDraft = async (draft, attachment) => {
      assert.equal(await page.locator('#question-input').inputValue(), draft);
      assert.equal(await page.locator('#screenshot-preview').getAttribute('src'), attachment);
      assert.equal(
        await page.locator('#image-preview').evaluate((element) => element.hidden),
        false,
      );
    };

    // Demo mode must never pretend to have recognized an image.
    await page.locator('#capture-answer').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('支持图片'),
    );
    assert.equal((await native()).calls.length, 0);
    assert.equal(requests.length, 0);
    assert.equal((await currentMessages()).length, 0);

    // Every network request in this test goes to a disposable local provider.
    await page.locator('[data-view="settings"]').click();
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-screen-vision-test',
      apiKey: 'local-screen-answer-test-key',
      demoMode: false,
    });
    await page.locator('#setting-answerStyle').selectOption('detailed');
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      () => document.querySelector('#model-name')?.textContent === 'local-screen-vision-test',
    );
    await page.locator('[data-view="assistant"]').click();

    const normalBounds = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const previous = window.getBounds();
      window.setBounds({ width: 1000, height: 700 });
      return previous;
    });
    await page.waitForFunction(() => window.innerWidth === 1000);
    const normalLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width };
      };
      return {
        width: innerWidth,
        capture: rect('#capture-answer'),
        restore: rect('#toggle-transparency'),
        breadcrumb: rect('.breadcrumb'),
      };
    });
    assert.ok(
      normalLayout.capture.left >= normalLayout.breadcrumb.right,
      'the capture control must fit beside the breadcrumb at the minimum window width',
    );
    assert.ok(
      normalLayout.capture.width >= 80 && normalLayout.capture.right <= normalLayout.restore.left,
    );
    assert.ok(normalLayout.restore.right <= normalLayout.width);
    await application.evaluate(
      ({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds),
      normalBounds,
    );

    // An already attached image and unsent question belong to the ordinary ask flow.
    const draft = '草稿要保留：请详细解释原来的问题。';
    await page.locator('#question-input').fill(draft);
    await page.locator('[data-mode="screenshot"]').click();
    await page.locator('#pick-screen').click();
    await page.locator('#screen-list button').first().click();
    await page.locator('#image-preview').waitFor({ state: 'visible' });
    await waitIdle();
    const attachment = await page.locator('#screenshot-preview').getAttribute('src');
    assert.notEqual(
      attachment,
      expectedImage,
      'the retained manual attachment must differ from the freshly captured screen',
    );
    const beforeCaptures = (await native()).calls.length;

    await page.locator('#capture-answer').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#answer-body .markdown-content').length === 1,
    );
    await waitIdle();
    assert.equal(requests.length, 1);
    assert.equal(
      (await native()).calls.length,
      beforeCaptures + 1,
      'one click must capture once without opening a screen picker',
    );
    assert.equal(await page.locator('#screen-dialog').evaluate((dialog) => dialog.open), false);
    assert.equal(
      (await native()).visible,
      true,
      'capture must restore the native window before showing the answer',
    );
    const capture = (await native()).calls.at(-1);
    assert.equal(
      capture.visible,
      false,
      'the app must be hidden while desktopCapturer takes the screenshot',
    );
    assert.deepEqual(capture.options.types, ['screen']);
    assert.ok(
      capture.options.thumbnailSize.width > 0 && capture.options.thumbnailSize.width <= 3840,
    );
    assert.ok(
      capture.options.thumbnailSize.height > 0 && capture.options.thumbnailSize.height <= 2160,
    );
    const request = requests[0];
    assert.equal(request.authorization, 'Bearer local-screen-answer-test-key');
    assert.equal(request.body.model, 'local-screen-vision-test');
    assert.equal(
      request.body.messages.length,
      2,
      'screen questions must not inherit unrelated conversation or detailed-answer style',
    );
    assert.match(request.body.messages[0].content, /题号/);
    assert.match(request.body.messages.at(-1).content[0].text, /只给出题号和最终答案，不需要解析/);
    const userContent = request.body.messages.at(-1).content;
    assert.ok(Array.isArray(userContent));
    assert.equal(
      userContent.find((part) => part.type === 'image_url').image_url.url,
      expectedImage,
      'choose the matching display_id even when it is not the first source',
    );
    assert.equal(await lastAnswer(), '12. A\n14. B');
    assert.equal(
      await page.locator('#answer-body .screen-answer-content').textContent(),
      '12. A\n14. B',
      'rendering must preserve the actual nonconsecutive question numbers as text',
    );
    assert.equal(
      await page
        .locator('#answer-body .screen-answer-content ol, #answer-body .screen-answer-content li')
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('#answer-body .screen-answer-content')
        .evaluate((element) => getComputedStyle(element).whiteSpace),
      'pre-wrap',
    );
    assert.equal((await currentMessages()).at(-1).answerFormat, 'numbered-only');
    await assertDraft(draft, attachment);

    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    assert.equal(await page.locator('#capture-answer').isVisible(), false);
    assert.equal(await page.locator('#transparent-capture-answer').isVisible(), true);
    const transparentStyle = await page
      .locator('#transparent-capture-answer')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          border: style.borderTopWidth,
          appRegion: style.getPropertyValue('-webkit-app-region'),
        };
      });
    assert.match(transparentStyle.background, /^rgba\([^)]*,\s*0\)$/);
    assert.equal(transparentStyle.shadow, 'none');
    assert.equal(transparentStyle.border, '0px');
    assert.equal(transparentStyle.appRegion, 'no-drag');
    const overlayLayout = await page.evaluate(() => {
      const capture = document.querySelector('#transparent-capture-answer').getBoundingClientRect();
      const restore = document.querySelector('#exit-transparency').getBoundingClientRect();
      const drag = document.querySelector('#window-titlebar').getBoundingClientRect();
      return {
        captureLeft: capture.left,
        captureRight: capture.right,
        restoreLeft: restore.left,
        restoreRight: restore.right,
        dragLeft: drag.left,
      };
    });
    assert.ok(
      overlayLayout.restoreRight <= overlayLayout.dragLeft,
      'the native drag area must start after the three left-side actions',
    );
    assert.ok(
      overlayLayout.captureRight <= overlayLayout.restoreLeft,
      'transparent capture and restore controls must not overlap',
    );

    responseMode = 'hold';
    const pending = once(events, 'pending', { signal: AbortSignal.timeout(10000) });
    await page.locator('#transparent-capture-answer').click();
    await pending;
    assert.equal(requests.length, 2);
    assert.equal((await native()).visible, true);
    assert.equal((await native()).calls.at(-1).visible, false);
    assert.equal(await page.locator('#transparent-capture-answer').isDisabled(), true);
    assert.equal(await page.locator('#capture-answer').isDisabled(), true);
    assert.equal(
      await page.locator('#exit-transparency').isDisabled(),
      false,
      'mode controls must remain available while the AI responds',
    );
    assert.equal(await page.locator('#transparent-capture-answer-label').textContent(), '作答中…');
    await page.locator('#transparent-capture-answer').evaluate((button) => button.click());
    assert.equal(requests.length, 2, 'repeated clicks while busy must not create more AI requests');
    await page.locator('#exit-transparency').click();
    await waitMode(false);
    await page.locator('#toggle-transparency').click();
    await waitMode(true);
    complete(pendingResponse, [
      { number: '01', answer: 'AC' },
      { number: '3(1)', answer: 'const result = 42;\nreturn result;' },
    ]);
    await page.waitForFunction(
      () => document.querySelectorAll('#answer-body .markdown-content').length === 2,
    );
    await waitIdle();
    const multilineAnswer = '01. AC\n3(1). const result = 42;\nreturn result;';
    assert.equal(await lastAnswer(), multilineAnswer);
    assert.equal(
      await page.locator('#answer-body .screen-answer-content').last().textContent(),
      multilineAnswer,
      'leading zeroes, subquestion numbers and code line breaks must remain intact',
    );
    assert.equal(await page.locator('#transparent-capture-answer-label').textContent(), '截屏作答');
    await assertDraft(draft, attachment);

    // Both capture and model failures must restore the window and preserve the draft.
    const messagesBeforeFailure = (await currentMessages()).length;
    await application.evaluate(() => {
      globalThis.__screenAnswerCapture.failure = 'LOCAL_SCREEN_CAPTURE_FAILURE';
    });
    await page.locator('#transparent-capture-answer').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#toast-container')
        ?.textContent.includes('LOCAL_SCREEN_CAPTURE_FAILURE'),
    );
    await waitIdle();
    assert.equal(requests.length, 2);
    assert.equal((await native()).visible, true);
    assert.equal((await currentMessages()).length, messagesBeforeFailure);
    await assertDraft(draft, attachment);

    await application.evaluate(() => {
      globalThis.__screenAnswerCapture.mismatch = true;
    });
    await page.locator('#transparent-capture-answer').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('无法读取当前屏幕'),
    );
    await waitIdle();
    assert.equal(
      requests.length,
      2,
      'multiple unmatched sources must not silently capture another display',
    );
    assert.equal((await native()).visible, true);
    assert.equal((await currentMessages()).length, messagesBeforeFailure);
    await application.evaluate(() => {
      globalThis.__screenAnswerCapture.mismatch = false;
    });

    responseMode = 'reject';
    await page.locator('#transparent-capture-answer').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('额度'),
    );
    assert.doesNotMatch(
      await page.locator('#toast-container').textContent(),
      /Error invoking remote method|GatewayError:|studio:ask/,
      'provider errors should show a readable message without the Electron IPC wrapper',
    );
    await waitIdle();
    assert.equal(requests.length, 3);
    assert.equal((await native()).visible, true);
    assert.equal(
      (await currentMessages()).length,
      messagesBeforeFailure,
      'failed responses must not append a partial conversation',
    );
    await assertDraft(draft, attachment);

    // A single display can still be captured if its platform source omits display_id.
    responseMode = 'success';
    await application.evaluate(() => {
      globalThis.__screenAnswerCapture.singleSource = true;
    });
    await page.locator('#transparent-capture-answer').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#answer-body .markdown-content').length === 3,
    );
    await waitIdle();
    assert.equal(requests.length, 4);
    assert.equal(await lastAnswer(), '12. A\n14. B');
    assert.equal((await native()).visible, true);
    await assertDraft(draft, attachment);
    assert.equal(
      (await page.evaluate(() => window.desktop.getWindowState())).transparentMode,
      true,
    );

    const capturesBeforeRace = (await native()).calls.length;
    const race = await page.evaluate(async () => {
      const results = await Promise.allSettled([
        window.desktop.captureCurrentScreen(),
        window.desktop.captureCurrentScreen(),
      ]);
      return results.map((result) =>
        result.status === 'fulfilled'
          ? { status: result.status }
          : { status: result.status, error: result.reason.message },
      );
    });
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
    assert.match(race.find((result) => result.status === 'rejected').error, /正在截取屏幕/);
    assert.equal(
      (await native()).calls.length,
      capturesBeforeRace + 1,
      'native capture calls must be serialized even across direct IPC callers',
    );
    assert.equal((await native()).calls.at(-1).visible, false);
    assert.equal((await native()).visible, true);
    assert.equal(requests.length, 4, 'capture-only IPC calls must never send a model request');

    await application.close();
    application = null;
    await launch();
    const restoredAnswers = (await currentMessages()).filter(
      (message) => message.role === 'assistant',
    );
    assert.equal(restoredAnswers.length, 3);
    assert.ok(
      restoredAnswers.every((message) => message.answerFormat === 'numbered-only'),
      'the dedicated answer format must survive persistence and restart',
    );
    assert.equal(restoredAnswers[1].content, multilineAnswer);
    await page.locator('#answer-body .screen-answer-content').nth(2).waitFor({ state: 'attached' });
    assert.deepEqual(await page.locator('#answer-body .screen-answer-content').allTextContents(), [
      '12. A\n14. B',
      multilineAnswer,
      '12. A\n14. B',
    ]);
    assert.equal(
      await page
        .locator('#answer-body .screen-answer-content ol, #answer-body .screen-answer-content li')
        .count(),
      0,
    );
    assert.equal(
      (await page.evaluate(() => window.desktop.getWindowState())).transparentMode,
      false,
    );
    assert.equal(
      requests.length,
      4,
      'restoring saved screen answers must not make additional model requests',
    );
    assert.deepEqual(errors, []);
  },
);
