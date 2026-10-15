'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const practice = require('../src/services/practice.cjs');
const { Store } = require('../src/store.cjs');

const work = path.resolve(__dirname, '../work');
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().slice(10),
};

function temporary(t) {
  fs.mkdirSync(work, { recursive: true });
  const directory = fs.mkdtempSync(path.join(work, 'practice-test-'));
  t.after(() => {
    if (directory.startsWith(work + path.sep)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  return directory;
}

function question(id, title = '为什么在真实项目中选择 Vue？') {
  return {
    id,
    title,
    category: 'frontend',
    topic: '项目技术选择',
    level: '深入',
    description: '核实简历中的个人贡献和取舍。',
    tags: ['Vue', '项目'],
  };
}

function generation(questions = [question('q-1'), question('q-2', '如何验证缓存一致性？')]) {
  return { questions, raw: '模型实际生成的完整题目原文', model: 'practice-test-model' };
}

function review(score = 85) {
  return {
    score,
    content: '结论清晰，建议补充验证方法。',
    raw: '{"score":85,"content":"结论清晰，建议补充验证方法。"}',
    model: 'practice-test-model',
  };
}

async function provider(t, replies) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    const content = replies[requests.length - 1] ?? '不应发生额外模型请求';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
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
      model: 'practice-test-model',
      resume: '测试简历：在订单项目中使用 Vue 与 Redis，负责页面及缓存方案。',
      role: '全栈工程师',
      demoMode: false,
    },
    apiKey: 'local-test-key',
  };
}

test('resume practice rejects missing resumes and demo mode instead of fabricating AI output', async () => {
  await assert.rejects(
    practice.generateQuestions({ settings: { demoMode: false }, kind: 'mock' }),
    /上传并保存简历/,
  );
  await assert.rejects(
    practice.generateQuestions({ settings: { resume: '简历', demoMode: true }, kind: 'library' }),
    /真实模型/,
  );
  await assert.rejects(
    practice.reviewAnswer({ settings: { resume: '简历', demoMode: true } }),
    /真实模型/,
  );
  const settings = { resume: '简历', demoMode: false };
  for (const count of [0, 21, 1.5, '5']) {
    await assert.rejects(practice.generateQuestions({ settings, kind: 'mock', count }), /1 到 20/);
  }
  await assert.rejects(practice.generateQuestions({ settings, kind: 'unknown' }), /类型无效/);
});

test('question generation uses saved resume and all recent avoidance hints in one real request', async (t) => {
  const raw = JSON.stringify({
    questions: [
      { title: '你的 Vue 页面如何划分职责？', topic: '组件', category: 'frontend', tags: ['Vue'] },
      { question: '缓存方案如何验证？', category: 'unrecognized', tags: 'Redis,一致性' },
    ],
  });
  const service = await provider(t, [raw]);
  const previousTitles = Array.from({ length: 201 }, (_, index) => `已保存第 ${index} 题`);
  const result = await practice.generateQuestions({
    ...service,
    kind: 'library',
    count: 2,
    previousTitles,
  });
  assert.equal(service.requests.length, 1);
  assert.equal(result.questions.length, 2);
  assert.notEqual(result.questions[0].id, result.questions[1].id);
  assert.equal(result.questions[1].category, 'general');
  assert.deepEqual(result.questions[1].tags, ['Redis', '一致性']);
  assert.equal(result.raw, raw);
  assert.equal(result.model, 'practice-test-model');
  const prompt = service.requests[0].messages;
  assert.equal(prompt.length, 2);
  assert.ok(prompt[0].content.includes(service.settings.resume));
  assert.match(prompt[0].content, /全栈工程师/);
  assert.match(prompt[0].content, /简历面试训练助手/);
  assert.match(prompt[0].content, /生成题目时不回答题目/);
  assert.doesNotMatch(prompt[0].content, /先给出可口述|解释充分|3–5 个要点/);
  assert.match(prompt[1].content, /不要编造经历/);
  assert.match(prompt[1].content, /2 个不同问题/);
  assert.match(prompt[1].content, /已保存第 1 题/);
  assert.match(prompt[1].content, /已保存第 200 题/);
  assert.doesNotMatch(prompt[1].content, /已保存第 0 题/);
});

