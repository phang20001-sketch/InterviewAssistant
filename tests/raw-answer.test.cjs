'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { _electron } = require('playwright');
const { editActiveModel } = require('./helpers/model-manager.cjs');

const root = path.resolve(__dirname, '..');

test(
  'screen answers always display the provider text and preserve long raw answers after restart',
  { timeout: 120000 },
  async (t) => {
    const work = path.join(root, 'work');
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'raw-answer-test-'));
    const rawAnswer = [
      '  这是模型直接返回的回答，不符合约定格式。',
      '',
      '1. 参考答案：B',
      '解析：模型额外写出的说明也必须可见。',
      '```javascript',
      'function answer() {',
      '    const result = 42;',
      '    return result;',
      '}',
      '```',
      '<img src="invalid" onerror="window.__rawAnswerExecuted = true">',
      '  末尾空白保留  ',
      '',
      '',
    ].join('\n');
    const longAnswer = [
      '  LONG_ANSWER_START',
      '```javascript',
      ...Array.from(
        { length: 1100 },
        (_, index) =>
          `    // 原文第 ${String(index).padStart(4, '0')} 行：保持缩进、内容和换行，不要截断模型已经返回的回答。  `,
      ),
      '    return "LONG_ANSWER_END";',
      '```',
      '  最后一行也要完整保留  ',
      '',
      '',
    ].join('\n');
    const refusal = '  模型的原始提示：当前画面中的文字不清晰，请提供更清晰的截图。\n';
    assert.ok(longAnswer.length > 35000);

    const responses = [
      { message: { content: rawAnswer }, finish_reason: 'stop' },
      { message: { content: longAnswer }, finish_reason: 'length' },
      { message: { content: '', refusal }, finish_reason: 'content_filter' },
    ];
    const requests = [];
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        authorization: request.headers.authorization,
      });
      const choice = responses[requests.length - 1];
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [choice || { message: { content: '重复请求' } }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    let application;
    let page;
    const pageErrors = [];
    t.after(async () => {
      if (application) await application.close().catch(() => {});
      server.closeAllConnections();
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
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.waitForFunction(async () => {
        if (!window.desktop?.captureCurrentScreen) return false;
        const state = await window.desktop.bootstrap();
        return document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}`;
      });
    };
    await launch();

    // Every capture uses a bundled icon and every request uses this local mock.
    const fixture =
      'data:image/png;base64,' +
      (await fs.readFile(path.join(root, 'assets/icon.png'))).toString('base64');
    await application.evaluate(
      ({ desktopCapturer, nativeImage, BrowserWindow, screen, systemPreferences }, dataUrl) => {
        if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';
        const thumbnail = nativeImage.createFromDataURL(dataUrl);
        desktopCapturer.getSources = async () => {
          const window = BrowserWindow.getAllWindows()[0];
          const display = screen.getDisplayMatching(window.getBounds());
          return [
            {
              id: 'screen:0:0',
              display_id: String(display.id),
              name: '本地测试屏幕',
              thumbnail,
            },
          ];
        };
      },
      fixture,
    );
    await page.locator('[data-view="settings"]').click();
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-raw-answer-test',
      apiKey: 'local-raw-answer-test-key',
      demoMode: false,
    });
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      () => document.querySelector('#model-name')?.textContent === 'local-raw-answer-test',
    );
    await page.locator('[data-view="assistant"]').click();

    const draft = '这是未发送的草稿，截屏作答不能清空它。';
    await page.locator('#question-input').fill(draft);
    const currentAnswers = () =>
      page.evaluate(async () => {
        const state = await window.desktop.bootstrap();
        return (
          state.sessions
            .find((session) => session.id === state.activeSessionId)
            ?.messages.filter((message) => message.role === 'assistant') || []
        );
      });
    const clickAndExpect = async (selector, expected, count) => {
      await page.locator(selector).click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('#answer-body .screen-answer-content').length === count &&
          document.querySelector('#capture-answer')?.disabled === false,
        count,
      );
      assert.equal(requests.length, count, 'a response must never trigger a formatting retry');
      assert.equal(
        await page.locator('#answer-body .screen-answer-content').last().textContent(),
        expected,
        'display the complete provider text including whitespace, explanation and code',
      );
      assert.equal((await currentAnswers()).at(-1).content, expected);
      assert.equal(await page.locator('#question-input').inputValue(), draft);
      assert.doesNotMatch(
        await page.locator('#toast-container').textContent(),
        /截屏作答失败|格式|GatewayError|studio:ask/,
      );
    };

    await clickAndExpect('#capture-answer', rawAnswer, 1);
    assert.equal(
      await page
        .locator(
          '#answer-body .screen-answer-content img, #answer-body .screen-answer-content script',
        )
        .count(),
      0,
      'untrusted model text must remain literal text',
    );
    assert.equal(await page.evaluate(() => window.__rawAnswerExecuted), undefined);
    for (const request of requests) {
      assert.equal(request.authorization, 'Bearer local-raw-answer-test-key');
      assert.equal(request.body.messages.length, 2);
      assert.match(request.body.messages[0].content, /题号/);
      assert.match(request.body.messages[0].content, /答案/);
      assert.ok(request.body.messages.at(-1).content.some((part) => part.type === 'image_url'));
    }

    await page.locator('#toggle-transparency').click();
    await page.waitForFunction(() => document.body.classList.contains('transparent-mode'));
    await clickAndExpect('#transparent-capture-answer', longAnswer, 2);
    assert.equal(await page.locator('#transparent-capture-answer').isVisible(), true);
    assert.equal(
      await page
        .locator('#answer-body .screen-answer-content')
        .last()
        .evaluate((element) => getComputedStyle(element).whiteSpace),
      'pre-wrap',
    );
    const scroll = await page.locator('#answer-body').evaluate((element) => {
      const overflow = getComputedStyle(element).overflowY;
      element.scrollTop = 0;
      const start = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      return {
        overflow,
        start,
        end: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    assert.equal(scroll.overflow, 'auto');
    assert.equal(scroll.start, 0);
    assert.ok(scroll.end > 0 && scroll.scrollHeight > scroll.clientHeight);

    await clickAndExpect('#transparent-capture-answer', refusal, 3);
    assert.equal(
      (await page.evaluate(() => window.desktop.getWindowState())).transparentMode,
      true,
    );
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'workspace.json'), 'utf8'));
    const savedAnswers = saved.sessions
      .flatMap((session) => session.messages)
      .filter((message) => message.role === 'assistant');
    assert.deepEqual(
      savedAnswers.map((message) => message.content),
      [rawAnswer, longAnswer, refusal],
      'stored answers must preserve every character returned by the provider',
    );

    await application.close();
    application = null;
    await launch();
    await page.locator('#answer-body .screen-answer-content').nth(2).waitFor({ state: 'attached' });
    assert.deepEqual(await page.locator('#answer-body .screen-answer-content').allTextContents(), [
      rawAnswer,
      longAnswer,
      refusal,
    ]);
    assert.deepEqual(
      (await currentAnswers()).map((message) => message.content),
      [rawAnswer, longAnswer, refusal],
    );
    assert.equal(requests.length, 3, 'loading stored answers must not call the provider again');
    assert.deepEqual(pageErrors, []);
  },
);
