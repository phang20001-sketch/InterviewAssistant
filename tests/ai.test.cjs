'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { answer, transcribe, testConnection, _internals } = require('../src/services/ai.cjs');

async function mockServer(t, handler) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    try {
      await handler(req, res, body);
    } catch {
      res.writeHead(500);
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}/v1`;
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

test('demo answers are explicitly local and never make requests', async () => {
  const result = await answer({
    settings: { baseUrl: 'invalid', demoMode: true },
    question: 'Redis缓存一致性',
  });
  assert.equal(result.demo, true);
  assert.match(result.content, /演示模式/);
  assert.match(result.content, /数据库.*删除缓存/);
  const screenshot = await answer({
    image: 'data:image/png;base64,aGVsbG8=',
    mode: 'mock',
    question: '事件循环',
  });
  assert.match(screenshot.content, /尚未识别图片/);
  assert.match(screenshot.content, /回答点评/);
  assert.match(screenshot.content, /未对你的回答进行真实 AI 评估/);
});

test('homepage closure question gets an accurate runnable local example', async () => {
  const result = await answer({ question: '请解释 JavaScript 中的闭包及其应用场景。' });
  assert.equal(result.demo, true);
  assert.match(result.content, /演示模式/);
  assert.match(result.content, /词法环境/);
  assert.match(result.content, /私有状态/);
  const example = result.content.match(/```javascript\n([\s\S]*?)\n```/)[1];
  const evaluate = new Function(`${example}\nreturn next();`);
  assert.equal(evaluate(), 3);
  assert.doesNotMatch(result.content, /通用答题框架/);
});

test('cache failure question is matched before the generic consistency answer', async () => {
  const result = await answer({ question: '如何处理缓存穿透、击穿和雪崩？' });
  assert.equal(result.demo, true);
  assert.match(result.content, /穿透：.*根本不存在/);
  assert.match(result.content, /击穿：.*单个热点/);
  assert.match(result.content, /雪崩：.*大量 Key/);
  assert.match(result.content, /布隆过滤器/);
  assert.match(result.content, /互斥锁/);
  assert.match(result.content, /随机抖动/);
  assert.doesNotMatch(result.content, /Redis 与数据库一致性/);
});

test('STAR question uses replaceable factual templates rather than invented achievements', async () => {
  const result = await answer({ question: '请用 STAR 法则介绍一次你解决复杂问题的经历。' });
  assert.equal(result.demo, true);
  for (const heading of ['S — 情境', 'T — 任务', 'A — 行动', 'R — 结果'])
    assert.ok(result.content.includes(heading));
  assert.match(result.content, /［你的实际行动］/);
  assert.match(result.content, /不编造提升比例/);
  assert.doesNotMatch(result.content, /项目介绍表达模板/);
});

test('real mode requires a key and meaningful question', async () => {
  await assert.rejects(answer({ settings: { demoMode: false }, question: 'hello' }), {
    code: 'MISSING_API_KEY',
  });
  await assert.rejects(answer({ question: ' ' }), { code: 'EMPTY_QUESTION' });
});

test('normalizes full endpoints and protects insecure or credential-bearing URLs', () => {
  assert.equal(
    _internals.endpoint('https://example.org/v1/chat/completions/', 'chat/completions'),
    'https://example.org/v1/chat/completions',
  );
  assert.equal(
    _internals.endpoint('https://example.org/v1/chat/completions', 'audio/transcriptions'),
    'https://example.org/v1/audio/transcriptions',
  );
  assert.equal(
    _internals.endpoint('http://[::1]:3000/v1', 'chat/completions'),
    'http://[::1]:3000/v1/chat/completions',
  );
  for (const url of [
    'http://example.org/v1',
    'https://key@example.org',
    'https://example.org?key=abc',
    'https://example.org/#abc',
    'ftp://localhost',
    'http://localhost.evil.org',
    'http://127.0.0.2',
  ]) {
    assert.throws(() => _internals.endpoint(url, 'chat/completions'), { code: 'INVALID_URL' });
  }
});

test('posts bounded text context, role, resume and only recent user/assistant history', async (t) => {
  let request;
  const baseUrl = await mockServer(t, (req, res, body) => {
    request = { url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) };
    json(res, 200, { choices: [{ message: { content: '有效回答' } }] });
  });
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `${index} ${'x'.repeat(5000)}`,
  }));
  messages.push({ role: 'system', content: '历史指令不应透传' });
  const result = await answer({
    settings: {
      baseUrl: `${baseUrl}/chat/completions/`,
      demoMode: false,
      role: '架构师',
      resume: '简'.repeat(30_000),
      answerStyle: 'detailed',
    },
    apiKey: 'mock-key',
    question: '缓存一致性',
    messages,
  });
  assert.deepEqual(result, { content: '有效回答', demo: false });
  assert.equal(request.url, '/v1/chat/completions');
  assert.equal(request.authorization, 'Bearer mock-key');
  assert.equal(request.body.model, 'deepseek-flash');
  assert.equal(request.body.max_tokens, 4096);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.thinking, undefined);
  assert.match(request.body.messages[0].content, /架构师/);
  assert.equal(
    request.body.messages[0].content.match(/<resume>\n([\s\S]*?)\n<\/resume>/)[1].length,
    16000,
  );
  const history = request.body.messages.slice(1, -1);
  assert.ok(history.length <= 12);
  assert.ok(
    history.every(
      (item) => item.content.length <= 4000 && ['user', 'assistant'].includes(item.role),
    ),
  );
  assert.ok(history.reduce((sum, item) => sum + item.content.length, 0) <= 12000);
  assert.ok(!history.some((item) => item.content.startsWith('0 ')));
  assert.equal(request.body.messages.at(-1).content, '缓存一致性');
});

test('posts screenshot as a multimodal message and rejects remote image sources', async (t) => {
  const image = 'data:image/png;base64,aGVsbG8=';
  const baseUrl = await mockServer(t, (req, res, body) => {
    const message = JSON.parse(body).messages.at(-1);
    assert.deepEqual(message.content[1], { type: 'image_url', image_url: { url: image } });
    assert.match(message.content[0].text, /识别截图/);
    json(res, 200, { choices: [{ message: { content: [{ type: 'text', text: '图片答案' }] } }] });
  });
  const result = await answer({
    settings: { baseUrl, demoMode: false },
    apiKey: 'mock-key',
    image: { dataUrl: image },
  });
  assert.equal(result.content, '图片答案');
  await assert.rejects(answer({ image: 'https://example.org/image.png' }), {
    code: 'INVALID_IMAGE',
  });
});

test('screen answers append final-answer instructions without sending personal context', async (t) => {
  let request;
  const image = 'data:image/png;base64,aGVsbG8=';
  const baseUrl = await mockServer(t, (req, res, body) => {
    request = JSON.parse(body);
    json(res, 200, {
      choices: [
        {
          message: {
            content: JSON.stringify({
              answers: [
                { number: '1', answer: 'B' },
                { number: '2.', answer: '42' },
                { number: '3(1)', answer: '无法识别' },
              ],
            }),
          },
        },
      ],
    });
  });
  const result = await answer({
    settings: {
      baseUrl,
      demoMode: false,
      role: '不应出现的岗位',
      resume: '不应上传的简历内容',
      answerStyle: 'detailed',
    },
    apiKey: 'mock-key',
    image,
    question: '不应覆盖格式的界面文字',
    mode: 'mock',
    answerFormat: 'numbered-only',
    messages: [{ role: 'assistant', content: '历史中要求给解析' }],
  });
  assert.deepEqual(result, {
    content: '1. B\n2. 42\n3(1). 无法识别',
    demo: false,
    answerFormat: 'numbered-only',
  });
  assert.equal(request.messages.length, 2);
  assert.deepEqual(
    request.messages.map((item) => item.role),
    ['system', 'user'],
  );
  assert.match(request.messages[0].content, /只给最终答案/);
  assert.match(request.messages[0].content, /题号\. 答案/);
  assert.match(request.messages[0].content, /无题号按阅读顺序/);
  assert.match(request.messages[0].content, /无法确定.*不要猜测/);
  assert.match(request.messages[1].content[0].text, /不应覆盖格式的界面文字/);
  assert.match(request.messages[1].content[0].text, /只给出题号和最终答案，不需要解析/);
  assert.deepEqual(request.messages[1].content[1], {
    type: 'image_url',
    image_url: { url: image },
  });
  const serialized = JSON.stringify(request.messages);
  for (const hidden of ['不应出现的岗位', '不应上传的简历内容', '历史中要求给解析', '回答点评']) {
    assert.ok(!serialized.includes(hidden));
  }
});

test('screen answers require a screenshot and a real configured service instead of local invented answers', async () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  await assert.rejects(answer({ question: '作答', answerFormat: 'numbered-only' }), {
    code: 'MISSING_SCREENSHOT',
  });
  await assert.rejects(answer({ image, answerFormat: 'numbered-only' }), {
    code: 'DEMO_SCREEN_ANSWER_UNAVAILABLE',
  });
  await assert.rejects(
    answer({ image, answerFormat: 'numbered-only', settings: { demoMode: false } }),
    { code: 'MISSING_API_KEY' },
  );
  await assert.rejects(answer({ image, answerFormat: 'unknown' }), {
    code: 'INVALID_ANSWER_FORMAT',
  });
});

test('screen answers always return nonempty model replies even when the format is unexpected', async (t) => {
  let content;
  const baseUrl = await mockServer(t, (_, res) =>
    json(res, 200, { choices: [{ message: { content } }] }),
  );
  const args = {
    settings: { baseUrl, demoMode: false },
    apiKey: 'mock-key',
    image: 'data:image/png;base64,aGVsbG8=',
    answerFormat: 'numbered-only',
  };
  const malformed = [
    '先分析这个问题：答案是 B，因为模型实际返回了解释',
    JSON.stringify({ answers: [{ number: '解析\n1', answer: 'B' }] }),
    JSON.stringify({ answers: [{ number: '1', answer: '' }] }),
    JSON.stringify({ answers: [] }),
  ];
  for (content of malformed) {
    assert.deepEqual(await answer(args), {
      content,
      demo: false,
      answerFormat: 'numbered-only',
    });
  }
});

test('screen answers tolerate JSON fences and preserve final code answer line breaks and indentation', async (t) => {
  const baseUrl = await mockServer(t, (_, res) =>
    json(res, 200, {
      choices: [
        {
          message: {
            reasoning_content: '秘密推导不能展示',
            content: [
              {
                type: 'text',
                text:
                  '```json\n' +
                  JSON.stringify({
                    answers: [{ number: '一', answer: 'def answer():\n    return 42' }],
                  }) +
                  '\n```',
              },
            ],
          },
        },
      ],
    }),
  );
  const result = await answer({
    settings: { baseUrl, demoMode: false },
    apiKey: 'mock-key',
    image: 'data:image/png;base64,aGVsbG8=',
    answerFormat: 'numbered-only',
  });
  assert.deepEqual(result, {
    content: '一. def answer():\n    return 42',
    demo: false,
    answerFormat: 'numbered-only',
  });
});