test('JSON fences and Markdown numbered questions parse while unstructured output survives unchanged', async (t) => {
  const replies = [
    '这里是生成结果：\n```json\n{"questions":[{"title":"如何验证页面性能？"}]}\n```',
    '1. 你在订单项目中负责什么？\n围绕真实分工回答。\n\n2、缓存失效时如何处理？',
    '  当前资料不足，请补充项目的职责和技术细节。\n',
  ];
  const service = await provider(t, replies);
  const results = [];
  for (let index = 0; index < replies.length; index += 1) {
    results.push(await practice.generateQuestions({ ...service, kind: 'mock', count: 2 }));
  }
  assert.equal(results[0].questions.length, 1);
  assert.equal(results[1].questions.length, 2);
  assert.equal(results[1].questions[0].description, '围绕真实分工回答。');
  assert.deepEqual(results[2].questions, []);
  assert.equal(results[2].raw, replies[2]);
  assert.equal(service.requests.length, 3, 'never issue a hidden repair request');
});

test('reviews request a numeric score against resume facts and preserve imperfect model replies', async (t) => {
  const replies = [
    '{"score":87,"content":"优点：职责清晰。\\n建议：补充验证。"}',
    '评分：76 / 100\n\n说明完整，建议提供真实证据。',
    '模型未遵守格式，但这段原始回答必须展示。\n',
    '{"score":101,"feedback":"答案中缺少事实依据。"}',
  ];
  const service = await provider(t, replies);
  const results = [];
  for (const raw of replies) {
    const result = await practice.reviewAnswer({
      ...service,
      question: question('q-1'),
      answer: '我负责页面模块，通过性能采样验证方案。',
    });
    assert.equal(result.raw, raw);
    results.push(result);
  }
  assert.equal(results[0].score, 87);
  assert.match(results[0].content, /优点：职责清晰/);
  assert.equal(results[1].score, 76);
  assert.equal(results[2].score, null);
  assert.equal(results[2].content, replies[2]);
  assert.equal(results[3].score, null, 'out of range scores must not be fabricated or clamped');
  assert.match(results[3].content, /答案中缺少事实依据/);
  assert.equal(service.requests.length, 4);
  for (const request of service.requests) {
    assert.ok(request.messages[0].content.includes(service.settings.resume));
    assert.match(request.messages[0].content, /简历面试训练助手/);
    assert.match(request.messages[0].content, /0–100 评分/);
    assert.doesNotMatch(request.messages[0].content, /先给出可口述|下一道追问/);
    assert.match(request.messages[1].content, /0 到 100/);
    assert.match(request.messages[1].content, /必须提供 score/);
    assert.match(request.messages[1].content, /不要生成下一道题/);
  }
});

test('review scores accept only explicit hundred-point scales and never partial numeric matches', () => {
  const cases = [
    ['评分：8 / 10', null],
    ['评分：85 / 1000', null],
    ['评分：105', null],
    ['评分：85.5.2', null],
    ['评分：85.5/100', 85.5],
    ['评分：85分（满分100）', 85],
    ['评分：8分（满分10）', null],
    ['评分：85分 (满分 100 分)', 85],
    ['**评分：85.5/100**', 85.5],
    ['评分：**85/100**', 85],
    ['评分：0 / 100', 0],
    ['评分：100 / 100', 100],
    ['评分：85 / 100\n\n优点：表达清晰。', 85],
  ];
  for (const [raw, score] of cases) {
    const result = practice._internals.parseReview(raw);
    assert.equal(result.score, score, raw);
    assert.equal(result.content, raw, 'keep the original answer for every scoring format');
  }
  for (const [score, expected] of [
    ['8/10', null],
    ['85.5/100', 85.5],
    ['105', null],
  ]) {
    const result = practice._internals.parseReview(JSON.stringify({ score, content: '完整点评' }));
    assert.equal(result.score, expected);
    assert.equal(result.content, '完整点评');
  }
});

