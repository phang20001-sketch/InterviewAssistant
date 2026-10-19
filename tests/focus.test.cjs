const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron } = require('playwright');
const { editActiveModel } = require('./helpers/model-manager.cjs');
const { Store } = require('../src/store.cjs');

const root = path.resolve(__dirname, '..');

test(
  'capture and clear-chat shortcuts preserve native focus and unrelated local data',
  { timeout: 120000 },
  async (t) => {
    const work = path.join(root, 'work');
    await fs.mkdir(work, { recursive: true });
    const directory = await fs.mkdtemp(path.join(work, 'focus-test-'));
    const fixtureStore = new Store(directory, {});
    fixtureStore.saveSettings({ resume: 'FOCUS_TEST_RESUME' });
    const generation = {
      raw: 'FOCUS_TEST_SAVED_QUESTION',
      model: 'focus-local-model',
      questions: [
        {
          id: 'focus-test-question',
          title: 'FOCUS_TEST_SAVED_QUESTION',
          topic: 'JavaScript',
          category: '技术',
          level: '基础',
          description: 'A local question that must survive clearing one chat.',
          tags: ['focus-test'],
        },
      ],
    };
    fixtureStore.appendQuestionBatch(generation);
    const mockSessionId = fixtureStore.createPractice(generation);
    fixtureStore.createSession();
    const fixtureDirectory = path.join(directory, 'launcher');
    await fs.mkdir(fixtureDirectory);
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    await fs.writeFile(
      path.join(fixtureDirectory, 'package.json'),
      JSON.stringify({ name: 'focus-test-fixture', version: metadata.version, main: 'main.cjs' }),
    );
    // Record the real product callbacks without registering operating-system
    // shortcuts. Calling these callbacks exercises main -> preload -> Vue.
    await fs.writeFile(
      path.join(fixtureDirectory, 'main.cjs'),
      [
        "const { globalShortcut } = require('electron');",
        'globalThis.__focusShortcuts = new Map();',
        'globalShortcut.register = (accelerator, callback) => {',
        '  globalThis.__focusShortcuts.set(accelerator, callback);',
        '  return true;',
        '};',
        `require(${JSON.stringify(path.join(root, 'src/main.cjs'))});`,
        '',
      ].join('\n'),
    );
    const requests = [];
    let holdResponse = false;
    let releaseResponse = null;
    const server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (holdResponse) await new Promise((resolve) => (releaseResponse = resolve));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '7. C' } }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let application;
    t.after(async () => {
      releaseResponse?.();
      if (application) await application.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    });
    const env = { ...process.env, INTERVIEW_STUDIO_DATA_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({
      executablePath: require('electron'),
      args: [fixtureDirectory],
      cwd: root,
      env,
    });
    const page = await application.firstWindow();
    page.setDefaultTimeout(10000);
    // Playwright normally emulates page focus even when the native window is
    // inactive. Disable that so document.hasFocus follows the desktop window.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.waitForFunction(async () => {
      if (!window.desktop?.captureCurrentScreen) return false;
      const state = await window.desktop.bootstrap();
      return document.querySelector('#app-version')?.textContent === `v${state.appInfo.version}`;
    });
    const registered = await application.evaluate(() => [...globalThis.__focusShortcuts.keys()]);
    assert.ok(registered.includes('CommandOrControl+E'));
    assert.ok(registered.includes('CommandOrControl+R'));
    assert.equal(registered.includes('CommandOrControl+Alt+Enter'), false);
    await application.evaluate(async ({ BrowserWindow }) => {
      const workspace = BrowserWindow.getAllWindows()[0];
      if (!workspace.isVisible()) {
        await new Promise((resolve) => workspace.once('show', () => setImmediate(resolve)));
      }
      workspace.focus();
    });
    // Configure the local model before exercising native transparency and
    // minimize transitions. Those transitions emit asynchronous window-state
    // events that can otherwise dismiss a settings dialog while it is edited.
    await editActiveModel(page, {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'focus-local-model',
      apiKey: 'focus-local-test-key',
      demoMode: false,
    });
    await page.locator('[data-view="assistant"]').click();

    // Both the screen image and the competing window belong to this test. No
    // desktop content, browser profile, external model, or real API key is used.
    const image = await fs.readFile(path.join(root, 'assets/icon.png'), 'base64');
    await application.evaluate(
      async ({ BrowserWindow, desktopCapturer, nativeImage, screen, systemPreferences }, image) => {
        const workspace = BrowserWindow.getAllWindows()[0];
        const other = new BrowserWindow({
          width: 360,
          height: 220,
          title: 'Focus regression fixture',
          show: false,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        });
        await other.loadURL('about:blank');
        const probe = { workspace, other, calls: [], failure: false, captures: [], focusEvents: 0 };
        globalThis.__focusTest = probe;
        workspace.on('focus', () => probe.focusEvents++);
        for (const method of ['show', 'showInactive', 'focus']) {
          const original = workspace[method].bind(workspace);
          workspace[method] = (...args) => {
            probe.calls.push(method);
            return original(...args);
          };
        }
        if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';
        desktopCapturer.getSources = async () => {
          probe.captures.push({ visible: workspace.isVisible(), focused: workspace.isFocused() });
          if (probe.failure) throw new Error('FOCUS_TEST_CAPTURE_FAILURE');
          return screen.getAllDisplays().map((display) => ({
            id: `screen:${display.id}:0`,
            display_id: String(display.id),
            name: 'Focus test display',
            thumbnail: nativeImage.createFromBuffer(Buffer.from(image, 'base64')),
          }));
        };
        other.show();
        other.focus();
      },
      image,
    );

    const nativeState = () =>
      application.evaluate(() => {
        const { workspace, other, calls, captures, focusEvents } = globalThis.__focusTest;
        return {
          visible: workspace.isVisible(),
          minimized: workspace.isMinimized(),
          workspaceFocused: workspace.isFocused(),
          otherFocused: other.isFocused(),
          calls,
          captures,
          focusEvents,
        };
      });
    const waitForFocus = async (target) => {
      const deadline = Date.now() + 5000;
      let state;
      do {
        state = await nativeState();
        if (state[`${target}Focused`]) return state;
        await delay(50);
      } while (Date.now() < deadline);
      assert.fail(`Expected native focus on ${target}: ${JSON.stringify(state)}`);
    };
    const prepare = async ({ focused, failure = false, visible = true, minimized = false }) => {
      await application.evaluate(
        ({}, { focused, failure, visible, minimized }) => {
          const probe = globalThis.__focusTest;
          probe.failure = failure;
          if (visible) probe.workspace.showInactive();
          else probe.workspace.hide();
          if (minimized) probe.workspace.minimize();
          const target = focused ? probe.workspace : probe.other;
          target.show();
          target.focus();
          probe.calls = [];
          probe.captures = [];
        },
        { focused, failure, visible, minimized },
      );
      await waitForFocus(focused ? 'workspace' : 'other');
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await application.evaluate(() => {
        globalThis.__focusTest.focusEvents = 0;
      });
    };
    const capture = async (failure = false) => {
      if (failure) {
        await assert.rejects(
          page.evaluate(() => window.desktop.captureCurrentScreen()),
          /FOCUS_TEST_CAPTURE_FAILURE/,
        );
      } else {
        const result = await page.evaluate(() => window.desktop.captureCurrentScreen());
        assert.match(result.dataUrl, /^data:image\/png;base64,/);
      }
    };

    for (const failure of [false, true]) {
      await prepare({ focused: false, failure });
      await capture(failure);
      const background = await nativeState();
      assert.equal(background.visible, true);
      assert.equal(background.workspaceFocused, false);
      assert.equal(background.focusEvents, 0);
      assert.deepEqual(background.calls, ['showInactive']);
      assert.deepEqual(background.captures, [{ visible: false, focused: false }]);

      await prepare({ focused: true, failure });
      await capture(failure);
      const foreground = await waitForFocus('workspace');
      assert.equal(foreground.visible, true);
      assert.equal(foreground.otherFocused, false);
      assert.deepEqual(foreground.calls, ['show']);
      assert.deepEqual(foreground.captures, [{ visible: false, focused: false }]);
    }

    await prepare({ focused: false, visible: false });
    await capture();
    const hidden = await nativeState();
    assert.equal(hidden.visible, false);
    assert.equal(hidden.workspaceFocused, false);
    assert.equal(hidden.focusEvents, 0);
    assert.deepEqual(hidden.calls, []);
    assert.deepEqual(hidden.captures, [{ visible: false, focused: false }]);

    const trigger = (accelerator) =>
      application.evaluate(({}, accelerator) => {
        const callback = globalThis.__focusShortcuts.get(accelerator);
        if (!callback) throw new Error(`Missing shortcut: ${accelerator}`);
        callback();
      }, accelerator);
    const assertBackground = async ({ visible = true, minimized = false } = {}) => {
      const state = await nativeState();
      assert.equal(state.workspaceFocused, false);
      assert.equal(state.focusEvents, 0);
      assert.equal(state.visible, visible);
      assert.equal(state.minimized, minimized);
      assert.equal(state.calls.includes('show'), false);
      assert.equal(state.calls.includes('focus'), false);
      return state;
    };

    // Showing a hidden or minimized workspace must really restore the native
    // surface, rather than passing only because it remains minimized.
    for (const initial of [
      { visible: true },
      { visible: false },
      { visible: true, minimized: true },
    ]) {
      await prepare({ focused: false, ...initial });
      if (initial.minimized) assert.equal((await nativeState()).minimized, true);
      await trigger('CommandOrControl+Shift+Space');
      const after = await nativeState();
      await assertBackground({ visible: after.visible });
      if (!after.visible) await trigger('CommandOrControl+Shift+Space');
      const shown = await assertBackground();
      assert.ok(shown.calls.includes('showInactive'));
    }

    await page.evaluate(() => {
      window.__focusInputCalls = 0;
      const input = document.querySelector('#question-input');
      const original = input.focus.bind(input);
      input.focus = (...args) => {
        window.__focusInputCalls++;
        return original(...args);
      };
    });
    for (const initial of [
      { visible: true },
      { visible: false },
      { visible: true, minimized: true },
    ]) {
      await page.evaluate(() => window.desktop.setTransparentMode(false));
      await page.waitForFunction(() => !document.body.classList.contains('transparent-mode'));
      await delay(350);
      await prepare({ focused: false, ...initial });
      await trigger('CommandOrControl+Shift+T');
      await page.waitForFunction(() => document.body.classList.contains('transparent-mode'));
      await assertBackground();
      assert.equal(await page.evaluate(() => window.__focusInputCalls), 0);
    }

    await page.evaluate(() => window.desktop.setTransparentMode(false));
    await page.waitForFunction(() => !document.body.classList.contains('transparent-mode'));

    const waitIdle = () =>
      page.waitForFunction(() => document.querySelector('#capture-answer')?.disabled === false);
    const storedAnswers = () =>
      page.evaluate(async () => {
        const state = await window.desktop.bootstrap();
        return state.sessions.flatMap((session) =>
          session.messages.filter((message) => message.role === 'assistant'),
        );
      });
    const waitForAnswer = async (count) => {
      await page.waitForFunction(async (count) => {
        const state = await window.desktop.bootstrap();
        return (
          state.sessions.flatMap((session) =>
            session.messages.filter((message) => message.role === 'assistant'),
          ).length === count
        );
      }, count);
      await waitIdle();
      assert.equal((await storedAnswers()).at(-1).content, '7. C');
      const displayed = (
        await page.locator('#answer-body .markdown-content').last().innerText()
      ).trim();
      assert.ok(['C', '7. C'].includes(displayed));
    };

    // Draft text is changed with an input event, without focusing the app.
    await page.evaluate(() => {
      const input = document.querySelector('#question-input');
      input.value = 'FOCUS_TEST_EXISTING_DRAFT';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await prepare({ focused: false, visible: false });
    await trigger('CommandOrControl+Shift+Enter');
    await waitForAnswer(1);
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0].messages), /FOCUS_TEST_EXISTING_DRAFT/);
    const asked = await assertBackground();
    assert.deepEqual(asked.calls, ['showInactive']);
    assert.equal(asked.captures.length, 0);

    for (const initial of [
      { visible: true },
      { visible: false },
      { visible: true, minimized: true },
    ]) {
      const beforeRequests = requests.length;
      const beforeAnswers = (await storedAnswers()).length;
      await prepare({ focused: false, ...initial });
      await trigger('CommandOrControl+E');
      await waitForAnswer(beforeAnswers + 1);
      const captured = await assertBackground();
      assert.equal(requests.length, beforeRequests + 1);
      assert.deepEqual(captured.calls, ['showInactive', 'showInactive']);
      assert.deepEqual(captured.captures, [{ visible: false, focused: false }]);
      const imageParts = requests
        .at(-1)
        .messages.flatMap((message) =>
          Array.isArray(message.content)
            ? message.content.filter((part) => part.type === 'image_url')
            : [],
        );
      assert.equal(imageParts.length, 1);
      assert.match(imageParts[0].image_url.url, /^data:image\/png;base64,/);
    }

    const beforeFallbackRequests = requests.length;
    const beforeFallbackAnswers = (await storedAnswers()).length;
    await prepare({ focused: true });
    await page.evaluate(() => {
      const input = document.querySelector('#question-input');
      input.value = 'FOCUS_TEST_UNSENT_FALLBACK_DRAFT';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'e',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitForAnswer(beforeFallbackAnswers + 1);
    assert.equal(requests.length, beforeFallbackRequests + 1);
    assert.doesNotMatch(
      JSON.stringify(requests.at(-1).messages),
      /FOCUS_TEST_UNSENT_FALLBACK_DRAFT/,
    );
    assert.equal(
      await page.locator('#question-input').inputValue(),
      'FOCUS_TEST_UNSENT_FALLBACK_DRAFT',
    );
    const fallback = await waitForFocus('workspace');
    assert.deepEqual(fallback.calls, ['show']);
    assert.deepEqual(fallback.captures, [{ visible: false, focused: false }]);

    // Keep the existing conversation as a control while clearing a second one.
    await page.locator('#new-session').click();
    const oldAnswers = (await storedAnswers()).length;
    await page.locator('#question-input').fill('FOCUS_TEST_CHAT_TO_CLEAR');
    await prepare({ focused: false });
    await trigger('CommandOrControl+Shift+Enter');
    await waitForAnswer(oldAnswers + 1);
    const clearTarget = await page.evaluate(() => window.desktop.bootstrap());
    const clearSessionId = clearTarget.activeSessionId;
    const unchangedSessions = clearTarget.sessions.filter(
      (session) => session.id !== clearSessionId,
    );
    assert.ok(unchangedSessions.some((session) => session.messages.length > 0));
    assert.ok(unchangedSessions.some((session) => session.id === mockSessionId));

    await page.locator('[data-mode="screenshot"]').click();
    await page.locator('#pick-screen').click();
    await page.locator('.screen-option').first().click();
    await page.waitForFunction(() => !document.querySelector('#image-preview').hidden);
    await page.evaluate(() => {
      window.__clearChatConfirmCalls = 0;
      window.confirm = () => {
        window.__clearChatConfirmCalls++;
        return false;
      };
      const input = document.querySelector('#question-input');
      input.value = 'FOCUS_TEST_DRAFT_TO_CLEAR';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => window.desktop.setTransparentMode(true));
    await page.waitForFunction(() => document.body.classList.contains('transparent-mode'));
    await prepare({ focused: false, visible: false });
    const beforeClearRequests = requests.length;
    await trigger('CommandOrControl+R');
    await page.waitForFunction(async (id) => {
      const state = await window.desktop.bootstrap();
      return state.sessions.find((session) => session.id === id)?.messages.length === 0;
    }, clearSessionId);
    await waitIdle();
    await assertBackground({ visible: false });
    assert.deepEqual((await nativeState()).calls, []);
    assert.equal(requests.length, beforeClearRequests);
    assert.equal(await page.locator('#question-input').inputValue(), '');
    assert.equal(await page.locator('#image-preview').evaluate((element) => element.hidden), true);
    assert.equal(await page.evaluate(() => window.__clearChatConfirmCalls), 0);
    const cleared = await page.evaluate(() => window.desktop.bootstrap());
    assert.equal(cleared.activeSessionId, clearSessionId);
    assert.deepEqual(
      cleared.sessions.filter((session) => session.id !== clearSessionId),
      unchangedSessions,
    );
    assert.deepEqual(cleared.settings, clearTarget.settings);
    assert.deepEqual(cleared.modelProfiles, clearTarget.modelProfiles);
    assert.deepEqual(cleared.questionBatches, clearTarget.questionBatches);
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'workspace.json'), 'utf8'));
    assert.equal(saved.activeSessionId, clearSessionId);
    assert.deepEqual(saved.sessions.find((session) => session.id === clearSessionId).messages, []);
    assert.deepEqual(
      saved.sessions.filter((session) => session.id !== clearSessionId),
      unchangedSessions,
    );
    assert.equal(saved.settings.resume, 'FOCUS_TEST_RESUME');
    assert.equal(saved.questionBatches.length, 1);

    // Repeat and composition events must not discard a user's unsent draft.
    await page.evaluate(() => window.desktop.setTransparentMode(false));
    await page.waitForFunction(() => !document.body.classList.contains('transparent-mode'));
    await prepare({ focused: true });
    await page.locator('#question-input').fill('FOCUS_TEST_PROTECTED_DRAFT');
    for (const flags of [{ repeat: true }, { isComposing: true }]) {
      await page.evaluate((flags) => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'r',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            ...flags,
          }),
        );
      }, flags);
      assert.equal(
        await page.locator('#question-input').inputValue(),
        'FOCUS_TEST_PROTECTED_DRAFT',
      );
    }

    // A pending AI request also blocks both repeated capture and clear actions.
    holdResponse = true;
    const beforeBusyRequests = requests.length;
    const beforeBusyAnswers = (await storedAnswers()).length;
    await prepare({ focused: false });
    await trigger('CommandOrControl+E');
    while (requests.length === beforeBusyRequests) await delay(20);
    await trigger('CommandOrControl+E');
    await trigger('CommandOrControl+R');
    await delay(100);
    assert.equal(requests.length, beforeBusyRequests + 1);
    assert.equal(await page.locator('#question-input').inputValue(), 'FOCUS_TEST_PROTECTED_DRAFT');
    await assertBackground();
    holdResponse = false;
    releaseResponse();
    releaseResponse = null;
    await waitForAnswer(beforeBusyAnswers + 1);

    // The renderer fallback consumes Ctrl+R itself instead of refreshing Electron.
    await prepare({ focused: true });
    const prevented = await page.evaluate(() => {
      window.__clearChatReloadMarker = 'same-renderer';
      const event = new KeyboardEvent('keydown', {
        key: 'r',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(prevented, true);
    await page.waitForFunction(async (id) => {
      const state = await window.desktop.bootstrap();
      return state.sessions.find((session) => session.id === id)?.messages.length === 0;
    }, clearSessionId);
    await waitIdle();
    assert.equal(await page.evaluate(() => window.__clearChatReloadMarker), 'same-renderer');
    assert.equal(await page.locator('#question-input').inputValue(), '');
    assert.equal(
      (await page.evaluate(() => window.desktop.bootstrap())).activeSessionId,
      clearSessionId,
    );
  },
);
