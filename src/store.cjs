const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const modelProfiles = require('./services/model-profiles.cjs');
const interviewPreferences = require('./services/interview-preferences.cjs');

const defaults = Object.freeze({
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  transcriptionBaseUrl: '',
  transcriptionModel: 'whisper-1',
  role: '前端开发工程师',
  language: '简体中文',
  answerStyle: 'concise',
  resume: '',
  ...interviewPreferences.defaults,
  alwaysOnTop: false,
  contentProtection: false,
  demoMode: true,
  transparentTextOpacity: 100,
  transparentBackgroundOpacity: 0,
  transparentFontSize: 16,
});
const opacityKeys = ['transparentTextOpacity', 'transparentBackgroundOpacity'];
const stringLimits = {
  baseUrl: 512,
  model: 160,
  transcriptionBaseUrl: 512,
  transcriptionModel: 160,
  role: 120,
  language: 80,
  resume: 16000,
  ...interviewPreferences.stringLimits,
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const MAX_MESSAGE_CHARS = 512 * 1024;
// Practice reviews also keep the complete model reply in their structured record.
// The exported assistant message adds a short score label to that bounded reply.
const MAX_PRACTICE_MESSAGE_CHARS = MAX_MESSAGE_CHARS + 100;
const workspaceCopyNames = [
  /^workspace\.json\.(?:bak|tmp)$/,
  /^workspace\.json\.before-\d+\.\d+\.\d+-\d{14}\.bak$/,
  /^workspace\.before-1\.0\.1-\d{13}\.json$/,
];

function removeWorkspaceCopies(directory) {
  try {
    const copies = fs
      .readdirSync(directory)
      .filter((name) => workspaceCopyNames.some((pattern) => pattern.test(name)))
      .map((name) => path.join(directory, name));

    // Only remove the application's own ordinary files in this exact directory.
    // Validate the complete list first, so links and directories are never followed.
    for (const file of copies) {
      if (!fs.lstatSync(file).isFile()) throw new Error('Unexpected workspace copy type.');
    }
    for (const file of copies) fs.unlinkSync(file);
  } catch {
    throw new Error('无法清除本地会话副本。请检查数据文件夹的权限和文件类型后重试。');
  }
}

function newSession(mode = 'interview', title) {
  if (!['interview', 'coding', 'mock'].includes(mode)) throw new Error('不支持的会话类型。');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: title
      ? String(title).trim().slice(0, 80)
      : mode === 'mock'
        ? '模拟面试练习'
        : mode === 'coding'
          ? '截图解题'
          : '新的面试',
    mode,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function validateQuestions(questions) {
  if (!Array.isArray(questions)) throw new Error('题目数据格式不正确。');
  const ids = new Set();
  for (const question of questions) {
    if (
      !question ||
      typeof question !== 'object' ||
      typeof question.id !== 'string' ||
      !question.id ||
      ids.has(question.id) ||
      typeof question.title !== 'string' ||
      !question.title.trim() ||
      question.title.length > 2000 ||
      !['topic', 'category', 'level', 'description'].every(
        (key) => typeof question[key] === 'string' && question[key].length <= MAX_MESSAGE_CHARS,
      ) ||
      !Array.isArray(question.tags) ||
      question.tags.some((tag) => typeof tag !== 'string' || tag.length > MAX_MESSAGE_CHARS)
    ) {
      throw new Error('题目数据不完整。');
    }
    ids.add(question.id);
  }
}

function validateGeneration(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    typeof result.raw !== 'string' ||
    !result.raw.trim() ||
    result.raw.length > MAX_MESSAGE_CHARS ||
    typeof result.model !== 'string' ||
    result.model.length > 200
  ) {
    throw new Error('生成结果不完整，无法保存。');
  }
  validateQuestions(result.questions);
}

function generationBatch(result, createdAt) {
  return {
    id: randomUUID(),
    createdAt,
    questionIds: result.questions.map((question) => question.id),
    raw: result.raw,
    model: result.model,
  };
}

function validatePracticeGenerations(practice) {
  // Older records retain their original representation until questions are
  // explicitly appended. Merely opening the workspace never rewrites them.
  if (practice.generations === undefined) return;
  if (!Array.isArray(practice.generations) || !practice.generations.length) {
    throw new Error('模拟面试生成批次不完整。');
  }
  const batchIds = new Set();
  const questionIds = [];
  for (const batch of practice.generations) {
    if (
      !batch ||
      typeof batch !== 'object' ||
      typeof batch.id !== 'string' ||
      !batch.id ||
      batchIds.has(batch.id) ||
      typeof batch.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(batch.createdAt)) ||
      !Array.isArray(batch.questionIds) ||
      batch.questionIds.some((id) => typeof id !== 'string' || !id) ||
      typeof batch.raw !== 'string' ||
      !batch.raw.trim() ||
      batch.raw.length > MAX_MESSAGE_CHARS ||
      typeof batch.model !== 'string' ||
      batch.model.length > 200
    ) {
      throw new Error('模拟面试生成批次不完整。');
    }
    batchIds.add(batch.id);
    questionIds.push(...batch.questionIds);
  }
  if (
    questionIds.length !== practice.questions.length ||
    questionIds.some((id, index) => id !== practice.questions[index].id) ||
    practice.generations[0].raw !== practice.rawQuestions ||
    practice.generations[0].model !== practice.model
  ) {
    throw new Error('模拟面试生成批次与题目不匹配。');
  }
}