test('oversized reviews fail before network instead of silently cutting off the candidate answer', async (t) => {
  const service = await provider(t, []);
  await assert.rejects(
    practice.reviewAnswer({ ...service, question: '项目问题', answer: 'a'.repeat(10_001) }),
    /10000/,
  );
  await assert.rejects(
    practice.reviewAnswer({
      ...service,
      question: 'q'.repeat(2000),
      answer: 'a'.repeat(10_000),
    }),
    /合计内容过长/,
  );
  assert.equal(service.requests.length, 0);
});

test('partial and complete interview plans, reviews and original resume survive restarts', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({
    resume: '最初简历：Vue 订单项目',
    role: '前端工程师',
    apiKey: 'test-secret',
  });
  const id = store.createPractice(generation());
  assert.equal(store.snapshot().activeSessionId, id);
  store.appendPracticeReview(id, '说明技术选择的取舍。', review());
  store.saveSettings({ resume: '后来换成另一份简历', role: '后端工程师' });
  store = new Store(directory, encryption);
  let session = store.session(id);
  assert.equal(session.practice.status, 'active');
  assert.equal(session.practice.reviews.length, 1);
  assert.equal(session.practice.resume, '最初简历：Vue 订单项目');
  assert.equal(session.practice.role, '前端工程师');
  assert.equal(session.practice.reviews[0].score, 85);
  store.appendPracticeReview(id, '第二题真实回答。', review(null));
  store = new Store(directory, encryption);
  session = store.session(id);
  assert.equal(session.practice.status, 'completed');
  assert.ok(session.practice.completedAt);
  assert.equal(session.practice.reviews.length, 2);
  assert.equal(session.messages.length, 4);
  assert.match(session.messages[1].content, /评分：85 \/ 100/);
  assert.match(session.messages[3].content, /模型未提供分数/);
  assert.equal(session.practice.reviews[1].raw, review(null).raw);
  assert.match(session.title, /^简历模拟面试/);
  assert.throws(() => store.appendPracticeReview(id, '不该再答', review()), /已经结束/);
  assert.equal(JSON.stringify(store.snapshot()).includes('test-secret'), false);
});

test('library batches accumulate explicitly, retain all raw output, and survive clearing sessions', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ resume: '本地保存的简历' });
  const initial = generation([question('batch-q-1')]);
  store.appendQuestionBatch(initial);
  store.appendQuestionBatch({ questions: [], raw: '格式不符但必须保存的 AI 原文\n', model: 'm' });
  const id = store.createPractice(generation());
  store.appendPracticeReview(id, '真实回答', review());
  store = new Store(directory, encryption);
  assert.equal(store.snapshot().questionBatches.length, 2);
  assert.equal(store.snapshot().questionBatches[0].questions[0].title, initial.questions[0].title);
  assert.equal(store.snapshot().questionBatches[1].raw, '格式不符但必须保存的 AI 原文\n');
  const state = store.clearSessions();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].mode, 'interview');
  assert.equal(state.questionBatches.length, 2);
  store = new Store(directory, encryption);
  assert.equal(store.snapshot().questionBatches.length, 2);
  assert.equal(store.snapshot().settings.resume, '本地保存的简历');
  assert.equal(
    store.snapshot().sessions.some((session) => session.id === id),
    false,
  );
});

