'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { _electron } = require('playwright');
const { textDocx, textPdf } = require('./fixtures/resume-fixtures.cjs');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');

test(
  'resume interview and generated question bank persist, resume and only call AI on explicit actions',
  { timeout: 150000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'resume-practice-test-'));
    const resume = 'E2E_RESUME_ORIGINAL：Vue 3 工程师，负责组件开发与表单业务，参与性能优化。';
    const replacement = 'E2E_RESUME_REPLACEMENT：后端工程师，负责数据库和服务端接口。';
    const resumeFile = path.join(directory, 'resume.docx');
    await fs.writeFile(resumeFile, await textDocx(resume));
    const requests = [];
    let libraryCalls = 0;
    let reviewCalls = 0;
    let unparsed = false;
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (request.url.endsWith('/audio/transcriptions')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ text: '录音并发检查完成。' }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      const prompt = body.messages.at(-1).content;
      let content = '普通问答已参考保存的简历。';
      if (prompt.includes('生成一整轮简历模拟面试题')) {
        content = JSON.stringify({
          questions: [1, 2, 3].map((number) => ({
            title: `简历面试第 ${number} 题：请说明 Vue 项目中的实际贡献？`,
            topic: '项目贡献',
            category: 'frontend',
            description: '围绕已上传简历的项目提问。',
            tags: ['Vue', '项目'],
          })),
        });
      } else if (prompt.includes('生成当前用户的简历练习题库')) {
        libraryCalls += 1;
        content = unparsed
          ? '这次返回了完整说明，没有按照题目列表的格式。RAW_BANK_KEEP_ALL'
          : JSON.stringify({
              questions: [1, 2, 3, 4, 5].map((number) => ({
                title: `题库批次 ${libraryCalls} 第 ${number} 题：如何设计组件边界？`,
                category: 'frontend',
                topic: '组件设计',
                tags: ['组件'],
              })),
            });
      } else if (prompt.includes('请只点评下面这一道')) {
        reviewCalls += 1;
        content =
          reviewCalls === 2
            ? '评分：90 / 100\n\n第二题原始点评：建议补充验证方法。'
            : JSON.stringify({
                score: reviewCalls === 1 ? 81 : 96,
                content: `第 ${reviewCalls} 题点评：陈述了实际行动，可以补充验证细节。`,
                extra: 'RAW_REVIEW_KEEP_ALL',
              });
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let application;
    let page;
    const errors = [];
    t.after(async () => {
      if (application) await application.close().catch(() => {});
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    async function ready() {
      await page.waitForFunction(async () => {
        if (!window.desktop?.startPractice) return false;
        const state = await window.desktop.bootstrap();
        return (
          document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}` &&
          document.querySelector('#question-input')?.disabled === false
        );
      });
    }
    async function launch() {
      application = await _electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '.'],
        cwd: root,
        env,
      });
      page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await ready();
    }
    await launch();
    await page.evaluate(
      (baseUrl) =>
        window.desktop.saveSettings({
          baseUrl,
          model: 'local-resume-test-model',
          apiKey: 'local-resume-test-key',
          demoMode: false,
          focusAreas: 'E2E_PREFERENCE_COMPONENTS：重点准备 Vue 组件边界和性能验证。',
        }),
      `http://127.0.0.1:${server.address().port}/v1`,
    );
    await page.reload();
    await ready();

    // Missing resume is a visible prompt and the native API also rejects before requesting AI.
    await page.locator('[data-view="mock"]').click();
    assert.equal(await page.locator('#new-mock').isDisabled(), true);
    assert.match(await page.locator('#view-mock .resume-required').textContent(), /简历/);
    const missing = await page.evaluate(async () => {
      try {
        await window.desktop.startPractice({ count: 3 });
        return '';
      } catch (error) {
        return error.message;
      }
    });
    assert.match(missing, /上传.*简历/);
    assert.equal(requests.length, 0);
    await application.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, resumeFile);
    await page.locator('#view-mock [data-action="upload-resume"]').click();
    await page.waitForFunction(() => document.querySelector('#new-mock')?.disabled === false);
    const uploaded = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(uploaded.settings.resume, resume);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(directory, 'workspace.json'))).settings.resume,
      resume,
    );
    assert.equal(requests.length, 0);

    await page.locator('#mock-question-count').selectOption('3');
    await page.locator('#new-mock').click();
    await page.waitForFunction(() =>
      document.querySelector('#mock-question')?.textContent.includes('第 1 题'),
    );
    assert.equal(requests.length, 1);
    assert.match(requests[0].messages[0].content, /E2E_RESUME_ORIGINAL/);
    assert.equal(await page.locator('#next-mock-question').isDisabled(), true);
    await page.locator('[data-view="assistant"]').click();
    await page.locator('[data-mode="voice"]').click();
    await page.locator('#record-button').click();
    await page.waitForFunction(() =>
      document.querySelector('#record-button-label')?.textContent.includes('结束'),
    );
    await page.locator('[data-view="mock"]').click();
    assert.equal(await page.locator('#new-mock').isDisabled(), true);
    assert.equal(await page.locator('#mock-answer').isDisabled(), true);
    assert.equal(requests.length, 1);
    await page.locator('[data-view="assistant"]').click();
    await page.waitForTimeout(350);
    await page.locator('#record-button').click();
    await page.waitForFunction(
      () => document.querySelector('#question-input')?.value === '录音并发检查完成。',
    );
    await page.locator('[data-view="mock"]').click();
    await page.locator('#mock-answer').fill('第一题：我负责组件职责划分，并通过性能测量确认结果。');
    await page.locator('#submit-mock').click();
    await page.waitForFunction(() =>
      document.querySelector('.mock-review-score')?.textContent.includes('81'),
    );
    assert.equal(requests.length, 2);
    const firstRound = (await page.evaluate(() => window.desktop.bootstrap())).sessions.find(
      (item) => item.practice,
    );
    assert.equal(firstRound.practice.status, 'active');
    assert.equal(firstRound.practice.reviews.length, 1);
    assert.equal(firstRound.practice.resume, resume);
    await page.locator('.mock-raw-review summary').click();
    assert.match(await page.locator('#mock-feedback').textContent(), /RAW_REVIEW_KEEP_ALL/);
    await page.locator('#next-mock-question').click();
    assert.match(await page.locator('#mock-question').textContent(), /第 2 题/);
    assert.equal(requests.length, 2);

    // Restart resumes the existing plan; changing the global resume leaves its saved facts intact.
    await application.close();
    application = null;
    await launch();
    assert.equal(requests.length, 2);
    await page.locator('[data-view="mock"]').click();
    assert.match(await page.locator('#mock-question').textContent(), /第 2 题/);
    await page.evaluate((text) => window.desktop.saveSettings({ resume: text }), replacement);
    await page.reload();
    await ready();
    await page.locator('[data-view="mock"]').click();
    for (const number of [2, 3]) {
      await page
        .locator('#mock-answer')
        .fill(`第 ${number} 题：结合真实项目说明自己的行动和验证过程。`);
      await page.locator('#submit-mock').click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.mock-scored-review').length === count &&
          document.querySelector('#new-mock')?.disabled === false,
        number,
      );
      assert.match(requests.at(-1).messages[0].content, /E2E_RESUME_ORIGINAL/);
      assert.doesNotMatch(requests.at(-1).messages[0].content, /E2E_RESUME_REPLACEMENT/);
      if (number === 2) await page.locator('#next-mock-question').click();
    }
    assert.equal(requests.length, 4);
    assert.match(await page.locator('#mock-session-summary').textContent(), /已完成.*已保存/);
    assert.match(await page.locator('#mock-average-score').textContent(), /89/);
    assert.equal(await page.locator('#next-mock-question').isDisabled(), true);
    await page.screenshot({ path: path.join(work, 'resume-interview-preview.png') });
    await page.locator('[data-view="history"]').click();
    const savedRound = page.locator('.history-row').filter({ hasText: '简历模拟面试' });
    assert.match(await savedRound.textContent(), /已完成 3 题/);
    await savedRound.locator('.history-main').click();
    assert.equal(await page.locator('.mock-scored-review').count(), 3);
    assert.equal(requests.length, 4);

    await page.locator('[data-view="library"]').click();
    assert.equal(await page.locator('.library-question-card').count(), 0);
    assert.equal(requests.length, 4);
    for (const batchCount of [1, 2]) {
      await page.locator('#generate-question-bank').click();
      await page.waitForFunction(
        async (count) =>
          (await window.desktop.bootstrap()).questionBatches.length === count &&
          document.querySelector('#generate-question-bank')?.disabled === false,
        batchCount,
      );
      assert.equal(await page.locator('.library-question-card').count(), batchCount * 5);
      assert.equal(await page.locator('#library-batch').inputValue(), 'all');
      assert.match(
        await page.locator('#library-generation-summary').textContent(),
        new RegExp(`本次新增 5 道题，累计 ${batchCount * 5} 道题`),
      );
      assert.match(requests.at(-1).messages[0].content, /E2E_RESUME_REPLACEMENT/);
      assert.match(requests.at(-1).messages[0].content, /E2E_PREFERENCE_COMPONENTS/);
      if (batchCount === 1) {
        const batch = (await page.evaluate(() => window.desktop.bootstrap())).questionBatches[0];
        await page.locator('#library-batch').selectOption(batch.id);
        assert.equal(await page.locator('.library-question-card').count(), 5);
      }
    }
    assert.equal(requests.length, 6);
    assert.match(requests.at(-1).messages.at(-1).content, /题库批次 1/);
    assert.equal(await page.locator('.library-question-card').count(), 10);
    const currentBatchRecord = page.locator('.library-batch-record').first();
    await currentBatchRecord.locator(':scope > summary').click();
    await currentBatchRecord.locator('.library-batch-preferences > summary').click();
    assert.equal(await currentBatchRecord.locator('.library-preference-fields > div').count(), 10);
    assert.match(
      await currentBatchRecord.locator('.library-preference-fields').textContent(),
      /E2E_PREFERENCE_COMPONENTS/,
    );
    await page.locator('#library-search').fill('批次 1');
    assert.equal(await page.locator('.library-question-card').count(), 5);
    await page.locator('#library-search').fill('');
    await page.screenshot({ path: path.join(work, 'generated-library-preview.png') });
    assert.equal(requests.length, 6);

    unparsed = true;
    const earlierBatchId = (await page.evaluate(() => window.desktop.bootstrap()))
      .questionBatches[0].id;
    await page.locator('#library-batch').selectOption(earlierBatchId);
    assert.equal(await page.locator('.library-question-card').count(), 5);
    await page.locator('#generate-question-bank').click();
    await page.waitForFunction(() =>
      document.querySelector('.library-raw-content')?.textContent.includes('RAW_BANK_KEEP_ALL'),
    );
    assert.equal(await page.locator('#library-batch').inputValue(), 'all');
    assert.equal(await page.locator('.library-question-card').count(), 10);
    assert.match(
      await page.locator('#library-generation-summary').textContent(),
      /本次新增 0 道题，累计 10 道题/,
    );
    assert.equal(requests.length, 7);
    await application.close();
    application = null;
    // Earlier versions did not save preference snapshots; their batches remain readable.
    const legacyWorkspaceFile = path.join(directory, 'workspace.json');
    const legacyWorkspace = JSON.parse(await fs.readFile(legacyWorkspaceFile, 'utf8'));
    delete legacyWorkspace.questionBatches[0].preferences;
    await fs.writeFile(legacyWorkspaceFile, JSON.stringify(legacyWorkspace));
    await launch();
    const restored = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(restored.questionBatches.length, 3);
    assert.equal(restored.questionBatches.flatMap((batch) => batch.questions).length, 10);
    assert.match(restored.questionBatches[2].raw, /RAW_BANK_KEEP_ALL/);
    assert.equal(
      restored.sessions.find((item) => item.id === firstRound.id).practice.status,
      'completed',
    );
    assert.equal(restored.settings.resume, replacement);
    await page.locator('[data-view="library"]').click();
    assert.equal(await page.locator('#library-batch').inputValue(), 'all');
    assert.equal(await page.locator('.library-question-card').count(), 10);
    const legacyBatchRecord = page.locator('.library-batch-record').last();
    await legacyBatchRecord.locator(':scope > summary').click();
    await legacyBatchRecord.locator('.library-batch-preferences > summary').click();
    assert.match(await legacyBatchRecord.locator('.library-batch-legacy').textContent(), /未保存/);
    assert.equal(requests.length, 7);
    await page.locator('.library-question-card').first().click();
    await page.locator('#ask-question').click();
    await page.waitForFunction(() =>
      document.querySelector('#answer-body')?.textContent.includes('普通问答已参考'),
    );
    assert.match(requests.at(-1).messages[0].content, /E2E_RESUME_REPLACEMENT/);
    assert.equal(requests.length, 8);

    // The PDF parser also runs successfully inside Electron, rather than only under Node.
    const pdfFile = path.join(directory, 'resume.pdf');
    await fs.writeFile(pdfFile, textPdf());
    await application.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, pdfFile);
    const importedPdf = await page.evaluate(() => window.desktop.importResume());
    assert.match(importedPdf.state.settings.resume, /Synthetic resume/);
    assert.equal(requests.length, 8);
    assert.deepEqual(errors, []);
  },
);
