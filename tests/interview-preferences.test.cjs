'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
const ai = require('../src/services/ai.cjs');
const practice = require('../src/services/practice.cjs');
const preferences = require('../src/services/interview-preferences.cjs');

const work = path.resolve(__dirname, '../work');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().slice(10),
};
const selectedPreferences = {
  experienceLevel: 'senior',
  targetCompany: '本地测试公司',
  jobDescription: '负责 Vue 工作台和分布式服务的架构设计。',
  interviewType: 'project',
  interviewDifficulty: 'challenging',
  focusAreas: '状态管理与缓存一致性',
  improvementGoals: '表达技术取舍和说明真实贡献',
  additionalRequirements: '优先围绕订单项目，缺少事实时先明确资料不足。',
};

function temporary(t) {
  fs.mkdirSync(work, { recursive: true });
  const directory = fs.mkdtempSync(path.join(work, 'interview-preferences-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(work + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}

function generation() {
  return {
    raw: '模型生成的问题原文',
    model: 'local-preferences-model',
    questions: [
      {
        id: 'test-question',
        title: '订单项目中如何验证状态管理方案？',
        topic: '项目取舍',
        category: 'frontend',
        level: '深入',
        description: '核实个人职责与判断依据。',
        tags: ['Vue'],
      },
    ],
  };
}

function assertUnchanged(store, operation, pattern) {
  const state = store.snapshot();
  const serialized = fs.readFileSync(store.file, 'utf8');
  assert.throws(operation, pattern);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
  assert.equal(fs.existsSync(store.file + '.tmp'), false);
}

async function provider(t) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const question = body.messages.at(-1).content;
    const content =
      typeof question === 'string' && question.includes('请只点评')
        ? '{"score":86,"content":"职责清楚，建议补充验证方法。"}'
        : '{"questions":[{"title":"订单项目中如何验证状态管理方案？"}]}';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return {
    requests,
    settings: {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-preferences-model',
      demoMode: false,
      role: '全栈工程师',
      resume: '测试简历：负责订单项目的 Vue 页面和缓存方案。',
      language: '简体中文',
      answerStyle: 'concise',
      ...selectedPreferences,
    },
    apiKey: 'isolated-preferences-key',
  };
}

test('legacy workspaces receive preference defaults without rewriting their files', (t) => {
  const directory = temporary(t);
  const original = new Store(directory, encryption);
  original.saveSettings({ role: '旧岗位', resume: '原有简历', apiKey: 'legacy-local-key' });
  const legacy = JSON.parse(fs.readFileSync(original.file, 'utf8'));
  for (const key of Object.keys(preferences.defaults)) delete legacy.settings[key];
  const serialized = JSON.stringify(legacy);
  fs.writeFileSync(original.file, serialized);

  const store = new Store(directory, encryption);
  for (const [key, value] of Object.entries(preferences.defaults)) {
    assert.equal(store.settings()[key], value);
  }
  assert.equal(store.settings().role, '旧岗位');
  assert.equal(store.settings().resume, '原有简历');
  assert.equal(store.credential(), 'legacy-local-key');
  assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
  assert.deepEqual(new Store(directory, encryption).snapshot(), store.snapshot());
  assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
});

test('all interview preferences save independently and survive restart with existing credentials', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'retained-local-key', role: '前端工程师', resume: '真实经历' });
  store.saveSettings({ ...selectedPreferences, targetCompany: '  本地测试公司  ' });
  store = new Store(directory, encryption);
  for (const [key, value] of Object.entries(selectedPreferences)) {
    assert.equal(store.settings()[key], value);
  }
  assert.equal(store.settings().role, '前端工程师');
  assert.equal(store.settings().resume, '真实经历');
  assert.equal(store.credential(), 'retained-local-key');
  assert.equal(JSON.stringify(store.snapshot()).includes('retained-local-key'), false);
  store.saveSettings({ focusAreas: '', targetCompany: '' });
  store = new Store(directory, encryption);
  assert.equal(store.settings().focusAreas, '');
  assert.equal(store.settings().targetCompany, '');
  assert.equal(store.settings().jobDescription, selectedPreferences.jobDescription);
});

