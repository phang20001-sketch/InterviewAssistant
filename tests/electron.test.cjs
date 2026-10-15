const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { _electron } = require('playwright');
const {
  editActiveModel,
  assertSavedModelKey,
  verifyActiveModel,
} = require('./helpers/model-manager.cjs');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');

test(
  'desktop workflow: demo, model settings, real protocol, screenshots, practice, export and restart',
  { timeout: 120000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'electron-test-'));
    const savedKeyMask = '••••••••••••••••';
    const initialKey = 'local-test-only-key';
    const replacementKey = 'local-test-replacement-key';
    const transcriptionKey = 'local-test-transcription-key';
    const requests = [];
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (request.url.endsWith('/audio/transcriptions')) {
        requests.push({
          audio: true,
          body: Buffer.concat(chunks).toString(),
          authorization: request.headers.authorization,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end(JSON.stringify({ text: '请解释事件循环。' }));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({ ...body, authorization: request.headers.authorization });
      if (body.model === 'local-rejected-model') {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        return response.end(JSON.stringify({ error: { message: 'private-provider-error' } }));
      }
      const last = body.messages.at(-1).content;
      const failed = typeof last === 'string' && last.includes('FAIL_429');
      const generatedQuestions =
        typeof last === 'string' && last.includes('生成一整轮简历模拟面试题');
      const practiceReview = typeof last === 'string' && last.includes('请只点评下面这一道');
      const content = generatedQuestions
        ? JSON.stringify({ questions: [{ title: '你如何验证简历中自动化测试的效果？' }] })
        : practiceReview
          ? JSON.stringify({ score: 86, content: '已连接测试模型：验证指标清晰，可补充异常场景。' })
          : '## 已连接测试模型\n\n这是通过真实 HTTP 协议返回的测试回答。\n\n```js\nconsole.log("ready");\n```';
      response.writeHead(failed ? 429 : 200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify(
          failed
            ? { error: { message: 'private-provider-error' } }
            : {
                choices: [
                  {
                    message: {
                      content,
                    },
                  },
                ],
              },
        ),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let application;
    t.after(async () => {
      if (application) {
        await (await application.firstWindow())
          .screenshot({ path: path.join(work, 'last-test-screen.png') })
          .catch(() => {});
        await application.close().catch(() => {});
      }
      server.close();
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
      application = await _electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '.'],
        cwd: root,
        env,
      });
      const page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      await page.waitForFunction(async () => {
        if (!window.desktop) return false;
        const loaded = await window.desktop.bootstrap();
        return (
          document.querySelector('#app-version')?.textContent === `v${loaded.appInfo.version}` &&
          document.querySelector('#question-input')?.disabled === false
        );
      });
      return page;
    };
    let page = await launch();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() =>
      document.querySelector('#model-name')?.textContent.includes('演示'),
    );
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    await page.locator('#question-input').fill('请解释 Redis 缓存一致性。');
    await page.locator('#ask-question').click();
    await page.waitForFunction(() =>
      document.querySelector('#answer-body')?.textContent.includes('Cache Aside'),
    );
    assert.equal(requests.length, 0);
    await page.locator('#copy-answer').click();
    assert.match(
      await application.evaluate(({ clipboard }) => clipboard.readText()),
      /Cache Aside/,
    );
    await page.screenshot({ path: path.join(work, 'app-preview.png') });

    await page.locator('[data-view="library"]').click();
    await page.locator('#library-search').fill('闭包');
    assert.equal(await page.locator('.library-question-card').count(), 0);
    assert.equal(requests.length, 0);
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.locator('#setting-baseUrl').count(), 0);
    assert.equal(await page.locator('#setting-model').count(), 0);
    assert.equal(await page.locator('#setting-apiKey').count(), 0);
    await page.locator('#setting-role').fill('测试开发工程师');
    await page
      .locator('#setting-resume')
      .fill('测试简历：负责接口自动化和性能验证，参与业务系统测试。');
    await page.locator('.transcription-settings summary').click();
    await page.locator('#setting-transcriptionApiKey').fill(transcriptionKey);
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      (mask) => document.querySelector('#setting-transcriptionApiKey')?.value === mask,
      savedKeyMask,
    );
    for (const name of ['transcriptionApiKey']) {
      assert.equal(await page.locator(`#setting-${name}`).inputValue(), savedKeyMask);
      assert.equal(
        await page.locator(`#setting-${name}`).evaluate((input) => input.readOnly),
        true,
      );
      await page.locator(`#replace-${name}`).click();
      assert.equal(await page.locator(`#setting-${name}`).inputValue(), '');
      assert.equal(
        await page.locator(`#setting-${name}`).evaluate((input) => input.readOnly),
        false,
      );
      await page.locator(`#replace-${name}`).click();
      assert.equal(await page.locator(`#setting-${name}`).inputValue(), savedKeyMask);
      assert.equal(
        await page.locator(`#setting-${name}`).evaluate((input) => input.readOnly),
        true,
      );
    }
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-rejected-model',
      apiKey: initialKey,
      demoMode: true,
    });
    await assertSavedModelKey(page);
    const initialSaved = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(initialSaved.settings.demoMode, true);
    assert.equal(initialSaved.settings.hasApiKey, true);
    assert.equal(initialSaved.settings.hasTranscriptionApiKey, true);
    assert.equal(
      [initialKey, transcriptionKey].some((key) => JSON.stringify(initialSaved).includes(key)),
      false,
    );
    const initialPersisted = await fs.readFile(path.join(directory, 'workspace.json'), 'utf8');
    assert.equal(
      [initialKey, transcriptionKey].some((key) => initialPersisted.includes(key)),
      false,
    );

    // A failed real verification keeps the saved configuration and demo mode.
    await verifyActiveModel(page);
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('无效或已过期'),
    );
    const rejected = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(rejected.settings.demoMode, true);
    assert.equal(rejected.settings.model, 'local-rejected-model');
    assert.equal(rejected.settings.hasApiKey, true);
    await assertSavedModelKey(page);
    assert.equal(requests.at(-1).authorization === `Bearer ${initialKey}`, true);

    // The normal configuration path must enable AI without a manual demo toggle.
    await editActiveModel(page, { model: 'local-test-model', test: true });
    await page.waitForFunction(
      async () => (await window.desktop.bootstrap()).settings.demoMode === false,
    );
    await assertSavedModelKey(page);
    assert.equal(requests.at(-1).authorization === `Bearer ${initialKey}`, true);
    assert.equal(await page.locator('#model-name').textContent(), 'local-test-model');

    // Reopening and saving masked fields must never replace stored credentials.
    await page.locator('[data-view="assistant"]').click();
    await page.locator('[data-view="settings"]').click();
    await page.locator('#save-settings').click();
    await page.waitForFunction(() => document.querySelector('#save-settings')?.disabled === false);
    await verifyActiveModel(page);
    assert.equal(requests.at(-1).authorization === `Bearer ${initialKey}`, true);

    // Blank replacements retain both saved keys; actual replacement changes requests.
    await page.locator('#replace-transcriptionApiKey').click();
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      (mask) => document.querySelector('#setting-transcriptionApiKey')?.value === mask,
      savedKeyMask,
    );
    await editActiveModel(page, { apiKey: '', test: true });
    assert.equal(requests.at(-1).authorization, `Bearer ${initialKey}`);
    await editActiveModel(page, { apiKey: replacementKey, test: true });
    await assertSavedModelKey(page);
    assert.equal(requests.at(-1).authorization === `Bearer ${replacementKey}`, true);
    const saved = await page.evaluate(() => window.desktop.bootstrap());
    const persisted = await fs.readFile(path.join(directory, 'workspace.json'), 'utf8');
    assert.equal(
      [initialKey, replacementKey, transcriptionKey, savedKeyMask].some((key) =>
        persisted.includes(key),
      ),
      false,
    );
    assert.equal(
      [initialKey, replacementKey, transcriptionKey].some((key) =>
        JSON.stringify(saved).includes(key),
      ),
      false,
    );

    await page.locator('[data-view="assistant"]').click();
    await page.locator('#question-input').fill('现在测试真实模型协议');
    await page.locator('#ask-question').click();
    await page.waitForFunction(() =>
      document.querySelector('#answer-body')?.textContent.includes('已连接测试模型'),
    );
    assert.equal(await page.locator('#answer-body pre code').count(), 1);
    assert.equal(requests.at(-1).model, 'local-test-model');
    assert.equal(requests.at(-1).authorization === `Bearer ${replacementKey}`, true);

    const before = (await page.evaluate(() => window.desktop.bootstrap())).sessions.find(
      (item) => item.id === saved.activeSessionId,
    ).messages.length;
    await page.locator('#question-input').fill('FAIL_429');
    await page.locator('#ask-question').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('额度'),
    );
    const failedState = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(
      failedState.sessions.find((item) => item.id === saved.activeSessionId).messages.length,
      before,
    );

    const pixel =
      'data:image/png;base64,' +
      (await fs.readFile(path.join(root, 'assets/icon.png'))).toString('base64');
    await application.evaluate(({ desktopCapturer, nativeImage }, dataUrl) => {
      desktopCapturer.getSources = async () => [
        { id: 'screen:0:0', name: '测试屏幕', thumbnail: nativeImage.createFromDataURL(dataUrl) },
      ];
    }, pixel);
    await page.locator('[data-mode="screenshot"]').click();
    await page.locator('#pick-screen').click();
    await page.locator('#screen-list button').first().click();
    await page.locator('#image-preview').waitFor({ state: 'visible' });
    await page.locator('#question-input').fill('请分析截图');
    await page.locator('#ask-question').click();
    await page.waitForFunction(
      () => document.querySelector('#ask-label')?.textContent === '生成回答',
    );
    assert.ok(Array.isArray(requests.at(-1).messages.at(-1).content));
    // Chromium supplies a synthetic microphone so the test never records the user.
    await page.locator('[data-mode="voice"]').click();
    await page.locator('#record-button').click();
    await page.waitForFunction(() =>
      document.querySelector('#record-button-label')?.textContent.includes('结束'),
    );
    await page.waitForTimeout(350);
    await page.locator('#record-button').click();
    await page.waitForFunction(
      () => document.querySelector('#question-input')?.value === '请解释事件循环。',
    );
    assert.equal(requests.at(-1).audio, true);
    assert.equal(requests.at(-1).authorization === `Bearer ${transcriptionKey}`, true);
    assert.match(requests.at(-1).body, /recording.webm/);

    const exportFile = path.join(directory, 'export.md');
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    }, exportFile);
    await page.locator('#export-current').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast-container')?.textContent.includes('导出'),
    );
    assert.match(await fs.readFile(exportFile, 'utf8'), /已连接测试模型/);

    await page.locator('[data-view="mock"]').click();
    await page.locator('#new-mock').click();
    await page.waitForFunction(() =>
      document.querySelector('#mock-question')?.textContent.includes('自动化测试'),
    );
    await page
      .locator('#mock-answer')
      .fill('我负责接口自动化和性能验证，先确定业务指标，再逐步定位瓶颈并验证改进。');
    await page.locator('#submit-mock').click();
    await page.waitForFunction(() =>
      document.querySelector('#mock-feedback')?.textContent.includes('已连接测试模型'),
    );
    assert.match(requests.at(-1).messages.at(-1).content, /请只点评下面这一道/);
    assert.match(requests.at(-1).messages[0].content, /接口自动化和性能验证/);
    await page.locator('[data-view="history"]').click();
    assert.ok((await page.locator('.history-row').count()) >= 2);
    assert.deepEqual(errors, []);
    await application.close();
    application = null;
    page = await launch();
    const restored = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(restored.settings.role, '测试开发工程师');
    assert.equal(restored.settings.hasApiKey, true);
    assert.equal(restored.settings.hasTranscriptionApiKey, true);
    assert.equal(restored.settings.demoMode, false);
    assert.equal(restored.settings.model, 'local-test-model');
    assert.ok(restored.sessions.some((item) => item.mode === 'mock' && item.messages.length === 2));
    await page.locator('[data-view="settings"]').click();
    await assertSavedModelKey(page);
    await verifyActiveModel(page);
    assert.equal(requests.at(-1).authorization === `Bearer ${replacementKey}`, true);
  },
);
