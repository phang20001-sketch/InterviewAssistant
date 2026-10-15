'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { _electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');
const savedKeyMask = '••••••••••••••••';
const digest = (contents) => createHash('sha256').update(contents).digest('hex');

test(
  'model management migrates, switches isolated connections, persists keys and blocks changes in flight',
  { timeout: 120000 },
  async (t) => {
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'model-profiles-test-'));
    const workspaceFile = path.join(directory, 'workspace.json');
    const keyA = 'profiles-local-alpha-key';
    const keyB = 'profiles-local-beta-key';
    const replacementKeyB = 'profiles-local-beta-replacement-key';
    const canceledKey = 'profiles-local-canceled-key';
    const transcriptionKey = 'profiles-local-global-transcription-key';
    const secrets = [keyA, keyB, replacementKeyB, canceledKey, transcriptionKey];
    const requests = [];
    let pendingHold;

    function createLocalModel(label) {
      const server = http.createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const lastQuestion = body.messages.at(-1).content;
        const entry = {
          label,
          url: request.url,
          authorization: request.headers.authorization,
          body,
          answer: `${label} 测试回答 ${requests.length + 1}`,
        };
        requests.push(entry);
        if (
          (typeof lastQuestion === 'string' && lastQuestion.includes('PROFILES_HOLD_ASK')) ||
          body.model === 'profiles-hold-verification'
        ) {
          await new Promise((resolve) => {
            pendingHold = { entry, release: resolve };
          });
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: entry.answer } }] }));
      });
      server.listen(0, '127.0.0.1');
      return server;
    }

    const serverA = createLocalModel('ALPHA');
    const serverB = createLocalModel('BETA');
    await Promise.all([once(serverA, 'listening'), once(serverB, 'listening')]);
    const baseUrlA = `http://127.0.0.1:${serverA.address().port}/alpha/v1`;
    const baseUrlB = `http://127.0.0.1:${serverB.address().port}/beta/v1`;
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    let application;
    let page;
    const errors = [];

    t.after(async () => {
      pendingHold?.release();
      if (application) {
        await application
          .evaluate(() => globalThis.__modelProfilesCapture?.release?.())
          .catch(() => {});
        await application.close().catch(() => {});
      }
      for (const server of [serverA, serverB]) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    async function ready() {
      await page.waitForFunction(async () => {
        if (!window.desktop?.saveModelProfile) return false;
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

    async function assertSecretsHidden() {
      const state = JSON.stringify(await snapshot());
      const disk = await fs.readFile(workspaceFile, 'utf8');
      for (const secret of [...secrets, savedKeyMask]) {
        assert.equal(state.includes(secret), false);
        assert.equal(disk.includes(secret), false);
      }
    }

    function row(profileId) {
      return page.locator(`.model-profile-row[data-profile-id="${profileId}"]`);
    }

    async function waitForActive(profileId) {
      await page.waitForFunction(async (id) => {
        const state = await window.desktop.bootstrap();
        const activeRow = [...document.querySelectorAll('.model-profile-row')].find(
          (element) => element.dataset.profileId === id,
        );
        return (
          state.activeModelProfileId === id &&
          activeRow?.classList.contains('is-active') &&
          activeRow.querySelector('.model-profile-model')?.textContent === state.settings.model &&
          document.querySelector('#add-model-profile')?.disabled === false
        );
      }, profileId);
    }

    async function verify(profileId) {
      const before = requests.length;
      await row(profileId).locator('.test-model-profile').click();
      await page.waitForFunction((id) => {
        const profileRow = [...document.querySelectorAll('.model-profile-row')].find(
          (element) => element.dataset.profileId === id,
        );
        return (
          profileRow?.querySelector('.test-model-profile')?.disabled === false &&
          profileRow.querySelector('.model-profile-verification')?.textContent.trim() ===
            '本次验证通过'
        );
      }, profileId);
      assert.equal(requests.length, before + 1);
      return requests.at(-1);
    }

    async function waitForProfileDialogClosed() {
      await page.waitForFunction(
        () =>
          document.querySelector('#model-profile-dialog')?.open === false &&
          document.querySelector('#add-model-profile')?.disabled === false,
      );
    }

    async function select(profileId) {
      await page.locator('[data-view="settings"]').click();
      await row(profileId).locator('.use-model-profile').click();
      await waitForActive(profileId);
    }

    async function ask(question, label, model, key) {
      const before = requests.length;
      await page.locator('[data-view="assistant"]').click();
      await page.locator('#question-input').fill(question);
      await page.locator('#ask-question').click();
      await page.waitForFunction(
        () =>
          document.querySelector('#question-input')?.value === '' &&
          document.querySelector('#question-input')?.disabled === false,
      );
      assert.equal(requests.length, before + 1);
      const latest = requests.at(-1);
      assert.equal(latest.label, label);
      assert.equal(latest.url, `/${label.toLowerCase()}/v1/chat/completions`);
      assert.equal(latest.body.model, model);
      assert.equal(latest.authorization, `Bearer ${key}`);
      assert.equal(
        await page
          .locator('#answer-body')
          .textContent()
          .then((text) => text.includes(latest.answer)),
        true,
      );
    }

    async function assertModelChangesBlocked(profileA, profileB) {
      for (const selector of [
        '#add-model-profile',
        '.use-model-profile',
        '.edit-model-profile',
        '.delete-model-profile',
        '.test-model-profile',
      ]) {
        const buttons = page.locator(selector);
        for (let index = 0; index < (await buttons.count()); index += 1) {
          assert.equal(await buttons.nth(index).isDisabled(), true);
        }
      }
      const before = await fs.readFile(workspaceFile);
      const failures = await page.evaluate(
        async ({ profileA, profileB }) => {
          const operations = [
            () => window.desktop.selectModelProfile(profileA.id),
            () => window.desktop.saveModelProfile({ ...profileB, name: '不应保存的修改' }),
            () => window.desktop.deleteModelProfile(profileA.id),
            () => window.desktop.saveSettings({ model: 'must-not-replace-active-model' }),
            () => window.desktop.testConnection(profileB.id),
          ];
          const failures = [];
          for (const operation of operations) {
            try {
              await operation();
              failures.push('');
            } catch (error) {
              failures.push(error.message);
            }
          }
          return failures;
        },
        { profileA, profileB },
      );
      for (const failure of failures) assert.match(failure, /请等待完成后再修改模型配置/);
      assert.equal(digest(await fs.readFile(workspaceFile)), digest(before));
    }

    async function waitForHeldRequest() {
      for (let attempt = 0; attempt < 100 && !pendingHold; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(pendingHold, 'The synthetic local request should reach its hold point.');
    }

    // Build an actual previous-release fixture with Windows-encrypted synthetic
    // secrets. No real user profile or external provider is used by this test.
    await launch();
    const encrypted = await application.evaluate(
      ({ safeStorage }, keys) => {
        return keys.map((key) => safeStorage.encryptString(key).toString('base64'));
      },
      [keyA, transcriptionKey],
    );
    await application.close();
    application = null;
    const legacy = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    delete legacy.modelProfiles;
    delete legacy.activeModelProfileId;
    Object.assign(legacy.settings, {
      baseUrl: baseUrlA,
      model: 'profiles-alpha-model',
      demoMode: true,
      role: '旧版迁移测试角色',
      resume: '应保留的简历与偏好。',
      transcriptionBaseUrl: baseUrlA,
      transcriptionModel: 'global-transcription-model',
    });
    legacy.vault = { apiKey: encrypted[0], transcriptionApiKey: encrypted[1] };
    const legacyBytes = Buffer.from(JSON.stringify(legacy, null, 2));
    await fs.writeFile(workspaceFile, legacyBytes);
    await launch();

    const migrated = await snapshot();
    assert.equal(migrated.modelProfiles.length, 1);
    const profileA = migrated.modelProfiles[0];
    assert.equal(migrated.activeModelProfileId, profileA.id);
    assert.equal(profileA.baseUrl, baseUrlA);
    assert.equal(profileA.model, 'profiles-alpha-model');
    assert.equal(profileA.hasApiKey, true);
    assert.equal(migrated.settings.hasTranscriptionApiKey, true);
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(legacyBytes));
    await assertSecretsHidden();
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.getByRole('heading', { name: '模型连接', exact: true }).count(), 0);
    await row(profileA.id).locator('.edit-model-profile').click();
    assert.equal(await page.locator('#profile-apiKey').inputValue(), savedKeyMask);
    assert.equal(await page.locator('#profile-apiKey').evaluate((input) => input.readOnly), true);
    await page.locator('#close-model-profile').click();
    await waitForProfileDialogClosed();
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(legacyBytes));
    const verifiedA = await verify(profileA.id);
    assert.equal(verifiedA.label, 'ALPHA');
    assert.equal(verifiedA.authorization, `Bearer ${keyA}`);
    assert.equal((await snapshot()).modelProfiles[0].demoMode, false);

    const beforeCancel = await fs.readFile(workspaceFile);
    await page.locator('#add-model-profile').click();
    await page.locator('#profile-name').fill('取消的新模型');
    await page.locator('#profile-apiKey').fill(canceledKey);
    await page.locator('#cancel-model-profile').click();
    await waitForProfileDialogClosed();
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(beforeCancel));

    // Creating a connection never activates it or borrows another model's key.
    await page.locator('#add-model-profile').click();
    await page.locator('#profile-name').fill('模型乙');
    await page.locator('#profile-baseUrl').fill(baseUrlB);
    await page.locator('#profile-model').fill('profiles-beta-model');
    await page.locator('#profile-apiKey').fill(keyB);
    await page.locator('label:has(#profile-demoMode)').click();
    assert.equal(await page.locator('#profile-demoMode').isChecked(), true);
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();
    const added = await snapshot();
    const profileB = added.modelProfiles.find((profile) => profile.name === '模型乙');
    assert.ok(profileB);
    assert.equal(added.modelProfiles.length, 2);
    assert.equal(added.activeModelProfileId, profileA.id);
    assert.equal(added.settings.baseUrl, baseUrlA);
    assert.equal(added.settings.hasApiKey, true);
    assert.equal(profileB.hasApiKey, true);
    assert.equal(requests.filter((request) => request.label === 'BETA').length, 0);
    await assertSecretsHidden();
    await page.locator('#model-manager-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(work, 'model-management-preview.png') });

    // Verifying a different configuration uses its own encrypted key without
    // selecting it or saving an unrelated interview-preferences draft.
    await page.locator('#setting-role').fill('尚未提交的公共角色草稿');
    const beforeVerifyB = await snapshot();
    const beforeVerifyBDisk = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    const verifiedB = await verify(profileB.id);
    assert.equal(verifiedB.label, 'BETA');
    assert.equal(verifiedB.body.model, 'profiles-beta-model');
    assert.equal(verifiedB.authorization, `Bearer ${keyB}`);
    const afterVerifyB = await snapshot();
    assert.equal(afterVerifyB.activeModelProfileId, profileA.id);
    assert.equal(afterVerifyB.settings.baseUrl, baseUrlA);
    assert.equal(afterVerifyB.settings.model, 'profiles-alpha-model');
    assert.equal(afterVerifyB.settings.demoMode, beforeVerifyB.settings.demoMode);
    assert.equal(afterVerifyB.settings.role, '旧版迁移测试角色');
    assert.equal(
      afterVerifyB.modelProfiles.find((profile) => profile.id === profileB.id).demoMode,
      false,
    );
    assert.equal(await page.locator('#setting-role').inputValue(), '尚未提交的公共角色草稿');
    assert.equal(
      await row(profileA.id).evaluate((element) => element.classList.contains('is-active')),
      true,
    );
    assert.equal(
      await row(profileB.id).evaluate((element) => element.classList.contains('is-active')),
      false,
    );
    const afterVerifyBDisk = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    assert.deepEqual(afterVerifyBDisk.vault, beforeVerifyBDisk.vault);
    assert.equal(afterVerifyBDisk.vault.apiKey, encrypted[0]);
    await assertSecretsHidden();

    // Switching and editing configurations also preserve the unsubmitted draft.
    await select(profileB.id);
    assert.equal(await page.locator('#setting-role').inputValue(), '尚未提交的公共角色草稿');
    assert.equal((await snapshot()).settings.role, '旧版迁移测试角色');

    await row(profileB.id).locator('.edit-model-profile').click();
    assert.equal(await page.locator('#profile-apiKey').inputValue(), savedKeyMask);
    assert.equal(await page.locator('#profile-apiKey').evaluate((input) => input.readOnly), true);
    await page.locator('#replace-profile-apiKey').click();
    assert.equal(await page.locator('#profile-apiKey').inputValue(), '');
    await page.locator('#profile-name').fill('模型乙（已编辑）');
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();
    const verifiedEditedB = await verify(profileB.id);
    assert.equal(verifiedEditedB.label, 'BETA');
    assert.equal(verifiedEditedB.authorization, `Bearer ${keyB}`);
    assert.equal((await snapshot()).settings.role, '旧版迁移测试角色');
    assert.equal(await page.locator('#setting-role').inputValue(), '尚未提交的公共角色草稿');
    await page.locator('#save-settings').click();
    await page.waitForFunction(async () => {
      const state = await window.desktop.bootstrap();
      return (
        state.settings.role === '尚未提交的公共角色草稿' &&
        document.querySelector('#save-settings')?.disabled === false
      );
    });
    await ask('PROFILES_BETA_ORIGINAL_KEY', 'BETA', 'profiles-beta-model', keyB);

    await page.locator('[data-view="settings"]').click();
    const beforeEditCancel = await fs.readFile(workspaceFile);
    await row(profileB.id).locator('.edit-model-profile').click();
    await page.locator('#replace-profile-apiKey').click();
    await page.locator('#profile-apiKey').fill(canceledKey);
    await page.locator('#close-model-profile').click();
    await waitForProfileDialogClosed();
    assert.equal(digest(await fs.readFile(workspaceFile)), digest(beforeEditCancel));
    await row(profileB.id).locator('.edit-model-profile').click();
    await page.locator('#replace-profile-apiKey').click();
    await page.locator('#profile-apiKey').fill(replacementKeyB);
    const beforeReplacementVerification = requests.length;
    await page.locator('#save-test-model-profile').click();
    await waitForProfileDialogClosed();
    assert.equal(requests.length, beforeReplacementVerification + 1);
    assert.equal(requests.at(-1).label, 'BETA');
    assert.equal(requests.at(-1).body.model, 'profiles-beta-model');
    assert.equal(requests.at(-1).authorization, `Bearer ${replacementKeyB}`);
    await ask('PROFILES_BETA_REPLACED_KEY', 'BETA', 'profiles-beta-model', replacementKeyB);
    await assertSecretsHidden();

    // A saved mask is presentation only and must never become the credential.
    await page.locator('[data-view="settings"]').click();
    await row(profileB.id).locator('.edit-model-profile').click();
    assert.equal(await page.locator('#profile-apiKey').inputValue(), savedKeyMask);
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();
    await ask('PROFILES_BETA_AFTER_MASKED_SAVE', 'BETA', 'profiles-beta-model', replacementKeyB);

    await page.locator('#question-input').fill('PROFILES_HOLD_ASK');
    await page.locator('#ask-question').click();
    await waitForHeldRequest();
    await assertModelChangesBlocked(profileA, profileB);
    pendingHold.release();
    pendingHold = null;
    await page.waitForFunction(() => document.querySelector('#question-input')?.disabled === false);

    await page.locator('[data-view="settings"]').click();
    await row(profileB.id).locator('.edit-model-profile').click();
    await page.locator('#profile-model').fill('profiles-hold-verification');
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();
    await row(profileB.id).locator('.test-model-profile').click();
    await waitForHeldRequest();
    await assertModelChangesBlocked(profileA, profileB);
    pendingHold.release();
    pendingHold = null;
    await page.waitForFunction(
      () => document.querySelector('#add-model-profile')?.disabled === false,
    );
    await row(profileB.id).locator('.edit-model-profile').click();
    await page.locator('#profile-model').fill('profiles-beta-model');
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();

    const image = (await fs.readFile(path.join(root, 'assets/icon.png'))).toString('base64');
    await application.evaluate(
      ({ desktopCapturer, nativeImage, screen, BrowserWindow, systemPreferences }, image) => {
        if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';
        const original = desktopCapturer.getSources;
        const source = {
          id: 'screen:0:0',
          display_id: String(
            screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id,
          ),
          name: '多模型测试屏幕',
          thumbnail: nativeImage.createFromBuffer(Buffer.from(image, 'base64')),
        };
        globalThis.__modelProfilesCapture = { started: false, original };
        desktopCapturer.getSources = async () => {
          globalThis.__modelProfilesCapture.started = true;
          return new Promise((resolve) => {
            globalThis.__modelProfilesCapture.release = () => resolve([source]);
          });
        };
      },
      image,
    );
    await page.locator('#capture-answer').click();
    await application.evaluate(async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (globalThis.__modelProfilesCapture.started) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Synthetic screenshot capture did not start.');
    });
    await assertModelChangesBlocked(profileA, profileB);
    await application.evaluate(({ desktopCapturer }) => {
      globalThis.__modelProfilesCapture.release();
      desktopCapturer.getSources = globalThis.__modelProfilesCapture.original;
    });
    await page.waitForFunction(() => document.querySelector('#capture-answer')?.disabled === false);
    assert.equal(requests.at(-1).label, 'BETA');
    assert.equal(requests.at(-1).body.model, 'profiles-beta-model');
    assert.equal(requests.at(-1).authorization, `Bearer ${replacementKeyB}`);

    const beforeClear = await snapshot();
    const beforeClearDisk = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    await page.locator('[data-view="history"]').click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#clear-all-sessions').click();
    await page.waitForFunction(async () => {
      const state = await window.desktop.bootstrap();
      return state.sessions.length === 1 && state.sessions[0].messages.length === 0;
    });
    const cleared = await snapshot();
    assert.deepEqual(cleared.modelProfiles, beforeClear.modelProfiles);
    assert.equal(cleared.activeModelProfileId, profileB.id);
    assert.deepEqual(cleared.settings, beforeClear.settings);
    const clearedDisk = JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
    assert.deepEqual(clearedDisk.vault, beforeClearDisk.vault);

    await application.close();
    application = null;
    await launch();
    const restored = await snapshot();
    assert.deepEqual(restored.modelProfiles, cleared.modelProfiles);
    assert.equal(restored.activeModelProfileId, profileB.id);
    assert.equal(restored.settings.transcriptionModel, 'global-transcription-model');
    assert.equal(restored.settings.hasTranscriptionApiKey, true);
    await ask('PROFILES_BETA_AFTER_RESTART', 'BETA', 'profiles-beta-model', replacementKeyB);
    await select(profileA.id);
    await ask('PROFILES_ALPHA_AFTER_RESTART', 'ALPHA', 'profiles-alpha-model', keyA);

    await page.locator('[data-view="settings"]').click();
    await page.locator('#add-model-profile').click();
    await page.locator('#profile-name').fill('无 Key 的第三个模型');
    await page.locator('#profile-baseUrl').fill(baseUrlB);
    await page.locator('#profile-model').fill('profiles-no-key-model');
    await page.locator('label:has(#profile-demoMode)').click();
    assert.equal(await page.locator('#profile-demoMode').isChecked(), true);
    await page.locator('#save-model-profile').click();
    await waitForProfileDialogClosed();
    const third = (await snapshot()).modelProfiles.find(
      (profile) => profile.model === 'profiles-no-key-model',
    );
    assert.ok(third);
    assert.equal(third.hasApiKey, false);
    assert.equal((await snapshot()).activeModelProfileId, profileA.id);
    page.once('dialog', (dialog) => dialog.accept());
    await row(third.id).locator('.delete-model-profile').click();
    await page.waitForFunction(
      (id) =>
        window.desktop
          .bootstrap()
          .then((state) => !state.modelProfiles.some((profile) => profile.id === id)),
      third.id,
    );
    assert.equal((await snapshot()).activeModelProfileId, profileA.id);

    await select(profileB.id);
    const encryptedB = JSON.parse(await fs.readFile(workspaceFile, 'utf8')).vault.modelProfiles[
      profileB.id
    ];
    assert.equal(typeof encryptedB, 'string');
    assert.ok(encryptedB.length > 0);
    page.once('dialog', (dialog) => dialog.accept());
    await row(profileB.id).locator('.delete-model-profile').click();
    await waitForActive(profileA.id);
    assert.equal((await snapshot()).modelProfiles.length, 1);
    assert.equal(await row(profileA.id).locator('.delete-model-profile').isDisabled(), true);
    const lastDelete = await page.evaluate(async (id) => {
      try {
        await window.desktop.deleteModelProfile(id);
        return '';
      } catch (error) {
        return error.message;
      }
    }, profileA.id);
    assert.match(lastDelete, /至少|最后|保留/);
    const finalBytes = await fs.readFile(workspaceFile, 'utf8');
    const finalDisk = JSON.parse(finalBytes);
    assert.equal(finalDisk.vault.modelProfiles[profileB.id], undefined);
    assert.equal(finalBytes.includes(encryptedB), false);
    assert.equal(finalDisk.vault.apiKey, encrypted[0]);
    for (const secret of [...secrets, savedKeyMask]) {
      assert.equal(finalBytes.includes(secret), false);
      assert.equal(JSON.stringify(await snapshot()).includes(secret), false);
    }
    assert.deepEqual(errors, []);
  },
);