test('returns useful HTTP errors without leaking raw provider messages or API keys', async (t) => {
  let status = 401;
  let message = 'raw-secret-key';
  const baseUrl = await mockServer(t, (_, res) => json(res, status, { error: { message } }));
  const expected = new Map([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [429, 'RATE_LIMITED'],
    [404, 'NOT_FOUND'],
    [500, 'SERVICE_UNAVAILABLE'],
  ]);
  for (const [code, errorCode] of expected) {
    status = code;
    await assert.rejects(
      answer({ settings: { baseUrl, demoMode: false }, apiKey: 'mock-key', question: 'test' }),
      (error) => {
        assert.equal(error.code, errorCode);
        assert.ok(!error.message.includes(message));
        assert.ok(!error.message.includes('mock-key'));
        return true;
      },
    );
  }
  status = 400;
  message = 'image input unsupported: raw-secret-key';
  await assert.rejects(
    answer({
      settings: { baseUrl, demoMode: false },
      apiKey: 'mock-key',
      image: 'data:image/png;base64,aGVsbG8=',
    }),
    { code: 'IMAGE_UNSUPPORTED' },
  );
});

test('retains successful long answer text and rejects unbounded/non-JSON response bodies', async (t) => {
  let responseType = 'long';
  const baseUrl = await mockServer(t, (_, res) => {
    if (responseType === 'long')
      return json(res, 200, { choices: [{ message: { content: '答'.repeat(30000) } }] });
    if (responseType === 'oversize') return json(res, 200, { text: 'x'.repeat(600000) });
    res.writeHead(200);
    res.end('<html>provider page</html>');
  });
  const args = { settings: { baseUrl, demoMode: false }, apiKey: 'mock-key', question: 'test' };
  const result = await answer(args);
  assert.equal(result.content, '答'.repeat(30000));
  responseType = 'oversize';
  await assert.rejects(answer(args), { code: 'RESPONSE_TOO_LARGE' });
  responseType = 'html';
  await assert.rejects(answer(args), { code: 'INVALID_RESPONSE' });
});