function validateReview(review) {
  if (
    !review ||
    typeof review.answer !== 'string' ||
    !review.answer.trim() ||
    review.answer.length > 10_000 ||
    typeof review.content !== 'string' ||
    !review.content.trim() ||
    review.content.length > MAX_MESSAGE_CHARS ||
    typeof review.raw !== 'string' ||
    !review.raw.trim() ||
    review.raw.length > MAX_MESSAGE_CHARS ||
    typeof review.model !== 'string' ||
    review.model.length > 200 ||
    (review.score !== null &&
      (typeof review.score !== 'number' ||
        !Number.isFinite(review.score) ||
        review.score < 0 ||
        review.score > 100))
  ) {
    throw new Error('点评结果不完整，无法保存。');
  }
}

function validatePractice(practice) {
  if (
    !practice ||
    typeof practice !== 'object' ||
    !['active', 'unparsed', 'completed'].includes(practice.status) ||
    !Array.isArray(practice.reviews) ||
    typeof practice.rawQuestions !== 'string' ||
    !practice.rawQuestions.trim() ||
    practice.rawQuestions.length > MAX_MESSAGE_CHARS ||
    typeof practice.model !== 'string' ||
    practice.model.length > 200 ||
    typeof practice.resume !== 'string' ||
    !practice.resume.trim() ||
    practice.resume.length > stringLimits.resume ||
    typeof practice.role !== 'string' ||
    practice.role.length > stringLimits.role
  ) {
    throw new Error('模拟面试数据不完整。');
  }
  validateQuestions(practice.questions);
  validatePracticeGenerations(practice);
  if (practice.preferences !== undefined) {
    interviewPreferences.validateSnapshot(practice.preferences);
  }
  if (practice.reviews.length > practice.questions.length) {
    throw new Error('模拟面试点评数量不正确。');
  }
  const questionCount = practice.questions.length;
  const reviewCount = practice.reviews.length;
  if (
    (practice.status === 'unparsed' && (questionCount !== 0 || reviewCount !== 0)) ||
    (practice.status === 'active' && (questionCount === 0 || reviewCount >= questionCount)) ||
    (practice.status === 'completed' &&
      (questionCount === 0 ||
        reviewCount !== questionCount ||
        typeof practice.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(practice.completedAt)))) ||
    (practice.status !== 'completed' && practice.completedAt !== undefined)
  ) {
    throw new Error('模拟面试进度与完成状态不一致。');
  }
  for (const [index, review] of practice.reviews.entries()) {
    validateReview(review);
    if (
      review.questionId !== practice.questions[index].id ||
      typeof review.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(review.createdAt))
    ) {
      throw new Error('模拟面试点评与题目不匹配。');
    }
  }
}

