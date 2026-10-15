'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
const practice = require('../src/services/practice.cjs');

const work = path.resolve(__dirname, '../work');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().slice(10),
};
const preferences = {
  experienceLevel: 'senior',
  targetCompany: '追加测试公司',
  jobDescription: '负责订单系统、状态管理与缓存方案。',
  interviewType: 'project',
  interviewDifficulty: 'challenging',
  focusAreas: 'Vue 状态管理与缓存一致性',
  improvementGoals: '清楚说明个人贡献和技术取舍',
  additionalRequirements: '围绕真实订单项目，不编造指标。',
};

function temporary(t) {
  fs.mkdirSync(work, { recursive: true });
  const directory = fs.mkdtempSync(path.join(work, 'practice-append-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(work + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}

function question(id) {
  return {
    id,
    title: `如何验证订单项目中的 ${id} 方案？`,
    topic: '真实项目取舍',
    category: 'frontend',
    level: '深入',
    description: '核实简历中的实际职责。',
    tags: ['Vue', '订单项目'],
  };
}

function generation(prefix, count = 2) {
  return {
    questions: Array.from({ length: count }, (_, index) => question(`${prefix}-${index + 1}`)),
    raw: `  ${prefix} 模型生成的完整原文\n`,
    model: `model-${prefix}`,
  };
}

function review(score = 86) {
  return {
    score,
    content: '职责表达清楚，建议补充真实验证方法。',
    raw: `{"score":${score},"content":"职责表达清楚，建议补充真实验证方法。"}`,
    model: 'review-model',
  };
}

function prepared(t) {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({
    resume: '原始测试简历：负责订单项目的 Vue 页面与缓存方案。',
    role: '高级全栈工程师',
    language: '简体中文',
    answerStyle: 'detailed',
    apiKey: 'isolated-append-key',
    ...preferences,
  });
  return store;
}

function unchanged(store, operation, pattern) {
  const snapshot = store.snapshot();
  const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(operation, pattern);
  assert.deepEqual(store.snapshot(), snapshot);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.equal(fs.existsSync(store.file + '.tmp'), false);
}

test('completed interviews reopen on append without replacing any questions, scores, or snapshots', (t) => {
  let store = prepared(t);
  const first = generation('first');
  const id = store.createPractice(first);
  store.appendPracticeReview(id, '第一道题的真实回答。', review(81));
  store.appendPracticeReview(id, '第二道题的真实回答。', review(92));
  const completed = store.session(id);
  assert.equal(completed.practice.status, 'completed');
  assert.equal(completed.practice.generations.length, 1);
  assert.deepEqual(
    completed.practice.generations[0].questionIds,
    first.questions.map((item) => item.id),
  );

  store.saveSettings({
    resume: '后来替换的简历',
    role: '新的岗位',
    targetCompany: '新的公司',
    focusAreas: '新的重点',
  });
  const second = generation('second');
  const state = store.appendPracticeQuestions(id, second);
  const appended = state.sessions.find((session) => session.id === id);
  assert.equal(state.activeSessionId, id);
  assert.equal(appended.id, completed.id);
  assert.equal(appended.title, completed.title);
  assert.equal(appended.createdAt, completed.createdAt);
  assert.deepEqual(appended.messages, completed.messages);
  assert.deepEqual(appended.practice.questions, [...first.questions, ...second.questions]);
  assert.deepEqual(appended.practice.reviews, completed.practice.reviews);
  assert.equal(appended.practice.status, 'active');
  assert.equal(appended.practice.completedAt, undefined);
  for (const key of ['resume', 'role', 'preferences', 'rawQuestions', 'model']) {
    assert.deepEqual(appended.practice[key], completed.practice[key]);
  }
  assert.equal(appended.practice.generations.length, 2);
  assert.equal(appended.practice.generations[1].raw, second.raw);
  assert.equal(appended.practice.generations[1].model, second.model);
  assert.notEqual(appended.practice.generations[0].id, appended.practice.generations[1].id);

  second.questions[0].title = '外部修改不应进入本地数据';
  appended.practice.generations[0].raw = '快照修改不应进入本地数据';
  store = new Store(store.directory, encryption);
  assert.equal(store.session(id).practice.generations[0].raw, first.raw);
  assert.equal(store.session(id).practice.questions[2].id, 'second-1');
  assert.notEqual(store.session(id).practice.questions[2].title, second.questions[0].title);
  store.appendPracticeReview(id, '追加第一题的真实回答。', review(88));
  store.appendPracticeReview(id, '追加第二题的真实回答。', review(93));
  store = new Store(store.directory, encryption);
  const finished = store.session(id);
  assert.equal(finished.practice.status, 'completed');
  assert.ok(finished.practice.completedAt);
  assert.deepEqual(
    finished.practice.reviews.map((item) => item.questionId),
    finished.practice.questions.map((item) => item.id),
  );
  assert.deepEqual(
    finished.practice.reviews.map((item) => item.score),
    [81, 92, 88, 93],
  );
  assert.deepEqual(finished.messages.slice(0, 4), completed.messages);
  assert.equal(store.credential(), 'isolated-append-key');
});

test('appending in the middle preserves the next unanswered question and every later question', (t) => {
  const store = prepared(t);
  const first = generation('current', 3);
  const id = store.createPractice(first);
  store.appendPracticeReview(id, '第一题回答', review());
  const original = store.session(id);
  store.saveSettings({ resume: '' });
  store.appendPracticeQuestions(id, generation('additional', 3));
  const session = new Store(store.directory, encryption).session(id);
  assert.equal(session.practice.status, 'active');
  assert.equal(session.practice.questions.length, 6);
  assert.equal(session.practice.reviews.length, 1);
  assert.equal(session.practice.questions[session.practice.reviews.length].id, 'current-2');
  assert.deepEqual(session.practice.questions.slice(0, 3), original.practice.questions);
  assert.deepEqual(session.practice.reviews, original.practice.reviews);
  assert.deepEqual(session.messages, original.messages);
  assert.equal(session.practice.resume, original.practice.resume);
});

test('every unparsed reply remains a separate batch and never resets active or completed progress', (t) => {
  let store = prepared(t);
  const id = store.createPractice(generation('unparsed-initial', 0));
  store.appendPracticeQuestions(id, generation('unparsed-again', 0));
  assert.equal(store.session(id).practice.status, 'unparsed');
  assert.equal(store.session(id).practice.generations.length, 2);
  store.appendPracticeQuestions(id, generation('usable', 1));
  assert.equal(store.session(id).practice.status, 'active');
  store.appendPracticeQuestions(id, generation('active-unparsed', 0));
  assert.equal(store.session(id).practice.status, 'active');
  store.appendPracticeReview(id, '唯一题目的真实回答。', review());
  const completed = store.session(id);
  store.appendPracticeQuestions(id, generation('completed-unparsed', 0));
  store = new Store(store.directory, encryption);
  const saved = store.session(id);
  assert.equal(saved.practice.status, 'completed');
  assert.equal(saved.practice.completedAt, completed.practice.completedAt);
  assert.deepEqual(saved.practice.reviews, completed.practice.reviews);
  assert.deepEqual(saved.messages, completed.messages);
  assert.equal(saved.practice.rawQuestions, generation('unparsed-initial', 0).raw);
  assert.equal(saved.practice.generations.length, 5);
  assert.deepEqual(saved.practice.generations[4].questionIds, []);
  assert.equal(saved.practice.generations[4].raw, generation('completed-unparsed', 0).raw);
});

test('legacy interview batches migrate only when explicitly appending, with original content intact', (t) => {
  const original = prepared(t);
  const first = generation('legacy');
  const id = original.createPractice(first);
  original.appendPracticeReview(id, '旧回答', review(79));
  const legacy = JSON.parse(fs.readFileSync(original.file, 'utf8'));
  delete legacy.sessions.find((session) => session.id === id).practice.generations;
  const serialized = JSON.stringify(legacy);
  fs.writeFileSync(original.file, serialized);

  const reopened = new Store(original.directory, encryption);
  assert.equal(reopened.session(id).practice.generations, undefined);
  assert.equal(fs.readFileSync(original.file, 'utf8'), serialized);
  reopened.appendPracticeQuestions(id, generation('after-legacy', 1));
  const session = new Store(original.directory, encryption).session(id);
  assert.equal(session.practice.generations.length, 2);
  assert.equal(session.practice.generations[0].raw, first.raw);
  assert.equal(session.practice.generations[0].createdAt, session.createdAt);
  assert.equal(session.practice.generations[0].model, first.model);
  assert.deepEqual(session.practice.generations[0].questionIds, ['legacy-1', 'legacy-2']);
  assert.equal(session.practice.rawQuestions, first.raw);
  assert.equal(session.practice.reviews[0].score, 79);
  assert.equal(session.practice.questions[session.practice.reviews.length].id, 'legacy-2');
});

test('malformed appends reject atomically before changing the saved interview or vault', (t) => {
  const store = prepared(t);
  const id = store.createPractice(generation('initial'));
  const duplicate = generation('duplicate');
  duplicate.questions[0].id = 'initial-1';
  const invalidResults = [
    duplicate,
    { ...generation('empty'), raw: '' },
    { ...generation('oversized'), raw: 'x'.repeat(512 * 1024 + 1) },
    { ...generation('bad-model'), model: 'm'.repeat(201) },
    { ...generation('duplicate-ids'), questions: [question('same'), question('same')] },
    { ...generation('bad-title'), questions: [{ ...question('bad'), title: '' }] },
    { ...generation('bad-tags'), questions: [{ ...question('bad'), tags: null }] },
  ];
  for (const result of invalidResults) {
    unchanged(store, () => store.appendPracticeQuestions(id, result));
  }
  unchanged(store, () => store.appendPracticeQuestions('unknown-interview', generation('valid')));
  const ordinaryId = store.createSession().activeSessionId;
  unchanged(store, () => store.appendPracticeQuestions(ordinaryId, generation('valid')));
  assert.equal(store.credential(), 'isolated-append-key');
});

test('invalid saved generation order, coverage, identifiers, or raw data cannot reopen silently', (t) => {
  const store = prepared(t);
  const id = store.createPractice(generation('initial'));
  store.appendPracticeQuestions(id, generation('appended'));
  const valid = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const changes = [
    (value) => {
      value.generations = [];
    },
    (value) => {
      value.generations[1].id = value.generations[0].id;
    },
    (value) => {
      value.generations[1].createdAt = 'invalid-date';
    },
    (value) => {
      value.generations[1].raw = '';
    },
    (value) => {
      value.generations[1].raw = 'x'.repeat(512 * 1024 + 1);
    },
    (value) => {
      value.generations[0].questionIds.reverse();
    },
    (value) => {
      value.generations[1].questionIds.pop();
    },
    (value) => {
      value.generations[1].questionIds[0] = 'initial-1';
    },
    (value) => {
      value.generations[0].raw = '不是最初原文';
    },
    (value) => {
      value.generations[0].model = '不是最初模型';
    },
  ];
  for (const change of changes) {
    const invalid = structuredClone(valid);
    change(invalid.sessions.find((session) => session.id === id).practice);
    const serialized = JSON.stringify(invalid);
    fs.writeFileSync(store.file, serialized);
    assert.throws(() => new Store(store.directory, encryption), /本地数据文件无法读取/);
    assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
  }
  fs.writeFileSync(store.file, JSON.stringify(valid));
  assert.equal(new Store(store.directory, encryption).session(id).practice.questions.length, 4);
});

test('each complete bounded raw reply survives even when cumulative batches exceed one reply limit', (t) => {
  const store = prepared(t);
  const first = { ...generation('long-first', 1), raw: '初'.repeat(512 * 1024) };
  const second = { ...generation('long-second', 1), raw: '续'.repeat(512 * 1024) };
  const id = store.createPractice(first);
  store.appendPracticeQuestions(id, second);
  const saved = new Store(store.directory, encryption).session(id).practice;
  assert.equal(saved.rawQuestions, first.raw);
  assert.equal(saved.generations[0].raw, first.raw);
  assert.equal(saved.generations[1].raw, second.raw);
  assert.equal(saved.questions.length, 2);
});

test('user-requested batches accumulate beyond 200 questions and reviews without truncation', (t) => {
  let store = prepared(t);
  const id = store.createPractice(generation('first', 1));
  for (let index = 0; index < 26; index += 1) {
    store.appendPracticeQuestions(id, generation(`batch-${index}`, 8));
  }
  assert.equal(store.session(id).practice.questions.length, 209);
  assert.equal(store.session(id).practice.generations.length, 27);
  for (let index = 0; index < 209; index += 1) {
    store.appendPracticeReview(id, `第 ${index + 1} 题的真实回答。`, review(index % 101));
  }
  store = new Store(store.directory, encryption);
  const saved = store.session(id);
  assert.equal(saved.practice.questions.length, 209);
  assert.equal(saved.practice.reviews.length, 209);
  assert.equal(saved.messages.length, 418);
  assert.equal(saved.practice.generations.length, 27);
  assert.equal(saved.practice.questions[0].id, 'first-1');
  assert.equal(saved.practice.questions.at(-1).id, 'batch-25-8');
  assert.equal(saved.practice.status, 'completed');
});

test('append generation sends resume, detailed preferences, and avoidance context in one explicit request', async (t) => {
  const requests = [];
  const raw = '{"questions":[{"title":"订单项目中如何验证缓存一致性？"}]}';
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: raw } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  let store = prepared(t);
  store.saveSettings({
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    model: 'local-append-model',
    demoMode: false,
  });
  const id = store.createPractice(generation('saved', 1));
  store = new Store(store.directory, encryption);
  store.snapshot();
  store.session(id);
  assert.equal(requests.length, 0, 'loading saved questions never requests generation');
  const result = await practice.generateQuestions({
    settings: store.settings(),
    apiKey: store.credential(),
    kind: 'mock',
    purpose: 'append',
    count: 3,
    previousTitles: ['本轮已经生成的项目题', '题库已经保存的状态管理题'],
  });
  store.appendPracticeQuestions(id, result);
  store = new Store(store.directory, encryption);
  assert.equal(requests.length, 1, 'persisting or reopening must never generate another batch');
  const [system, prompt] = requests[0].messages;
  assert.match(system.content, /原始测试简历：负责订单项目的 Vue 页面与缓存方案/);
  assert.match(system.content, /高级全栈工程师/);
  assert.match(system.content, /经验阶段：高级/);
  assert.match(system.content, /面试类型：项目深挖/);
  assert.match(system.content, /题目难度：挑战/);
  assert.match(system.content, /回答风格：详细/);
  for (const value of Object.values(preferences).filter((value) =>
    /[\u3400-\u9fff]/u.test(value),
  )) {
    assert.ok(system.content.includes(value));
  }
  assert.match(prompt.content, /为当前面试追加问题/);
  assert.doesNotMatch(prompt.content, /生成一整轮/);
  assert.match(prompt.content, /3 个不同问题/);
  assert.match(prompt.content, /本轮已经生成的项目题/);
  assert.match(prompt.content, /题库已经保存的状态管理题/);
  assert.match(prompt.content, /不要生成任何后续轮次/);
  assert.equal(store.session(id).practice.generations[1].raw, raw);
  assert.equal(store.session(id).practice.questions.length, 2);
  for (const options of [{ purpose: 'unknown' }, { purpose: 'append', kind: 'library' }]) {
    await assert.rejects(
      practice.generateQuestions({
        settings: store.settings(),
        apiKey: store.credential(),
        kind: 'mock',
        ...options,
      }),
      /用途无效|仅模拟面试/,
    );
  }
  assert.equal(requests.length, 1);
});