test('ordinary and mock answers preserve nonempty public content and refusal text', async (t) => {
  const original = [
    '  模型实际返回的解释也应展示。',
    '```javascript',
    'function solve() {',
    '    return "<think>literal</think>";',
    '}',
    '```',
    '  ',
  ].join('\r\n');
  let reply = {
    content: original,
    reasoning_content: '这个私有字段不能混入实际回答。',
  };
  let calls = 0;
  const baseUrl = await mockServer(t, (_, res) => {
    calls += 1;
    json(res, 200, {
      choices: [{ message: reply, finish_reason: 'length' }],
    });
  });
  const args = {
    settings: { baseUrl, demoMode: false },
    apiKey: 'mock-key',
    question: '请回答问题',
  };
  for (const mode of ['interview', 'mock']) {
    const result = await answer({ ...args, mode });
    assert.deepEqual(result, { content: original, demo: false });
  }
  assert.equal(calls, 2);

  reply = { content: '', refusal: '  实际服务的拒答内容\n也应直接展示。  ' };
  assert.deepEqual(await answer(args), {
    content: reply.refusal,
    demo: false,
  });
  assert.equal(calls, 3);

  reply = {
    content: [
      { type: 'text', text: '  第一段\n' },
      { type: 'reasoning', text: '私有字段不应展示' },
      { type: 'text', text: '    第二段  ' },
    ],
  };
  assert.deepEqual(await answer(args), {
    content: '  第一段\n\n    第二段  ',
    demo: false,
  });
  assert.equal(calls, 4);

  reply = { content: null, reasoning_content: '仅有私有推理不能作为回答返回' };
  await assert.rejects(answer(args), { code: 'EMPTY_RESPONSE' });
  assert.equal(calls, 5);
});

