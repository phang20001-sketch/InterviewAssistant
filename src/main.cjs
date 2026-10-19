const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  session,
  safeStorage,
  desktopCapturer,
  dialog,
  shell,
  globalShortcut,
  screen,
  systemPreferences,
  Menu,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Store } = require('./store.cjs');
const ai = require('./services/ai.cjs');
const practice = require('./services/practice.cjs');
const { extractResume } = require('./services/resume.cjs');
const { createWindowModeController } = require('./window-mode.cjs');
const { createRendererHandler } = require('./renderer-protocol.cjs');

// Isolate automated test instances before Electron acquires its single-instance lock.
if (!app.isPackaged && process.env.INTERVIEW_STUDIO_DATA_DIR) {
  const testDirectory = path.resolve(process.env.INTERVIEW_STUDIO_DATA_DIR);
  require('node:fs').mkdirSync(testDirectory, { recursive: true });
  app.setPath('userData', testDirectory);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const squirrelStartup = require('electron-squirrel-startup');
const inProgress = new Set();
let mainWindow;
let store;
let windowMode;
let captureInProgress = false;
let connectionTestInProgress = false;
let transcriptionsInProgress = 0;

const modelSettingKeys = new Set([
  'baseUrl',
  'model',
  'demoMode',
  'apiKey',
  'clearApiKey',
  'resume',
  'role',
  'language',
  'answerStyle',
  'experienceLevel',
  'targetCompany',
  'jobDescription',
  'interviewType',
  'interviewDifficulty',
  'focusAreas',
  'improvementGoals',
  'additionalRequirements',
]);

function assertModelProfileIdle() {
  if (inProgress.size || captureInProgress || connectionTestInProgress || transcriptionsInProgress)
    throw new Error('正在生成回答、截屏或验证连接，请等待完成后再修改模型配置或简历。');
}

function snapshot() {
  return {
    ...store.snapshot(),
    appInfo: { version: app.getVersion(), platform: process.platform },
    windowState: windowMode?.state() || { transparentMode: false, isMaximized: false },
  };
}

function applyWindowSettings() {
  const settings = store.settings();
  mainWindow?.setAlwaysOnTop(settings.alwaysOnTop);
  mainWindow?.setContentProtection(settings.contentProtection);
}

function trusted(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !event.senderFrame.url.startsWith('studio://app/')
  )
    throw new Error('不允许的调用来源。');
}

function handle(name, callback) {
  ipcMain.handle('studio:' + name, async (event, ...args) => {
    trusted(event);
    return callback(...args);
  });
}

function practiceCount(value, allowed, fallback) {
  const count = value === undefined ? fallback : value;
  if (!allowed.includes(count)) throw new Error('请选择界面提供的生成题数。');
  return count;
}

function savedQuestionTitles() {
  const data = store.snapshot();
  return [
    ...(data.questionBatches || []).flatMap((batch) =>
      batch.questions.map((question) => question.title),
    ),
    ...[...data.sessions]
      .reverse()
      .flatMap((session) => (session.practice?.questions || []).map((question) => question.title)),
  ];
}

function checkScreenPermission() {
  if (
    process.platform === 'darwin' &&
    systemPreferences.getMediaAccessStatus('screen') === 'denied'
  ) {
    throw new Error(
      '请在系统设置 → 隐私与安全性 → 屏幕与系统音频录制中允许本应用，随后完全退出并重新打开应用。开发模式请授权 Electron。',
    );
  }
}

async function captureScreenImage({ sourceId, display } = {}) {
  checkScreenPermission();
  if (captureInProgress) throw new Error('正在截取屏幕，请稍后重试。');
  const captureWindow = mainWindow;
  if (!captureWindow || captureWindow.isDestroyed())
    throw new Error('窗口已关闭，请重新打开应用。');
  captureInProgress = true;
  const wasVisible = captureWindow.isVisible();
  const wasFocused = captureWindow.isFocused();
  try {
    if (wasVisible) captureWindow.hide();
    // Allow the desktop compositor to remove our window before taking the image.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const pixelWidth = Math.max(
      1,
      Math.round((display?.size.width || 1920) * (display?.scaleFactor || 1)),
    );
    const pixelHeight = Math.max(
      1,
      Math.round((display?.size.height || 1080) * (display?.scaleFactor || 1)),
    );
    const ratio = Math.min(1, 3840 / pixelWidth, 2160 / pixelHeight);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(pixelWidth * ratio),
        height: Math.round(pixelHeight * ratio),
      },
    });
    const selected = sourceId
      ? sources.find((source) => source.id === sourceId)
      : sources.find((source) => source.display_id === String(display.id)) ||
        (sources.length === 1 ? sources[0] : null);
    if (!selected || selected.thumbnail.isEmpty())
      throw new Error('无法读取当前屏幕，请重试，或在“截图识别”中手动选择屏幕。');
    const png = selected.thumbnail.toPNG();
    // Keep high-resolution text legible while respecting the model image limit.
    if (png.length <= 8 * 1024 * 1024)
      return { dataUrl: 'data:image/png;base64,' + png.toString('base64') };
    const jpeg = selected.thumbnail.toJPEG(90);
    if (jpeg.length > 8 * 1024 * 1024) throw new Error('屏幕截图过大，请降低屏幕分辨率后重试。');
    return { dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') };
  } finally {
    captureInProgress = false;
    if (wasVisible && !captureWindow.isDestroyed()) {
      if (wasFocused) captureWindow.show();
      else captureWindow.showInactive();
    }
  }
}