function validateSaved(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.sessions) ||
    !data.settings ||
    typeof data.settings !== 'object'
  )
    throw new Error('数据格式不正确。');
  if (data.sessions.length > 100) throw new Error('会话数量超出限制。');
  interviewPreferences.validatePatch(data.settings);
  for (const session of data.sessions) {
    if (session.practice !== undefined) validatePractice(session.practice);
    const messageLimit = session.practice ? session.practice.questions.length * 2 : 200;
    const messageCharacters = session.practice ? MAX_PRACTICE_MESSAGE_CHARS : MAX_MESSAGE_CHARS;
    if (
      session.practice &&
      (session.mode !== 'mock' || session.messages?.length !== session.practice.reviews.length * 2)
    ) {
      throw new Error('模拟面试消息与点评记录不一致。');
    }
    if (
      typeof session.id !== 'string' ||
      typeof session.title !== 'string' ||
      !['interview', 'coding', 'mock'].includes(session.mode) ||
      !Array.isArray(session.messages) ||
      session.messages.length > messageLimit
    )
      throw new Error('会话数据不完整。');
    if (
      session.messages.some(
        (message) =>
          !['user', 'assistant'].includes(message.role) ||
          typeof message.content !== 'string' ||
          message.content.length > messageCharacters,
      )
    )
      throw new Error('消息数据不完整。');
  }
  const ids = new Set(data.sessions.map((session) => session.id));
  if (ids.size !== data.sessions.length) throw new Error('会话标识重复。');
  if (data.questionBatches !== undefined) {
    if (!Array.isArray(data.questionBatches)) throw new Error('本地题库格式不正确。');
    const batchIds = new Set();
    for (const batch of data.questionBatches) {
      validateGeneration(batch);
      if (batch.preferences !== undefined) {
        interviewPreferences.validateSnapshot(batch.preferences);
      }
      if (
        typeof batch.id !== 'string' ||
        !batch.id ||
        batchIds.has(batch.id) ||
        typeof batch.createdAt !== 'string' ||
        typeof batch.resume !== 'string' ||
        batch.resume.length > stringLimits.resume
      ) {
        throw new Error('本地题库批次数据不完整。');
      }
      batchIds.add(batch.id);
    }
  }
  return data;
}