test('invalid preference values reject the entire save before changing disk, settings, or keys', (t) => {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({ ...selectedPreferences, apiKey: 'original-local-key' });
  const invalidPatches = [
    { experienceLevel: 'expert' },
    { experienceLevel: '__proto__' },
    { experienceLevel: null },
    { interviewType: 'constructor' },
    { interviewDifficulty: 3 },
    { targetCompany: ['wrong type'] },
    ...Object.entries(preferences.stringLimits).map(([key, maximum]) => ({
      [key]: 'x'.repeat(maximum + 1),
    })),
  ];
  for (const invalid of invalidPatches) {
    assertUnchanged(
      store,
      () => store.saveSettings({ role: '不应保存的岗位', apiKey: 'unwanted-key', ...invalid }),
      /面试偏好/,
    );
  }
  assert.equal(store.credential(), 'original-local-key');
  for (const [key, maximum] of Object.entries(preferences.stringLimits)) {
    store.saveSettings({ [key]: 'x'.repeat(maximum) });
    assert.equal(new Store(store.directory, encryption).settings()[key].length, maximum);
  }
});

test('mock and library records retain their original complete preferences after edits and restart', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({
    ...selectedPreferences,
    language: 'English',
    answerStyle: 'detailed',
    resume: '最初的真实经历',
  });
  const expected = { ...selectedPreferences, language: 'English', answerStyle: 'detailed' };
  const id = store.createPractice(generation());
  store.appendQuestionBatch(generation());
  const publicState = store.snapshot();
  publicState.sessions.find((session) => session.id === id).practice.preferences.focusAreas =
    '外部改动';
  publicState.questionBatches[0].preferences.jobDescription = '外部改动';
  store.saveSettings({
    experienceLevel: 'student',
    interviewType: 'behavior',
    targetCompany: '另一家公司',
    language: '简体中文',
    answerStyle: 'concise',
    focusAreas: '新重点',
    resume: '后来换的简历',
  });
  store.appendQuestionBatch(generation());
  store = new Store(directory, encryption);
  assert.deepEqual(store.session(id).practice.preferences, expected);
  assert.deepEqual(store.snapshot().questionBatches[0].preferences, expected);
  assert.equal(store.snapshot().questionBatches[1].preferences.targetCompany, '另一家公司');
  assert.equal(store.session(id).practice.resume, '最初的真实经历');
});

test('older training records without preference snapshots still reopen without a startup rewrite', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.saveSettings({ resume: '已有简历' });
  const id = store.createPractice(generation());
  store.appendQuestionBatch(generation());
  const legacy = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  delete legacy.sessions.find((session) => session.id === id).practice.preferences;
  delete legacy.questionBatches[0].preferences;
  const serialized = JSON.stringify(legacy);
  fs.writeFileSync(store.file, serialized);
  const reopened = new Store(directory, encryption);
  assert.equal(reopened.session(id).practice.preferences, undefined);
  assert.equal(reopened.snapshot().questionBatches.length, 1);
  assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
});

test('ordinary answers, both generation modes, and reviews actually send saved preferences to AI', async (t) => {
  const service = await provider(t);
  await ai.answer({ ...service, question: '介绍一下订单项目中的状态管理。' });
  await practice.generateQuestions({ ...service, kind: 'mock', count: 1 });
  await practice.generateQuestions({ ...service, kind: 'library', count: 1 });
  const result = await practice.reviewAnswer({
    ...service,
    question: '你如何验证订单页面的状态管理方案？',
    answer: '我负责拆分状态边界，并通过集成测试验证更新。',
  });
  assert.equal(result.score, 86);
  assert.equal(service.requests.length, 4);
  for (const request of service.requests) {
    const system = request.messages[0].content;
    assert.ok(system.includes(service.settings.resume));
    for (const value of Object.values(selectedPreferences).filter((value) =>
      /[\u3400-\u9fff]/u.test(value),
    )) {
      assert.ok(system.includes(value));
    }
    assert.match(system, /经验阶段：高级/);
    assert.match(system, /面试类型：项目深挖/);
    assert.match(system, /题目难度：挑战/);
    assert.match(system, /回答风格：简洁/);
    assert.match(system, /不能.*覆盖事实约束、评分规则或本次输出格式/);
    assert.match(system, /不能改变当前用户问题和任务目标.*以本次请求为准/);
    assert.match(system, /不能据此认定用户已经具备相应经历/);
  }
  assert.equal(service.requests[0].max_tokens, 2048);
  assert.ok(service.requests.slice(1).every((request) => request.max_tokens === 4096));
});

