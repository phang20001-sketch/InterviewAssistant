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
const keyMask = '••••••••••••••••';
const initialPreferences = {
  experienceLevel: 'senior',
  targetCompany: 'PREFS_COMPANY_ORIGINAL：目标公司',
  jobDescription: 'PREFS_JD_ORIGINAL：负责 Vue 3 组件平台与性能优化。',
  interviewType: 'project',
  interviewDifficulty: 'challenging',
  focusAreas: 'PREFS_FOCUS_ORIGINAL：组件边界、性能分析。',
  improvementGoals: 'PREFS_GOAL_ORIGINAL：说明技术取舍与实际贡献。',
  additionalRequirements: 'PREFS_EXTRA_ORIGINAL：点评时提供具体改进例子。',
  role: 'PREFS_ROLE_ORIGINAL：高级前端工程师',
  language: '中英双语',
  answerStyle: 'detailed',
};
const replacementPreferences = {
  experienceLevel: 'junior',
  targetCompany: 'PREFS_COMPANY_REPLACED：新目标公司',
  jobDescription: 'PREFS_JD_REPLACED：负责接口维护与测试。',
  interviewType: 'technical',
  interviewDifficulty: 'basic',
  focusAreas: 'PREFS_FOCUS_REPLACED：网络基础。',
  improvementGoals: 'PREFS_GOAL_REPLACED：简明表达。',
  additionalRequirements: 'PREFS_EXTRA_REPLACED：从基础概念开始。',
  role: 'PREFS_ROLE_REPLACED：初级工程师',
  language: 'English',
  answerStyle: 'concise',
};
const selectFields = new Set([
  'experienceLevel',
  'interviewType',
  'interviewDifficulty',
  'language',
  'answerStyle',
]);