class Store {
  constructor(directory, encryption) {
    this.directory = directory;
    this.encryption = encryption;
    this.file = path.join(directory, 'workspace.json');
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        this.data = validateSaved(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      } catch {
        throw new Error(
          '本地数据文件无法读取。请先备份 ' + this.file + '，修复或移走该文件后重启。',
        );
      }
      this.data.settings = { ...defaults, ...this.data.settings };
      for (const key of opacityKeys) {
        const value = this.data.settings[key];
        if (!Number.isInteger(value) || value < 0 || value > 100)
          this.data.settings[key] = defaults[key];
      }
      const fontSize = this.data.settings.transparentFontSize;
      if (!Number.isInteger(fontSize) || fontSize < 12 || fontSize > 32)
        this.data.settings.transparentFontSize = defaults.transparentFontSize;
      // Credentials are only read from the encrypted vault, never settings.
      delete this.data.settings.apiKey;
      delete this.data.settings.transcriptionApiKey;
      try {
        modelProfiles.initializeModelProfiles(this.data);
      } catch {
        throw new Error(
          '本地模型配置无法读取。请先备份 ' + this.file + '，修复或移走该文件后重启。',
        );
      }
    } else {
      const first = newSession();
      this.data = {
        version: 1,
        settings: { ...defaults },
        vault: {},
        sessions: [first],
        questionBatches: [],
        activeSessionId: first.id,
      };
      modelProfiles.initializeModelProfiles(this.data);
      this.persist(this.data);
    }
    // Legacy workspaces gain an empty library in memory without a startup rewrite.
    this.data.questionBatches ||= [];
    if (!this.data.sessions.some((session) => session.id === this.data.activeSessionId)) {
      if (!this.data.sessions.length) this.data.sessions.push(newSession());
      this.data.activeSessionId = this.data.sessions[0].id;
    }
  }

  persist(next) {
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } catch {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      throw new Error('无法保存本地数据。请检查磁盘空间和文件夹写入权限。');
    }
    this.data = next;
  }

  snapshot() {
    const state = clone(this.data);
    delete state.vault;
    state.modelProfiles = modelProfiles.modelProfileSnapshot(this.data);
    state.settings.hasApiKey = Boolean(this.data.vault?.apiKey);
    state.settings.hasTranscriptionApiKey = Boolean(this.data.vault?.transcriptionApiKey);
    return state;
  }

  settings() {
    return clone(this.data.settings);
  }

  credential(name = 'apiKey') {
    const encrypted = this.data.vault?.[name];
    if (!encrypted) return '';
    try {
      return this.encryption.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      throw new Error('无法解密保存的 API Key，请在设置中重新填写并保存。');
    }
  }

  saveSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error('设置参数无效。');
    interviewPreferences.validatePatch(patch);
    const next = clone(this.data);
    for (const [key, max] of Object.entries(stringLimits)) {
      if (Object.hasOwn(patch, key)) {
        if (typeof patch[key] !== 'string' || patch[key].length > max)
          throw new Error('设置字段过长或格式无效：' + key);
        next.settings[key] = patch[key].trim();
      }
    }
    if (!next.settings.baseUrl || !next.settings.model)
      throw new Error('请填写 API 地址和模型名称。');
    for (const key of ['alwaysOnTop', 'contentProtection', 'demoMode']) {
      if (Object.hasOwn(patch, key)) {
        if (typeof patch[key] !== 'boolean') throw new Error('设置选项格式无效。');
        next.settings[key] = patch[key];
      }
    }
    for (const key of opacityKeys) {
      if (Object.hasOwn(patch, key)) {
        if (!Number.isInteger(patch[key]) || patch[key] < 0 || patch[key] > 100)
          throw new Error('透明度必须是 0 到 100 的整数。');
        next.settings[key] = patch[key];
      }
    }
    if (Object.hasOwn(patch, 'transparentFontSize')) {
      const fontSize = patch.transparentFontSize;
      if (!Number.isInteger(fontSize) || fontSize < 12 || fontSize > 32)
        throw new Error('字体大小必须是 12 到 32 的整数。');
      next.settings.transparentFontSize = fontSize;
    }
    if (Object.hasOwn(patch, 'answerStyle')) {
      if (!['concise', 'detailed'].includes(patch.answerStyle)) throw new Error('回答风格无效。');
      next.settings.answerStyle = patch.answerStyle;
    }
    for (const key of ['experienceLevel', 'interviewType', 'interviewDifficulty']) {
      if (Object.hasOwn(patch, key)) next.settings[key] = patch[key];
    }
    next.vault ||= {};
    for (const key of ['apiKey', 'transcriptionApiKey']) {
      if (patch['clear' + key[0].toUpperCase() + key.slice(1)] === true) delete next.vault[key];
      if (Object.hasOwn(patch, key) && patch[key] !== '') {
        if (typeof patch[key] !== 'string' || patch[key].length > 2048)
          throw new Error('API Key 格式无效。');
        const secret = patch[key].trim();
        if (secret) {
          if (!this.encryption.isEncryptionAvailable())
            throw new Error('系统加密服务当前不可用，无法保存 API Key。');
          next.vault[key] = this.encryption.encryptString(secret).toString('base64');
        }
      }
    }
    modelProfiles.syncActiveModelProfile(next);
    this.persist(next);
    return this.snapshot();
  }

  saveModelProfile(input) {
    const next = clone(this.data);
    modelProfiles.saveModelProfile(next, input, this.encryption);
    this.persist(next);
    return this.snapshot();
  }

  modelConnection(id = this.data.activeModelProfileId) {
    const profile = this.data.modelProfiles.find((item) => item.id === id);
    if (!profile) throw new Error('没有找到这条模型配置。');
    const encrypted = this.data.vault.modelProfiles[profile.id];
    let apiKey = '';
    if (encrypted) {
      try {
        apiKey = this.encryption.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        throw new Error('无法解密保存的 API Key，请在设置中重新填写并保存。');
      }
    }
    return {
      settings: {
        ...this.settings(),
        baseUrl: profile.baseUrl,
        model: profile.model,
        demoMode: profile.demoMode,
      },
      apiKey,
    };
  }

  enableModelProfile(id = this.data.activeModelProfileId) {
    const next = clone(this.data);
    const profile = next.modelProfiles.find((item) => item.id === id);
    if (!profile) throw new Error('没有找到这条模型配置。');
    profile.demoMode = false;
    if (profile.id === next.activeModelProfileId) next.settings.demoMode = false;
    this.persist(next);
    return this.snapshot();
  }

  selectModelProfile(id) {
    const next = clone(this.data);
    modelProfiles.selectModelProfile(next, id);
    this.persist(next);
    return this.snapshot();
  }

  deleteModelProfile(id) {
    const next = clone(this.data);
    modelProfiles.deleteModelProfile(next, id);
    this.persist(next);
    return this.snapshot();
  }

  createSession(options = {}) {
    if (this.data.sessions.length >= 100)
      throw new Error('已达到 100 个会话，请先导出并删除一些旧记录。');
    const session = newSession(options.mode || 'interview', options.title);
    const next = clone(this.data);
    next.sessions.unshift(session);
    next.activeSessionId = session.id;
    this.persist(next);
    return this.snapshot();
  }

  session(id) {
    const session = this.data.sessions.find((item) => item.id === id);
    if (!session) throw new Error('没有找到这条会话。');
    return clone(session);
  }

  switchSession(id) {
    this.session(id);
    const next = clone(this.data);
    next.activeSessionId = id;
    this.persist(next);
    return this.snapshot();
  }

  deleteSession(id) {
    this.session(id);
    const next = clone(this.data);
    next.sessions = next.sessions.filter((session) => session.id !== id);
    if (!next.sessions.length) next.sessions.push(newSession());
    if (next.activeSessionId === id) next.activeSessionId = next.sessions[0].id;
    this.persist(next);
    return this.snapshot();
  }

  clearSession(id) {
    const current = this.session(id);
    if (current.mode === 'mock' || current.practice !== undefined)
      throw new Error('此快捷键只清空面试助手聊天，模拟面试记录会保留。');
    const next = clone(this.data);
    const session = next.sessions.find((item) => item.id === id);
    session.messages = [];
    session.title = session.mode === 'coding' ? '截图解题' : '新的面试';
    session.updatedAt = new Date().toISOString();
    this.persist(next);
    return this.snapshot();
  }

  clearSessions() {
    const session = newSession();
    const next = clone(this.data);
    next.sessions = [session];
    next.activeSessionId = session.id;

    // Delete known old copies before replacing the live file. If either step
    // fails, never report success or replace the in-memory conversation state.
    removeWorkspaceCopies(this.directory);
    this.persist(next);
    return this.snapshot();
  }

  createPractice(result) {
    validateGeneration(result);
    if (!this.data.settings.resume.trim()) throw new Error('请先上传并保存简历。');
    if (this.data.sessions.length >= 100) {
      throw new Error('已达到 100 个会话，请先导出并删除一些旧记录。');
    }
    const session = newSession('mock', `简历模拟面试 · ${new Date().toLocaleDateString('zh-CN')}`);
    session.practice = {
      questions: clone(result.questions),
      reviews: [],
      status: result.questions.length ? 'active' : 'unparsed',
      rawQuestions: result.raw,
      model: result.model,
      resume: this.data.settings.resume,
      role: this.data.settings.role,
      preferences: interviewPreferences.snapshot(this.data.settings),
      generations: [generationBatch(result, session.createdAt)],
    };
    const next = clone(this.data);
    next.sessions.unshift(session);
    next.activeSessionId = session.id;
    this.persist(next);
    return session.id;
  }

  appendPracticeQuestions(id, result) {
    validateGeneration(result);
    const next = clone(this.data);
    const session = next.sessions.find((item) => item.id === id);
    if (!session?.practice) throw new Error('没有找到这轮简历模拟面试。');
    const practice = session.practice;
    const createdAt = new Date().toISOString();

    if (practice.generations === undefined) {
      const originalCreatedAt = Number.isFinite(Date.parse(session.createdAt))
        ? session.createdAt
        : createdAt;
      practice.generations = [
        generationBatch(
          { questions: practice.questions, raw: practice.rawQuestions, model: practice.model },
          originalCreatedAt,
        ),
      ];
    }
    practice.generations.push(generationBatch(result, createdAt));
    practice.questions.push(...clone(result.questions));
    if (result.questions.length) {
      practice.status = 'active';
      delete practice.completedAt;
    }
    // Reject collisions or inconsistent progress before either the live state
    // or its saved file can change. Every batch keeps its own complete reply.
    validatePractice(practice);
    session.updatedAt = createdAt;
    this.persist(next);
    return this.snapshot();
  }

  appendPracticeReview(id, answer, result) {
    validateReview({ ...result, answer });
    const next = clone(this.data);
    const session = next.sessions.find((item) => item.id === id);
    if (!session?.practice) throw new Error('没有找到这轮简历模拟面试。');
    const practice = session.practice;
    const question = practice.questions[practice.reviews.length];
    if (practice.status !== 'active' || !question) throw new Error('这轮模拟面试已经结束。');
    const createdAt = new Date().toISOString();
    practice.reviews.push({
      questionId: question.id,
      answer,
      content: result.content,
      score: result.score,
      raw: result.raw,
      model: result.model,
      createdAt,
    });
    const score = result.score === null ? '模型未提供分数' : `${result.score} / 100`;
    session.messages.push(
      {
        id: randomUUID(),
        role: 'user',
        content: `面试题：${question.title}\n\n我的回答：\n${answer}`,
        source: 'text',
        createdAt,
      },
      {
        id: randomUUID(),
        role: 'assistant',
        content: `评分：${score}\n\n${result.content}`,
        demo: false,
        createdAt,
      },
    );
    if (practice.reviews.length === practice.questions.length) {
      practice.status = 'completed';
      practice.completedAt = createdAt;
    }
    session.updatedAt = createdAt;
    this.persist(next);
    return this.snapshot();
  }

  appendQuestionBatch(result) {
    validateGeneration(result);
    if (!this.data.settings.resume.trim()) throw new Error('请先上传并保存简历。');
    const next = clone(this.data);
    next.questionBatches.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      questions: clone(result.questions),
      raw: result.raw,
      model: result.model,
      resume: this.data.settings.resume,
      preferences: interviewPreferences.snapshot(this.data.settings),
    });
    this.persist(next);
    return this.snapshot();
  }

  appendAnswer(id, question, response, source) {
    const next = clone(this.data);
    const session = next.sessions.find((item) => item.id === id);
    if (!session) throw new Error('会话已被删除，回答未写入。');
    if (session.practice) throw new Error('这轮模拟面试需要逐题提交回答并评分。');
    if (session.messages.length >= 198) throw new Error('当前会话已满，请新建会话继续。');
    const createdAt = new Date().toISOString();
    session.messages.push(
      { id: randomUUID(), role: 'user', content: question, source, createdAt },
      {
        id: randomUUID(),
        role: 'assistant',
        content: response.content,
        demo: response.demo === true,
        ...(response.answerFormat === 'numbered-only' ? { answerFormat: 'numbered-only' } : {}),
        createdAt,
      },
    );
    if (
      session.messages.length === 2 &&
      ['新的面试', '截图解题', '模拟面试练习'].includes(session.title)
    )
      session.title = question.slice(0, 32);
    session.updatedAt = createdAt;
    this.persist(next);
    return this.snapshot();
  }
}

module.exports = { Store, defaults };