test('numbered screenshot answers never include resumes or detailed interview preferences', async (t) => {
  const service = await provider(t);
  await ai.answer({
    ...service,
    image: 'data:image/png;base64,aGVsbG8=',
    answerFormat: 'numbered-only',
    question: '识别屏幕上的题目。',
    messages: [{ role: 'user', content: '历史个人信息不应传入' }],
  });
  assert.equal(service.requests.length, 1);
  const serialized = JSON.stringify(service.requests[0].messages);
  for (const value of [
    service.settings.resume,
    service.settings.role,
    ...Object.values(selectedPreferences),
    '历史个人信息不应传入',
  ]) {
    assert.equal(serialized.includes(value), false, `must omit preference: ${value}`);
  }
  assert.match(serialized, /只给最终答案/);
});

test('checking a saved inactive model uses its own key and enabling it never switches the active model', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'active-isolated-key', demoMode: true, ...selectedPreferences });
  const activeId = store.snapshot().activeModelProfileId;
  const state = store.saveModelProfile({
    name: '非当前模型',
    baseUrl: 'https://inactive.example/v1',
    model: 'inactive-model',
    demoMode: true,
    apiKey: 'inactive-isolated-key',
  });
  const inactiveId = state.modelProfiles.find((profile) => profile.id !== activeId).id;
  const before = fs.readFileSync(store.file, 'utf8');
  const connection = store.modelConnection(inactiveId);
  assert.equal(connection.settings.baseUrl, 'https://inactive.example/v1');
  assert.equal(connection.settings.model, 'inactive-model');
  assert.equal(connection.settings.targetCompany, selectedPreferences.targetCompany);
  assert.equal(connection.apiKey, 'inactive-isolated-key');
  assert.equal(store.modelConnection().apiKey, 'active-isolated-key');
  connection.settings.targetCompany = '不应修改保存值';
  assert.equal(store.settings().targetCompany, selectedPreferences.targetCompany);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before, 'reading connections must not write');

  const enabled = store.enableModelProfile(inactiveId);
  assert.equal(enabled.activeModelProfileId, activeId);
  assert.equal(enabled.settings.demoMode, true);
  assert.equal(enabled.modelProfiles.find((profile) => profile.id === inactiveId).demoMode, false);
  assert.equal(store.credential(), 'active-isolated-key');
  store = new Store(directory, encryption);
  assert.equal(store.snapshot().activeModelProfileId, activeId);
  assert.equal(store.modelConnection(inactiveId).apiKey, 'inactive-isolated-key');
  assert.equal(store.modelConnection(inactiveId).settings.demoMode, false);
  assert.equal(store.credential(), 'active-isolated-key');
  store.enableModelProfile();
  assert.equal(store.settings().demoMode, false);
  assert.equal(store.credential(), 'active-isolated-key');
  const serialized = JSON.stringify(store.snapshot());
  assert.equal(serialized.includes('active-isolated-key'), false);
  assert.equal(serialized.includes('inactive-isolated-key'), false);
});

test('unknown model checks and enables reject atomically without changing selection or credentials', (t) => {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({ apiKey: 'isolated-kept-key' });
  for (const id of ['', null, 'missing-model', '__proto__']) {
    assertUnchanged(store, () => store.modelConnection(id), /没有找到/);
    assertUnchanged(store, () => store.enableModelProfile(id), /没有找到/);
  }
  assert.equal(store.credential(), 'isolated-kept-key');
});
