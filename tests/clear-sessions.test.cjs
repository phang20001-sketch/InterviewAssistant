'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { _electron } = require('playwright');
const { installScreenFixture } = require('./helpers/screen-fixture.cjs');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');
const digest = (contents) => createHash('sha256').update(contents).digest('hex');

test(
  'clear all sessions removes every mode and local backup, retains credentials, and survives restart',
  { timeout: 120000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'clear-sessions-test-'));
    const workspaceFile = path.join(directory, 'workspace.json');
    const apiKey = 'clear-sessions-local-only-key';
    const transcriptionKey = 'clear-sessions-local-only-transcription-key';
    const oldQuestion = 'CLEAR_OLD_INTERVIEW_01';
    const oldAnswer = 'CLEAR_OLD_PROVIDER_ANSWER_01';
    const unsentQuestion = 'CLEAR_UNSENT_SCREENSHOT_DRAFT';
    const unsentMockAnswer = 'CLEAR_UNSENT_MOCK_DRAFT';
    const requests = [];
    let releaseHeldResponse;
    let heldRequestStarted;
    const heldRequest = new Promise((resolve) => {
      heldRequestStarted = resolve;
    });

    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (request.url.endsWith('/audio/transcriptions')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ text: 'CLEAR_UNSENT_VOICE_DRAFT' }));
        return;
      }

      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ body, authorization: request.headers.authorization });
      const lastQuestion = body.messages.at(-1).content;
      if (typeof lastQuestion === 'string' && lastQuestion.includes('CLEAR_HOLD_REQUEST')) {
        const released = new Promise((resolve) => {
          releaseHeldResponse = resolve;
        });
        heldRequestStarted();
        await released;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      const content = lastQuestion.includes('生成一整轮简历模拟面试题')
        ? JSON.stringify({ questions: [{ title: '根据这段简历，如何验证项目的效果？' }] })
        : oldAnswer;
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    let application;
    let page;
    const errors = [];
    t.after(async () => {
      releaseHeldResponse?.();
      if (application) await application.close().catch(() => {});
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const waitForReady = async () => {
      await page.waitForFunction(async () => {
        if (!window.desktop?.clearSessions) return false;
        const state = await window.desktop.bootstrap();
        return (
          document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}` &&
          document.querySelector('#question-input')?.disabled === false
        );
      });
    };
    const launch = async () => {
      application = await _electron.launch({
        executablePath: require('electron'),
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '.'],
        cwd: root,
        env,
      });
      await installScreenFixture(application);
      page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await waitForReady();
    };
    await launch();

    // Seed only the isolated profile through the public bridge. All model traffic
    // stays on this process's loopback server and uses synthetic credentials.
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    await page.evaluate(
      async (settings) => {
        await window.desktop.saveSettings(settings);
        for (const mode of ['interview', 'coding', 'mock']) {
          const state = await window.desktop.createSession({ mode });
          await window.desktop.ask({
            sessionId: state.activeSessionId,
            question: `CLEAR_OLD_${mode.toUpperCase()}_01`,
          });
        }
        const state = await window.desktop.bootstrap();
        const interview = state.sessions.find(
          (session) => session.mode === 'interview' && session.messages.length > 0,
        );
        await window.desktop.switchSession(interview.id);
      },
      {
        baseUrl,
        model: 'clear-sessions-local-model',
        apiKey,
        transcriptionBaseUrl: baseUrl,
        transcriptionApiKey: transcriptionKey,
        demoMode: false,
        role: '清除记录测试角色',
        resume: '这段配置资料应保留。',
        transparentTextOpacity: 53,
        transparentBackgroundOpacity: 17,
        transparentFontSize: 22,
      },
    );
    await page.reload();
    await waitForReady();
    await page.waitForFunction(
      (answer) => document.querySelector('#answer-body')?.textContent.includes(answer),
      oldAnswer,
    );

    // A request cannot be deleted mid-flight, even by calling IPC directly.
    await page.locator('#question-input').fill('CLEAR_HOLD_REQUEST');
    await page.locator('#ask-question').click();
    await Promise.race([
      heldRequest,
      new Promise((_, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Local model request did not start.')),
          10000,
        );
        timeout.unref();
      }),
    ]);
    assert.equal(await page.locator('#clear-all-sessions').isDisabled(), true);
    const duringRequest = await fs.readFile(workspaceFile);
    const rejection = await page.evaluate(async () => {
      try {
        await window.desktop.clearSessions();
        return '';
      } catch (error) {
        return error.message;
      }
    });
    assert.match(rejection, /正在生成回答或截屏/);
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(duringRequest));
    releaseHeldResponse();
    await page.waitForFunction(
      () => document.querySelector('#ask-label')?.textContent === '生成回答',
    );

    await page.locator('[data-view="mock"]').click();
    await page.locator('#new-mock').click();
    await page.waitForFunction(() => document.querySelector('#mock-answer')?.disabled === false);
    await page.locator('#mock-answer').fill(unsentMockAnswer);
    await page.locator('[data-view="assistant"]').click();
    await page.locator('[data-mode="voice"]').click();
    await page.locator('#record-button').click();
    await page.waitForFunction(() =>
      document.querySelector('#record-button-label')?.textContent.includes('结束'),
    );
    await page.locator('[data-view="history"]').click();
    assert.equal(await page.locator('#clear-all-sessions').isDisabled(), true);
    await page.locator('[data-view="assistant"]').click();
    await page.waitForTimeout(350);
    await page.locator('#record-button').click();
    await page.waitForFunction(
      () => document.querySelector('#question-input')?.value === 'CLEAR_UNSENT_VOICE_DRAFT',
    );

    const screenshot =
      'data:image/png;base64,' +
      (await fs.readFile(path.join(root, 'assets/icon.png'))).toString('base64');
    await application.evaluate(({ desktopCapturer, nativeImage }, dataUrl) => {
      desktopCapturer.getSources = async () => [
        {
          id: 'screen:0:0',
          name: '清除记录测试屏幕',
          thumbnail: nativeImage.createFromDataURL(dataUrl),
        },
      ];
    }, screenshot);
    await page.locator('[data-mode="screenshot"]').click();
    await page.locator('#pick-screen').click();
    await page.locator('.screen-option').click();
    await page.waitForFunction(() => document.querySelector('#image-preview')?.hidden === false);
    const attachedScreenshot = await page.locator('#screenshot-preview').getAttribute('src');
    assert.match(attachedScreenshot, /^data:image\/png;base64,/);
    await page.locator('#question-input').fill(unsentQuestion);
    await page.locator('[data-view="history"]').click();
    await page.waitForFunction(
      () => document.querySelector('#clear-all-sessions')?.disabled === false,
    );
    assert.equal(await page.locator('.history-row').count(), 4);

    const beforeBytes = await fs.readFile(workspaceFile);
    const before = JSON.parse(beforeBytes);
    const oldIds = before.sessions.map((session) => session.id);
    assert.ok(before.sessions.some((session) => session.messages.length === 0));
    assert.ok(beforeBytes.toString().includes(oldQuestion));
    assert.equal(beforeBytes.toString().includes(apiKey), false);
    assert.equal(beforeBytes.toString().includes(transcriptionKey), false);

    const backupNames = [
      'workspace.json.bak',
      'workspace.json.tmp',
      'workspace.json.before-1.1.3-20261015123456.bak',
      'workspace.json.before-1.0.6-20261014012345.bak',
      'workspace.before-1.0.1-1760000000000.json',
    ];
    for (const name of backupNames) {
      await fs.writeFile(path.join(directory, name), beforeBytes);
    }
    const preservedFiles = [
      path.join(directory, 'resume.md'),
      path.join(directory, 'export.md'),
      path.join(directory, 'workspace.json.before-not-a-release.bak'),
      path.join(directory, 'workspace.json.before-1.1.3-20261015123456.bak.notes'),
      path.join(work, `${path.basename(directory)}-external-export.md`),
    ];
    for (const file of preservedFiles) await fs.writeFile(file, '应保留的资料和用户导出');

    // Search must not turn the destructive action into "clear the visible rows".
    await page.locator('#history-search').fill('CLEAR_NO_SEARCH_MATCH');
    assert.equal(await page.locator('.history-row').count(), 0);
    assert.equal(await page.locator('#clear-all-sessions').isVisible(), true);
    assert.equal(await page.locator('#clear-all-sessions').isEnabled(), true);
    const confirmations = [];
    page.once('dialog', async (dialog) => {
      confirmations.push(dialog.message());
      await dialog.dismiss();
    });
    await page.locator('#clear-all-sessions').click();
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(beforeBytes));
    assert.equal(await page.locator('#question-input').inputValue(), unsentQuestion);
    assert.equal(await page.locator('#mock-answer').inputValue(), unsentMockAnswer);
    assert.equal(await page.locator('#screenshot-preview').getAttribute('src'), attachedScreenshot);
    for (const name of backupNames) {
      assert.equal(digest(await fs.readFile(path.join(directory, name))), digest(beforeBytes));
    }

    page.once('dialog', async (dialog) => {
      confirmations.push(dialog.message());
      await dialog.accept();
    });
    await page.locator('#clear-all-sessions').click();
    await page.waitForFunction(async () => {
      const state = await window.desktop.bootstrap();
      return (
        state.sessions.length === 1 &&
        state.sessions[0].messages.length === 0 &&
        document.querySelector('#question-input')?.value === '' &&
        document.querySelector('#clear-all-sessions')?.disabled === false
      );
    });
    assert.equal(confirmations.length, 2);
    assert.match(confirmations[1], /所有会话/);
    assert.match(confirmations[1], /本地聊天备份/);
    assert.match(confirmations[1], /API Key 会保留/);
    assert.equal(await page.locator('#question-input').inputValue(), '');
    assert.equal(await page.locator('#mock-answer').count(), 0);
    assert.equal((await page.locator('#mock-progress').textContent()).trim(), '等待生成题目');
    assert.equal(await page.locator('#image-preview').evaluate((element) => element.hidden), true);
    assert.equal(await page.locator('#input-source-label').textContent(), '文字输入');
    assert.equal(await page.locator('#copy-answer').isDisabled(), true);
    assert.equal(await page.locator('.mock-review-round').count(), 0);
    assert.equal((await page.locator('#history-count').textContent()).trim(), '0');
    await page.locator('#history-search').fill('');
    assert.equal(await page.locator('.history-row').count(), 0);
    assert.equal(await page.locator('#history-empty').isVisible(), true);
    assert.equal(await page.locator('#clear-all-sessions').isEnabled(), true);

    const after = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    assert.deepEqual(after.settings, before.settings);
    assert.deepEqual(after.vault, before.vault);
    assert.equal(after.sessions.length, 1);
    assert.equal(after.sessions[0].mode, 'interview');
    assert.deepEqual(after.sessions[0].messages, []);
    assert.equal(after.activeSessionId, after.sessions[0].id);
    for (const id of oldIds) assert.equal(JSON.stringify(after).includes(id), false);
    for (const text of [oldQuestion, oldAnswer, unsentQuestion, unsentMockAnswer]) {
      assert.equal(JSON.stringify(after).includes(text), false);
    }
    for (const name of backupNames) {
      await assert.rejects(fs.access(path.join(directory, name)), { code: 'ENOENT' });
    }
    for (const file of preservedFiles) {
      assert.equal(await fs.readFile(file, 'utf8'), '应保留的资料和用户导出');
    }

    // An empty history can still clear an old backup left by an earlier release.
    const laterBackup = path.join(directory, 'workspace.json.before-1.1.3-20261015123457.bak');
    await fs.writeFile(laterBackup, beforeBytes);
    page.once('dialog', async (dialog) => dialog.accept());
    await page.locator('#clear-all-sessions').click();
    await page.waitForFunction(
      (oldId) => window.desktop.bootstrap().then((state) => state.activeSessionId !== oldId),
      after.activeSessionId,
    );
    await assert.rejects(fs.access(laterBackup), { code: 'ENOENT' });
    const clearedState = await page.evaluate(() => window.desktop.bootstrap());
    await application.close();
    application = null;
    await launch();
    const restored = await page.evaluate(() => window.desktop.bootstrap());
    assert.deepEqual(restored.settings, clearedState.settings);
    assert.deepEqual(restored.sessions, clearedState.sessions);
    assert.equal(restored.activeSessionId, clearedState.activeSessionId);
    assert.equal(restored.settings.hasApiKey, true);
    assert.equal(restored.settings.hasTranscriptionApiKey, true);
    assert.equal((await page.locator('#history-count').textContent()).trim(), '0');
    assert.equal(await page.locator('#copy-answer').isDisabled(), true);

    await page.locator('#question-input').fill('CLEAR_POST_RESET_QUESTION');
    await page.locator('#ask-question').click();
    await page.waitForFunction(
      (answer) => document.querySelector('#answer-body')?.textContent.includes(answer),
      oldAnswer,
    );
    const continued = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(continued.sessions.length, 1);
    assert.equal(continued.activeSessionId, restored.activeSessionId);
    assert.equal(continued.sessions[0].messages.length, 2);
    assert.equal(continued.sessions[0].messages[0].content, 'CLEAR_POST_RESET_QUESTION');
    assert.equal(requests.at(-1).authorization, `Bearer ${apiKey}`);
    const latestPrompt = JSON.stringify(requests.at(-1).body.messages);
    assert.equal(latestPrompt.includes(oldQuestion), false);
    assert.equal(latestPrompt.includes(oldAnswer), false);
    assert.deepEqual(errors, []);
  },
);