test('legacy data gains an empty local library without rewriting the file on startup', (t) => {
  const directory = temporary(t);
  new Store(directory, encryption);
  const file = path.join(directory, 'workspace.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete data.questionBatches;
  fs.writeFileSync(file, JSON.stringify(data));
  const before = fs.readFileSync(file, 'utf8');
  const store = new Store(directory, encryption);
  assert.deepEqual(store.snapshot().questionBatches, []);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('unparsed interviews are saved as reopenable records rather than silently discarded', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ resume: '只有简短经历的简历' });
  const raw = '  请先补充项目职责，当前资料不足。\n';
  const id = store.createPractice({ questions: [], raw, model: 'm' });
  store = new Store(directory, encryption);
  assert.equal(store.session(id).practice.status, 'unparsed');
  assert.equal(store.session(id).practice.rawQuestions, raw);
  assert.throws(() => store.appendPracticeReview(id, '回答', review()), /已经结束/);
});

test('invalid training writes leave both in-memory and persisted records untouched', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.saveSettings({ resume: '测试简历' });
  const id = store.createPractice(generation());
  const file = path.join(directory, 'workspace.json');
  const before = fs.readFileSync(file, 'utf8');
  for (const invalid of [
    { ...generation(), raw: '' },
    { ...generation(), questions: [{ ...question('q'), title: '' }] },
    { ...generation(), questions: [question('same'), question('same')] },
  ]) {
    assert.throws(() => store.createPractice(invalid));
    assert.throws(() => store.appendQuestionBatch(invalid));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  for (const score of [-1, 101, '85', undefined, NaN]) {
    assert.throws(() => store.appendPracticeReview(id, '回答', { ...review(), score }));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  assert.equal(store.session(id).practice.reviews.length, 0);
});

test('overlong generated titles remain in raw output without creating unanswerable questions', async (t) => {
  const raw = JSON.stringify({
    questions: [{ title: 'q'.repeat(2001) }, { title: '真实项目中如何验证缓存一致性？' }],
  });
  const service = await provider(t, [raw]);
  const result = await practice.generateQuestions({ ...service, kind: 'mock', count: 2 });
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].title, '真实项目中如何验证缓存一致性？');
  assert.equal(result.raw, raw);
  assert.equal(service.requests.length, 1);
});

test('maximum sized review content remains readable after its export message adds a score', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ resume: '真实简历' });
  const id = store.createPractice(generation([question('only-question')]));
  const content = 'a'.repeat(512 * 1024);
  store.appendPracticeReview(id, '真实回答', { ...review(), content, raw: content });
  store = new Store(directory, encryption);
  assert.equal(store.session(id).practice.reviews[0].content, content);
  assert.ok(store.session(id).messages[1].content.endsWith(content));
  assert.equal(store.session(id).practice.status, 'completed');
});

test('inconsistent saved practice progress is rejected without modifying local records', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.saveSettings({ resume: '真实简历' });
  const id = store.createPractice(generation());
  store.appendPracticeReview(id, '第一题真实回答', review());
  const file = path.join(directory, 'workspace.json');
  const valid = JSON.parse(fs.readFileSync(file, 'utf8'));
  const changes = [
    (session) => {
      session.practice.status = 'completed';
    },
    (session) => {
      session.practice.status = 'unparsed';
    },
    (session) => {
      session.practice.completedAt = new Date().toISOString();
    },
    (session) => {
      session.practice.reviews[0].questionId = 'another-question';
    },
    (session) => {
      session.messages.pop();
    },
  ];
  for (const change of changes) {
    const invalid = structuredClone(valid);
    change(invalid.sessions.find((session) => session.id === id));
    const content = JSON.stringify(invalid);
    fs.writeFileSync(file, content);
    assert.throws(() => new Store(directory, encryption), /本地数据文件无法读取/);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
  fs.writeFileSync(file, JSON.stringify(valid));
  assert.equal(new Store(directory, encryption).session(id).practice.reviews.length, 1);
  assert.throws(
    () => store.appendAnswer(id, '绕过逐题点评', { content: '不应保存', demo: false }, 'text'),
    /逐题提交回答并评分/,
  );
});