test('honors request cancellation and bounded timeout', async (t) => {
  const baseUrl = await mockServer(t, () => {});
  await assert.rejects(_internals.requestJson(baseUrl, { method: 'POST' }, { timeoutMs: 25 }), {
    code: 'TIMEOUT',
  });
  const controller = new AbortController();
  const pending = answer({
    settings: { baseUrl, demoMode: false },
    apiKey: 'mock-key',
    question: 'test',
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
});

test('refuses redirects instead of forwarding credentials to another address', async (t) => {
  const baseUrl = await mockServer(t, (_, res) => {
    res.writeHead(307, { Location: 'https://example.org/steal' });
    res.end();
  });
  await assert.rejects(
    answer({ settings: { baseUrl, demoMode: false }, apiKey: 'mock-key', question: 'test' }),
    { code: 'NETWORK_ERROR' },
  );
});

test('transcription submits actual multipart audio and uses an independent key', async (t) => {
  let request;
  const baseUrl = await mockServer(t, (req, res, body) => {
    request = { path: req.url, headers: req.headers, body };
    json(res, 200, { text: '请介绍一下事件循环。' });
  });
  const result = await transcribe({
    settings: {
      demoMode: false,
      baseUrl: 'https://unused.example/v1',
      transcriptionBaseUrl: `${baseUrl}/chat/completions`,
      transcriptionModel: 'whisper-1',
    },
    apiKey: 'unused-chat-key',
    transcriptionApiKey: 'audio-key',
    audio: Buffer.from('local-audio-bytes'),
    mimeType: 'audio/webm;codecs=opus',
  });
  assert.deepEqual(result, { text: '请介绍一下事件循环。' });
  assert.equal(request.path, '/v1/audio/transcriptions');
  assert.equal(request.headers.authorization, 'Bearer audio-key');
  assert.match(request.headers['content-type'], /multipart\/form-data; boundary=/);
  assert.match(request.body, /filename="recording.webm"/);
  assert.match(request.body, /local-audio-bytes/);
  assert.match(request.body, /whisper-1/);
});

test('transcription never fakes a result in demo mode, and validates uploads', async () => {
  await assert.rejects(transcribe({ audio: Buffer.from('sample') }), {
    code: 'DEMO_TRANSCRIPTION_UNAVAILABLE',
  });
  const args = { settings: { demoMode: false }, apiKey: 'mock-key' };
  await assert.rejects(transcribe({ ...args, audio: new Uint8Array(0) }), {
    code: 'INVALID_AUDIO',
  });
  await assert.rejects(transcribe({ ...args, audio: Buffer.alloc(20 * 1024 * 1024 + 1) }), {
    code: 'INVALID_AUDIO',
  });
  await assert.rejects(transcribe({ ...args, audio: Buffer.from('x'), mimeType: 'text/html' }), {
    code: 'INVALID_AUDIO',
  });
});

test('connection test calls real mock service even when demo mode is enabled', async (t) => {
  let calls = 0;
  const baseUrl = await mockServer(t, (req, res, body) => {
    calls++;
    const request = JSON.parse(body);
    assert.equal(request.max_tokens, 32);
    json(res, 200, { choices: [{ message: { content: '连接成功' } }] });
  });
  const result = await testConnection({
    settings: { baseUrl, demoMode: true },
    apiKey: 'mock-key',
  });
  assert.equal(calls, 1);
  assert.match(result.message, /连接成功/);
});