function registerHandlers() {
  handle('bootstrap', snapshot);
  handle('get-window-state', () => windowMode.state());
  handle('set-transparent-mode', (enabled) => windowMode.setTransparentMode(enabled));
  handle('window-control', (action) => windowMode.control(action));
  handle('save-settings', (patch) => {
    if (patch && Object.keys(patch).some((key) => modelSettingKeys.has(key)))
      assertModelProfileIdle();
    store.saveSettings(patch);
    if (Object.hasOwn(patch, 'alwaysOnTop') || Object.hasOwn(patch, 'contentProtection'))
      applyWindowSettings();
    return snapshot();
  });
  handle('save-model-profile', (profile) => {
    assertModelProfileIdle();
    store.saveModelProfile(profile);
    return snapshot();
  });
  handle('select-model-profile', (id) => {
    assertModelProfileIdle();
    store.selectModelProfile(id);
    return snapshot();
  });
  handle('delete-model-profile', (id) => {
    assertModelProfileIdle();
    store.deleteModelProfile(id);
    return snapshot();
  });
  handle('create-session', (options) => {
    store.createSession(options);
    return snapshot();
  });
  handle('switch-session', (id) => {
    store.switchSession(id);
    return snapshot();
  });
  handle('delete-session', (id) => {
    if (inProgress.has(id)) throw new Error('当前会话正在生成回答，请稍后再删除。');
    store.deleteSession(id);
    return snapshot();
  });
  handle('clear-sessions', () => {
    if (inProgress.size || captureInProgress)
      throw new Error('正在生成回答或截屏，请等待完成后再清除会话。');
    store.clearSessions();
    return snapshot();
  });
  handle('start-practice', async (options = {}) => {
    assertModelProfileIdle();
    const count = practiceCount(options.count, [3, 5, 8], 5);
    if (store.snapshot().sessions.length >= 100)
      throw new Error('本地会话已达 100 条，请先删除不需要的会话后再开始。');
    inProgress.add('practice-generation');
    try {
      const result = await practice.generateQuestions({
        settings: store.settings(),
        apiKey: store.credential(),
        kind: 'mock',
        count,
        previousTitles: savedQuestionTitles().slice(-200),
      });
      store.createPractice(result);
      return snapshot();
    } finally {
      inProgress.delete('practice-generation');
    }
  });
  handle('append-practice', async (input) => {
    assertModelProfileIdle();
    if (!input || typeof input.sessionId !== 'string')
      throw new Error('请先开始一场面试，再追加问题。');
    const count = practiceCount(input.count, [3, 5, 8], 5);
    const current = store.session(input.sessionId);
    const plan = current.practice;
    if (current.mode !== 'mock' || !plan)
      throw new Error('这份旧版记录不支持追加问题，请开始新的面试。');
    inProgress.add(current.id);
    try {
      const result = await practice.generateQuestions({
        settings: {
          ...store.settings(),
          ...plan.preferences,
          resume: plan.resume,
          role: plan.role,
        },
        apiKey: store.credential(),
        kind: 'mock',
        purpose: 'append',
        count,
        previousTitles: [
          ...savedQuestionTitles(),
          ...plan.questions.map((question) => question.title),
        ].slice(-200),
      });
      store.appendPracticeQuestions(current.id, result);
      return snapshot();
    } finally {
      inProgress.delete(current.id);
    }
  });
  handle('review-practice', async (input) => {
    assertModelProfileIdle();
    if (!input || typeof input.answer !== 'string') throw new Error('请先填写你的回答。');
    const answer = input.answer.trim();
    if (!answer || answer.length > 10000) throw new Error('回答不能为空，且不能超过 10000 字。');
    const current = store.session(input.sessionId);
    const plan = current.practice;
    const question = plan?.questions?.[plan.reviews.length];
    if (current.mode !== 'mock' || !question || plan.status !== 'active')
      throw new Error('这轮面试没有待回答的问题，请查看记录或开始新练习。');
    inProgress.add(current.id);
    try {
      const result = await practice.reviewAnswer({
        settings: {
          ...store.settings(),
          ...plan.preferences,
          resume: plan.resume,
          role: plan.role,
        },
        apiKey: store.credential(),
        question,
        answer,
      });
      store.appendPracticeReview(current.id, answer, result);
      return snapshot();
    } finally {
      inProgress.delete(current.id);
    }
  });
  handle('generate-question-bank', async (options = {}) => {
    assertModelProfileIdle();
    const count = practiceCount(options.count, [5, 10], 5);
    inProgress.add('library-generation');
    try {
      const batches = store.snapshot().questionBatches || [];
      const previousTitles = batches.flatMap((batch) => batch.questions.map((item) => item.title));
      const result = await practice.generateQuestions({
        settings: store.settings(),
        apiKey: store.credential(),
        kind: 'library',
        count,
        previousTitles: previousTitles.slice(-200),
      });
      store.appendQuestionBatch(result);
      return snapshot();
    } finally {
      inProgress.delete('library-generation');
    }
  });
  handle('ask', async (input) => {
    if (!input || typeof input.question !== 'string') throw new Error('请输入问题。');
    const question = input.question.trim();
    if (!question || question.length > 12000)
      throw new Error('问题不能为空，且不能超过 12000 字。');
    if (input.answerFormat !== undefined && input.answerFormat !== 'numbered-only')
      throw new Error('回答格式无效。');
    if (input.answerFormat === 'numbered-only' && !input.image)
      throw new Error('请先截取需要作答的屏幕。');
    if (
      input.image &&
      (typeof input.image !== 'string' ||
        input.image.length > 12 * 1024 * 1024 ||
        !/^data:image\/(png|jpeg|webp);base64,/.test(input.image))
    )
      throw new Error('截图格式无效或文件过大。');
    const current = store.session(input.sessionId);
    if (current.practice) throw new Error('请在模拟面试页面提交这一题的回答，以保存逐题评分。');
    if (current.messages.length >= 198) throw new Error('当前会话已满，请新建会话继续。');
    if (inProgress.size) throw new Error('正在生成回答，请等待完成后再发送。');
    inProgress.add(current.id);
    try {
      const result = await ai.answer({
        settings: store.settings(),
        apiKey: store.credential(),
        question,
        image: input.image,
        messages: current.messages,
        mode: current.mode,
        answerFormat: input.answerFormat,
      });
      store.appendAnswer(
        current.id,
        question,
        result,
        input.image ? 'screenshot' : input.source === 'voice' ? 'voice' : 'text',
      );
      return snapshot();
    } finally {
      inProgress.delete(current.id);
    }
  });
  handle('list-screens', async () => {
    checkScreenPermission();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 400, height: 240 },
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });
  handle('capture-screen', async (id) => {
    if (typeof id !== 'string' || !id.startsWith('screen:'))
      throw new Error('请选择要截取的屏幕。');
    return captureScreenImage({ sourceId: id });
  });
  handle('capture-current-screen', () => {
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    return captureScreenImage({ display });
  });
  handle('transcribe', async (recording) => {
    if (!recording || !recording.audio || typeof recording.mimeType !== 'string')
      throw new Error('录音数据无效。');
    const audio = Buffer.from(recording.audio);
    if (audio.length > 20 * 1024 * 1024 || !audio.length)
      throw new Error('录音不能为空，且不能超过 20 MB。');
    transcriptionsInProgress += 1;
    try {
      return await ai.transcribe({
        settings: store.settings(),
        apiKey: store.credential(),
        transcriptionApiKey: store.credential('transcriptionApiKey'),
        audio,
        mimeType: recording.mimeType,
      });
    } finally {
      transcriptionsInProgress -= 1;
    }
  });
  handle('test-connection', async (id) => {
    assertModelProfileIdle();
    connectionTestInProgress = true;
    try {
      const profileId = id === undefined ? store.snapshot().activeModelProfileId : id;
      const { settings, apiKey } = store.modelConnection(profileId);
      const result = await ai.testConnection({ settings, apiKey });
      const current = store.modelConnection(profileId);
      if (
        current.settings.baseUrl !== settings.baseUrl ||
        current.settings.model !== settings.model ||
        current.apiKey !== apiKey
      )
        throw new Error('验证期间模型配置发生变化，请重新验证当前配置。');
      store.enableModelProfile(profileId);
      const active = store.snapshot().activeModelProfileId === profileId;
      return {
        ...result,
        message: active
          ? '连接成功，当前模型已启用 AI。'
          : '连接成功，该配置已启用 AI，点击「使用」可切换到此模型。',
        state: snapshot(),
      };
    } finally {
      connectionTestInProgress = false;
    }
  });
  handle('import-resume', async () => {
    assertModelProfileIdle();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '上传并保存简历',
      filters: [{ name: '简历文件', extensions: ['pdf', 'docx', 'txt', 'md'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return { canceled: true };
    assertModelProfileIdle();
    const text = await extractResume(result.filePaths[0]);
    assertModelProfileIdle();
    store.saveSettings({ resume: text });
    return { canceled: false, text, state: snapshot() };
  });
  handle('export-session', async (id) => {
    const current = store.session(id);
    const title = current.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 50);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出面试记录',
      defaultPath: path.join(app.getPath('documents'), title + '.md'),
      filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const lines = ['# ' + current.title, '', '创建时间：' + current.createdAt, ''];
    for (const message of current.messages)
      lines.push(
        '## ' + (message.role === 'user' ? '提问 / 作答' : message.demo ? '演示回答' : 'AI 回答'),
        '',
        message.content,
        '',
      );
    await fs.writeFile(result.filePath, lines.join('\n'), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
  handle('show-data-folder', async () => {
    const result = await shell.openPath(store.directory);
    if (result) throw new Error('无法打开数据文件夹。');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1000,
    minHeight: 700,
    title: '面试工作台 · Interview Studio',
    backgroundColor: '#00000000',
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    icon: path.join(
      __dirname,
      '..',
      'assets',
      process.platform === 'darwin' ? 'icon.png' : 'icon.ico',
    ),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  windowMode = createWindowModeController(mainWindow, screen, applyWindowSettings);
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    windowMode = null;
  });
  mainWindow.webContents.on('render-process-gone', () => {
    dialog.showErrorBox('界面意外退出', '请重新打开面试工作台。已保存的会话仍保留在本地。');
  });
  mainWindow
    .loadURL('studio://app/index.html')
    .catch(() =>
      dialog.showErrorBox('启动失败', '无法载入应用界面，请重新安装或重新运行 npm install。'),
    );
  applyWindowSettings();
}

async function ready() {
  app.setName('Interview Studio');
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
  }
  if (process.platform === 'win32')
    app.setAppUserModelId('com.squirrel.InterviewStudio.InterviewStudio');
  const dataDirectory =
    !app.isPackaged && process.env.INTERVIEW_STUDIO_DATA_DIR
      ? path.resolve(process.env.INTERVIEW_STUDIO_DATA_DIR)
      : path.join(app.getPath('appData'), 'Interview Studio');
  await fs.mkdir(dataDirectory, { recursive: true });
  app.setPath('userData', dataDirectory);
  store = new Store(app.getPath('userData'), safeStorage);
  const renderer = path.join(__dirname, '..', 'dist', 'renderer');
  protocol.handle('studio', await createRendererHandler(renderer, (url) => net.fetch(url)));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    ];
    callback({ responseHeaders: headers });
  });
  session.defaultSession.setPermissionRequestHandler(
    async (contents, permission, callback, details) => {
      const allowed =
        permission === 'clipboard-sanitized-write' ||
        (permission === 'media' && details.mediaTypes?.every((type) => type === 'audio'));
      const trustedRequest =
        contents === mainWindow?.webContents &&
        contents.getURL().startsWith('studio://app/') &&
        allowed;
      if (trustedRequest && permission === 'media' && process.platform === 'darwin') {
        try {
          callback(await systemPreferences.askForMediaAccess('microphone'));
        } catch {
          callback(false);
        }
        return;
      }
      callback(trustedRequest);
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin) =>
      contents === mainWindow?.webContents &&
      origin.startsWith('studio://app') &&
      ['media', 'clipboard-sanitized-write'].includes(permission),
  );
  registerHandlers();
  createWindow();
  for (const [accelerator, action] of [
    ['CommandOrControl+Shift+H', 'capture'],
    ['CommandOrControl+Alt+Enter', 'capture-answer'],
    ['CommandOrControl+Shift+Enter', 'ask'],
    ['CommandOrControl+Shift+N', 'new-session'],
  ]) {
    globalShortcut.register(accelerator, () => {
      if (!mainWindow) return;
      if (action === 'ask' || action === 'capture-answer') mainWindow.showInactive();
      else mainWindow.show();
      mainWindow.webContents.send('studio:shortcut', { type: action });
    });
  }
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.showInactive();
  });
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (!mainWindow || !windowMode || windowMode.recentlyChanged()) return;
    mainWindow.showInactive();
    windowMode.setTransparentMode(!windowMode.state().transparentMode);
  });
}

if (squirrelStartup) app.quit();
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(ready)
    .catch((error) => {
      dialog.showErrorBox('面试工作台无法启动', error.message);
      app.exit(1);
    });
  app.on('activate', () => {
    if (!mainWindow && store) createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