test(
  'detailed preferences persist independently of models and remain frozen for a saved interview',
  { timeout: 150000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'settings-preferences-test-'));
    const workspaceFile = path.join(directory, 'workspace.json');
    const keys = {
      alpha: 'settings-local-alpha-key',
      beta: 'settings-local-beta-key',
      transcription: 'settings-local-transcription-key',
      replacementTranscription: 'settings-local-transcription-replacement-key',
    };
    const requests = [];
    const errors = [];
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ body, authorization: request.headers.authorization });
      const prompt = body.messages.at(-1).content;
      let content = 'SETTINGS_QA_RESULT：已根据个人偏好生成回答。';
      if (prompt.includes('生成一整轮简历模拟面试题')) {
        content = JSON.stringify({
          questions: [1, 2, 3].map((number) => ({
            title: `偏好面试第 ${number} 题：如何说明组件设计的实际贡献？`,
            topic: '项目贡献',
            category: 'frontend',
            description: '结合合成简历与已保存面试偏好。',
            tags: ['Vue', '项目'],
          })),
        });
      } else if (prompt.includes('请只点评下面这一道')) {
        content = JSON.stringify({
          score: 88,
          content: 'SETTINGS_REVIEW_RESULT：说明了实际行动，可补充性能验证过程。',
        });
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    let application;
    let page;

    t.after(async () => {
      if (application) await application.close().catch(() => {});
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

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

    async function snapshot() {
      return page.evaluate(() => window.desktop.bootstrap());
    }

    async function disk() {
      return JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    }

    function modelRow(id) {
      return page.locator(`.model-profile-row[data-profile-id="${id}"]`);
    }

    async function fillPreferences(values) {
      for (const [key, value] of Object.entries(values)) {
        const field = page.locator(`#setting-${key}`);
        if (selectFields.has(key)) await field.selectOption(value);
        else await field.fill(value);
      }
    }

    async function assertPreferenceFields(values) {
      for (const [key, value] of Object.entries(values)) {
        assert.equal(await page.locator(`#setting-${key}`).inputValue(), value, key);
      }
    }

    async function savePreferences(values) {
      await fillPreferences(values);
      await page.locator('#save-settings').click();
      await page.waitForFunction(async (expected) => {
        const state = await window.desktop.bootstrap();
        return (
          Object.entries(expected).every(([key, value]) => state.settings[key] === value) &&
          document.querySelector('#save-settings')?.disabled === false
        );
      }, values);
      const saved = await snapshot();
      const persisted = await disk();
      for (const [key, value] of Object.entries(values)) {
        assert.equal(saved.settings[key], value, `snapshot ${key}`);
        assert.equal(persisted.settings[key], value, `disk ${key}`);
      }
      return saved;
    }

    function assertOriginalPrompt(entry) {
      const system = entry.body.messages[0].content;
      for (const marker of [
        'PREFS_ROLE_ORIGINAL',
        'PREFS_COMPANY_ORIGINAL',
        'PREFS_JD_ORIGINAL',
        'PREFS_FOCUS_ORIGINAL',
        'PREFS_GOAL_ORIGINAL',
        'PREFS_EXTRA_ORIGINAL',
        'PREFS_RESUME',
      ]) {
        assert.ok(system.includes(marker), `system prompt includes ${marker}`);
      }
      assert.match(system, /高级/);
      assert.match(system, /项目深挖/);
      assert.match(system, /挑战/);
      assert.match(system, /中英双语/);
      assert.match(system, /详细/);
      assert.doesNotMatch(system, /PREFS_[A-Z_]+_REPLACED/);
    }

    await launch();
    await page.evaluate(
      async ({ baseUrl, keys }) => {
        await window.desktop.saveSettings({
          baseUrl,
          model: 'preferences-alpha-model',
          apiKey: keys.alpha,
          demoMode: false,
          resume: 'PREFS_RESUME：Vue 3 工程师，负责组件开发与页面性能优化。',
          transcriptionApiKey: keys.transcription,
        });
        await window.desktop.saveModelProfile({
          name: '合成测试模型 Beta',
          baseUrl,
          model: 'preferences-beta-model',
          apiKey: keys.beta,
          demoMode: false,
        });
      },
      { baseUrl, keys },
    );
    await page.reload();
    await ready();
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.locator('#model-manager-title').textContent(), '模型管理');
    assert.equal(await page.getByRole('heading', { name: '模型连接', exact: true }).count(), 0);
    for (const oldInput of [
      'setting-baseUrl',
      'setting-model',
      'setting-apiKey',
      'setting-demoMode',
    ]) {
      assert.equal(await page.locator(`#${oldInput}`).count(), 0, oldInput);
    }
    assert.equal(requests.length, 0);

    await page.locator('.transcription-settings summary').click();
    assert.equal(await page.locator('#setting-transcriptionApiKey').inputValue(), keyMask);
    assert.equal(await page.locator('#setting-transcriptionApiKey').getAttribute('readonly'), '');
    const seeded = await snapshot();
    const alphaId = seeded.activeModelProfileId;
    const betaId = seeded.modelProfiles.find(
      (profile) => profile.model === 'preferences-beta-model',
    ).id;
    const beforeSave = await disk();
    await savePreferences(initialPreferences);
    const afterSave = await disk();
    assert.equal(afterSave.activeModelProfileId, alphaId);
    assert.equal(afterSave.settings.baseUrl, beforeSave.settings.baseUrl);
    assert.equal(afterSave.settings.model, beforeSave.settings.model);
    assert.deepEqual(afterSave.modelProfiles, beforeSave.modelProfiles);
    assert.deepEqual(afterSave.vault, beforeSave.vault);
    assert.equal(requests.length, 0);

    // Independent transcription credentials remain replaceable and masked.
    await page.locator('#replace-transcriptionApiKey').click();
    await page.locator('#setting-transcriptionApiKey').fill(keys.replacementTranscription);
    await page.locator('#save-settings').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#save-settings')?.disabled === false &&
        document.querySelector('#setting-transcriptionApiKey')?.readOnly === true,
    );
    const afterTranscription = await disk();
    assert.notEqual(
      afterTranscription.vault.transcriptionApiKey,
      afterSave.vault.transcriptionApiKey,
    );
    assert.deepEqual(afterTranscription.vault.modelProfiles, afterSave.vault.modelProfiles);
    assert.equal(afterTranscription.vault.apiKey, afterSave.vault.apiKey);
    assert.equal(await page.locator('#setting-transcriptionApiKey').inputValue(), keyMask);

    // Switching and verifying a model must preserve unrelated, unsaved drafts.
    await page.locator('#setting-role').fill('PREFS_UNSAVED_ROLE');
    await page.locator('#setting-targetCompany').fill('PREFS_UNSAVED_COMPANY');
    await page.locator('#setting-transcriptionModel').fill('PREFS_UNSAVED_TRANSCRIPTION');
    await modelRow(betaId).locator('.use-model-profile').click();
    await page.waitForFunction(async (id) => {
      const state = await window.desktop.bootstrap();
      return (
        state.activeModelProfileId === id &&
        document.querySelector('#add-model-profile')?.disabled === false
      );
    }, betaId);
    assert.equal(await page.locator('#setting-role').inputValue(), 'PREFS_UNSAVED_ROLE');
    assert.equal(
      await page.locator('#setting-targetCompany').inputValue(),
      'PREFS_UNSAVED_COMPANY',
    );
    await modelRow(alphaId).locator('.test-model-profile').click();
    await page.waitForFunction((id) => {
      const row = document.querySelector(`.model-profile-row[data-profile-id="${id}"]`);
      return (
        row?.querySelector('.model-profile-verification')?.textContent.includes('验证通过') &&
        document.querySelector('#add-model-profile')?.disabled === false
      );
    }, alphaId);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, 'preferences-alpha-model');
    assert.equal(requests[0].authorization, `Bearer ${keys.alpha}`);
    assert.equal((await snapshot()).activeModelProfileId, betaId);
    assert.equal(await page.locator('#setting-role').inputValue(), 'PREFS_UNSAVED_ROLE');
    assert.equal(
      await page.locator('#setting-targetCompany').inputValue(),
      'PREFS_UNSAVED_COMPANY',
    );
    assert.equal(
      await page.locator('#setting-transcriptionModel').inputValue(),
      'PREFS_UNSAVED_TRANSCRIPTION',
    );
    assert.equal((await snapshot()).settings.role, initialPreferences.role);
    await page.reload();
    await ready();
    await page.locator('[data-view="settings"]').click();
    await assertPreferenceFields(initialPreferences);
    assert.equal(requests.length, 1);

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1320, 1040);
    });
    await page.locator('#setting-role').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(work, 'detailed-settings-preview.png') });

    await page.locator('[data-view="assistant"]').click();
    await page.locator('#question-input').fill('请结合我的目标岗位说明如何介绍组件项目。');
    await page.locator('#ask-question').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#answer-body')?.textContent.includes('SETTINGS_QA_RESULT') &&
        document.querySelector('#question-input')?.disabled === false,
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.model, 'preferences-beta-model');
    assert.equal(requests[1].authorization, `Bearer ${keys.beta}`);
    assertOriginalPrompt(requests[1]);

    await page.locator('[data-view="mock"]').click();
    await page.locator('#mock-question-count').selectOption('3');
    await page.locator('#new-mock').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#mock-question')?.textContent.includes('偏好面试第 1 题') &&
        document.querySelector('#new-mock')?.disabled === false,
    );
    assert.equal(requests.length, 3);
    assertOriginalPrompt(requests[2]);
    const generated = await snapshot();
    const round = generated.sessions.find((session) => session.id === generated.activeSessionId);
    assert.equal(round.practice.questions.length, 3);
    assert.equal(round.practice.role, initialPreferences.role);
    for (const [key, value] of Object.entries(initialPreferences)) {
      if (key !== 'role') assert.equal(round.practice.preferences[key], value, `round ${key}`);
    }

    await page.locator('[data-view="settings"]').click();
    const beforeReplacement = await disk();
    await savePreferences(replacementPreferences);
    const afterReplacement = await disk();
    assert.equal(afterReplacement.activeModelProfileId, betaId);
    assert.equal(afterReplacement.settings.model, 'preferences-beta-model');
    assert.equal(afterReplacement.settings.baseUrl, baseUrl);
    assert.deepEqual(afterReplacement.modelProfiles, beforeReplacement.modelProfiles);
    assert.deepEqual(afterReplacement.vault, beforeReplacement.vault);
    assert.equal(requests.length, 3);

    await page.locator('[data-view="mock"]').click();
    await page.locator('#mock-answer').fill('我负责组件职责划分，并通过性能测量确认优化效果。');
    await page.locator('#submit-mock').click();
    await page.waitForFunction(
      () =>
        document.querySelector('.mock-review-score')?.textContent.includes('88') &&
        document.querySelector('#new-mock')?.disabled === false,
    );
    assert.equal(requests.length, 4);
    assertOriginalPrompt(requests[3]);
    const reviewed = (await snapshot()).sessions.find((session) => session.id === round.id);
    assert.equal(reviewed.practice.reviews[0].score, 88);
    assert.deepEqual(reviewed.practice.preferences, round.practice.preferences);

    await application.close();
    application = null;
    await launch();
    const restored = await snapshot();
    assert.equal(restored.activeModelProfileId, betaId);
    assert.equal(restored.settings.model, 'preferences-beta-model');
    assert.equal(restored.settings.hasTranscriptionApiKey, true);
    assert.deepEqual((await disk()).vault, afterReplacement.vault);
    const restoredRound = restored.sessions.find((session) => session.id === round.id);
    assert.deepEqual(restoredRound.practice.preferences, round.practice.preferences);
    assert.equal(restoredRound.practice.reviews[0].score, 88);
    await page.locator('[data-view="settings"]').click();
    await assertPreferenceFields(replacementPreferences);
    await page.locator('.transcription-settings summary').click();
    assert.equal(await page.locator('#setting-transcriptionApiKey').inputValue(), keyMask);
    await page.locator('[data-view="library"]').click();
    await page.locator('[data-view="mock"]').click();
    assert.equal(requests.length, 4);
    const diskText = await fs.readFile(workspaceFile, 'utf8');
    const publicState = JSON.stringify(restored);
    for (const secret of [...Object.values(keys), keyMask]) {
      assert.equal(diskText.includes(secret), false);
      assert.equal(publicState.includes(secret), false);
    }
    assert.deepEqual(errors, []);
  },
);
