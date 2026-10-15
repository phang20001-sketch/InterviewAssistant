'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { _electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');

test(
  'append interview questions cumulatively without losing drafts, reviews, preferences or older interviews',
  { timeout: 150000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'append-practice-test-'));
    const requests = [];
    let generatedRounds = 0;
    let appendedBatches = 0;
    let holdNextAppend = false;
    let releaseAppend;
    let appendStarted;
    const appendHeld = new Promise((resolve) => {
      appendStarted = resolve;
    });
    const original = {
      resume: 'APPEND_RESUME_ORIGINAL：Vue 工程师，负责组件和订单系统开发。',
      targetCompany: 'APPEND_COMPANY_ORIGINAL',
      focusAreas: 'APPEND_FOCUS_ORIGINAL：组件边界与项目贡献',
      interviewType: 'project',
      interviewDifficulty: 'challenging',
      experienceLevel: 'senior',
    };
    const replacement = {
      resume: 'APPEND_RESUME_NEW：后端工程师，负责数据库和服务接口。',
      targetCompany: 'APPEND_COMPANY_NEW',
      focusAreas: 'APPEND_FOCUS_NEW：数据库事务',
      interviewType: 'technical',
      interviewDifficulty: 'basic',
      experienceLevel: 'junior',
    };

    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      const prompt = body.messages.at(-1).content;
      let content;
      if (prompt.includes('为当前面试追加问题')) {
        appendedBatches += 1;
        if (holdNextAppend) {
          holdNextAppend = false;
          appendStarted();
          await new Promise((resolve) => {
            releaseAppend = resolve;
          });
        }
        content =
          appendedBatches === 3
            ? '追加时返回的完整说明，没有编号题目。APPEND_RAW_PRESERVED'
            : JSON.stringify({
                questions: [1, 2, 3].map((number) => ({
                  title: `APPEND_BATCH_${appendedBatches}_Q${number}：请说明项目中的实际取舍？`,
                  topic: '项目深挖',
                  category: 'frontend',
                  tags: ['项目', '取舍'],
                })),
              });
      } else if (prompt.includes('生成一整轮简历模拟面试题')) {
        generatedRounds += 1;
        content = JSON.stringify({
          questions: [1, 2, 3].map((number) => ({
            title: `INTERVIEW_${generatedRounds}_Q${number}：如何验证项目的实际贡献？`,
            topic: '真实贡献',
            category: 'frontend',
            tags: ['项目'],
          })),
        });
      } else {
        content = JSON.stringify({
          score: 88,
          content: 'APPEND_REVIEW：说明了个人贡献，建议补充验证过程。',
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
      releaseAppend?.();
      if (application) await application.close().catch(() => {});
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    async function ready() {
      await page.waitForFunction(async () => {
        if (!window.desktop?.appendPractice) return false;
        const data = await window.desktop.bootstrap();
        return (
          document.querySelector('#app-version')?.textContent === `v${data.appInfo.version}` &&
          document.querySelector('#question-input')?.disabled === false
        );
      });
    }
    async function launch() {
      application = await _electron.launch({
        executablePath: require('electron'),
        args: ['.'],
        cwd: root,
        env,
      });
      page = await application.firstWindow();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await ready();
    }
    const snapshot = () => page.evaluate(() => window.desktop.bootstrap());
    function assertOriginalRequest(body) {
      const system = body.messages[0].content;
      for (const marker of [
        'APPEND_RESUME_ORIGINAL',
        'APPEND_COMPANY_ORIGINAL',
        'APPEND_FOCUS_ORIGINAL',
      ])
        assert.ok(system.includes(marker));
      assert.doesNotMatch(system, /APPEND_RESUME_NEW|APPEND_COMPANY_NEW|APPEND_FOCUS_NEW/);
    }
    async function waitForIdle() {
      await page.waitForFunction(() => document.querySelector('#new-mock')?.disabled === false);
    }
    async function submitAnswer(number) {
      await page
        .locator('#mock-answer')
        .fill(`第 ${number} 题作答：我负责方案设计与验证，清楚说明实际贡献。`);
      await page.locator('#submit-mock').click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.mock-scored-review').length === count &&
          document.querySelector('#new-mock')?.disabled === false,
        number,
      );
      assertOriginalRequest(requests.at(-1));
    }

    await launch();
    await page.evaluate((settings) => window.desktop.saveSettings(settings), {
      ...original,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-append-practice-model',
      apiKey: 'local-only-append-key',
      demoMode: false,
    });
    await page.reload();
    await ready();
    await page.locator('[data-view="mock"]').click();
    assert.equal(await page.locator('#append-mock').isDisabled(), true);
    assert.match(await page.locator('#new-mock').textContent(), /新的面试/);
    await page.locator('#mock-question-count').selectOption('3');
    await page.locator('#new-mock').click();
    await page.waitForFunction(() =>
      document.querySelector('#mock-question')?.textContent.includes('INTERVIEW_1_Q1'),
    );
    assert.equal(requests.length, 1);
    assertOriginalRequest(requests[0]);
    await submitAnswer(1);
    await page.locator('#next-mock-question').click();
    const initialState = await snapshot();
    const originalRound = initialState.sessions.find((item) => item.practice);
    const firstReview = originalRound.practice.reviews[0];
    const initialQuestions = originalRound.practice.questions;

    // New defaults apply to future interviews; appending keeps this interview's context.
    await page.evaluate((settings) => window.desktop.saveSettings(settings), replacement);
    await page.reload();
    await ready();
    await page.locator('[data-view="mock"]').click();
    const draft = 'APPEND_UNSENT_DRAFT：这个回答还没有发送，追加时必须保留。';
    await page.locator('#mock-question-count').selectOption('3');
    await page.locator('#mock-answer').fill(draft);
    holdNextAppend = true;
    await page.locator('#append-mock').click();
    await appendHeld;
    assert.equal(await page.locator('#append-mock').isDisabled(), true);
    const blocked = await page.evaluate(async (id) => {
      const failures = [];
      for (const action of [
        () => window.desktop.appendPractice({ sessionId: id, count: 3 }),
        () => window.desktop.deleteSession(id),
        () => window.desktop.clearSessions(),
        () => window.desktop.saveSettings({ focusAreas: 'must-not-change-in-flight' }),
      ]) {
        try {
          await action();
          failures.push('');
        } catch (error) {
          failures.push(error.message);
        }
      }
      return failures;
    }, originalRound.id);
    assert.ok(blocked.every((message) => message.length > 0));
    releaseAppend();
    await waitForIdle();
    assert.equal(requests.length, 3);
    assertOriginalRequest(requests.at(-1));
    assert.match(requests.at(-1).messages.at(-1).content, /INTERVIEW_1_Q1/);
    const afterAppend = (await snapshot()).sessions.find((item) => item.id === originalRound.id);
    assert.equal(afterAppend.practice.questions.length, 6);
    assert.deepEqual(afterAppend.practice.questions.slice(0, 3), initialQuestions);
    assert.deepEqual(afterAppend.practice.reviews[0], firstReview);
    assert.deepEqual(afterAppend.messages, originalRound.messages);
    assert.deepEqual(afterAppend.practice.preferences, originalRound.practice.preferences);
    assert.equal(await page.locator('#mock-answer').inputValue(), draft);
    assert.match(await page.locator('#mock-question').textContent(), /INTERVIEW_1_Q2/);
    for (const number of [2, 3, 4, 5, 6]) {
      await submitAnswer(number);
      if (number < 6) await page.locator('#next-mock-question').click();
    }
    const completed = (await snapshot()).sessions.find((item) => item.id === originalRound.id);
    assert.equal(completed.practice.status, 'completed');
    assert.ok(completed.practice.completedAt);
    assert.equal(completed.practice.reviews.length, 6);
    assert.equal(requests.length, 8);

    await page.locator('#append-mock').click();
    await waitForIdle();
    const reopened = (await snapshot()).sessions.find((item) => item.id === originalRound.id);
    assert.equal(reopened.practice.status, 'active');
    assert.equal(reopened.practice.completedAt, undefined);
    assert.equal(reopened.practice.questions.length, 9);
    assert.deepEqual(reopened.practice.reviews, completed.practice.reviews);
    assert.match(await page.locator('#mock-question').textContent(), /APPEND_BATCH_2_Q1/);
    assert.equal(await page.locator('#mock-answer').inputValue(), '');
    assert.equal(requests.length, 9);
    await page.locator('#mock-answer').fill('APPEND_RAW_DRAFT：尚未发送的第七题作答。');
    await page.locator('#append-mock').click();
    await waitForIdle();
    const unparsed = (await snapshot()).sessions.find((item) => item.id === originalRound.id);
    assert.equal(unparsed.practice.questions.length, 9);
    assert.equal(unparsed.practice.reviews.length, 6);
    assert.equal(unparsed.practice.generations.length, 4);
    assert.match(unparsed.practice.generations.at(-1).raw, /APPEND_RAW_PRESERVED/);
    assert.equal(
      await page.locator('#mock-answer').inputValue(),
      'APPEND_RAW_DRAFT：尚未发送的第七题作答。',
    );
    assert.match(await page.locator('#view-mock').textContent(), /APPEND_RAW_PRESERVED/);
    assert.equal(requests.length, 10);
    await page.screenshot({ path: path.join(work, 'append-interview-preview.png') });

    await page.locator('#new-mock').click();
    await waitForIdle();
    const second = await snapshot();
    assert.notEqual(second.activeSessionId, originalRound.id);
    assert.equal(second.sessions.filter((item) => item.practice).length, 2);
    const secondRound = second.sessions.find((item) => item.id === second.activeSessionId);
    assert.equal(secondRound.practice.questions.length, 3);
    assert.equal(secondRound.practice.reviews.length, 0);
    assert.equal(secondRound.practice.resume, replacement.resume);
    assert.equal(secondRound.practice.preferences.focusAreas, replacement.focusAreas);
    assert.match(requests.at(-1).messages[0].content, /APPEND_RESUME_NEW/);
    assert.match(requests.at(-1).messages[0].content, /APPEND_FOCUS_NEW/);
    assert.deepEqual(
      second.sessions.find((item) => item.id === originalRound.id),
      unparsed,
    );
    await page.locator('[data-view="history"]').click();
    await page
      .locator('.history-row')
      .filter({ hasText: 'INTERVIEW_1_Q1' })
      .locator('.history-main')
      .click();
    assert.match(await page.locator('#mock-question').textContent(), /APPEND_BATCH_2_Q1/);
    assert.equal(requests.length, 11);
    await application.close();
    application = null;
    await launch();
    await page.locator('[data-view="mock"]').click();
    const restored = (await snapshot()).sessions.find((item) => item.id === originalRound.id);
    assert.equal(restored.practice.questions.length, 9);
    assert.equal(restored.practice.reviews.length, 6);
    assert.equal(restored.practice.generations.length, 4);
    assert.equal(restored.practice.generations.flatMap((batch) => batch.questionIds).length, 9);
    assert.deepEqual(restored.practice.reviews, completed.practice.reviews);
    await page.locator('[data-view="library"]').click();
    await page.locator('[data-view="mock"]').click();
    assert.equal(requests.length, 11);
    assert.deepEqual(errors, []);
  },
);
