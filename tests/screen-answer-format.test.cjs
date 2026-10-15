'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { answer } = require('../src/services/ai.cjs');

const SCREENSHOT = 'data:image/png;base64,bW9jay1zY3JlZW5zaG90';
const API_KEY = 'mock-screen-format-key';

async function screenService(t, respond) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({
      path: req.url,
      authorization: req.headers.authorization,
      body,
    });
    const response = await respond(requests.length, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
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
    args: {
      settings: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        model: 'mock-vision-model',
        demoMode: false,
        role: '不应上传的岗位',
        resume: '不应上传的简历',
      },
      apiKey: API_KEY,
      image: SCREENSHOT,
      answerFormat: 'numbered-only',
      messages: [{ role: 'assistant', content: '不应上传的历史内容' }],
    },
  };
}

function completion(content, extra = {}) {
  return { choices: [{ message: { content }, ...extra }] };
}

function screenResult(content) {
  return { content, demo: false, answerFormat: 'numbered-only' };
}

async function expectOneRawAnswer(t, content, response = completion(content)) {
  const service = await screenService(t, () => response);
  assert.deepEqual(await answer(service.args), screenResult(content));
  assert.equal(service.requests.length, 1);
  return service;
}

test('complete screen answer JSON still formats final answers and preserves question labels', async (t) => {
  const variants = [
    {
      label: 'numeric and leading-zero labels',
      content: JSON.stringify({
        answers: [
          { number: 1, answer: 'A' },
          { number: '002', answer: 'BC' },
          { number: '3(1)', answer: '42' },
        ],
      }),
      expected: '1. A\n002. BC\n3(1). 42',
    },
    {
      label: 'top-level array',
      content: JSON.stringify([
        { number: '01', answer: 'D' },
        { number: 2, answer: '无法确定' },
      ]),
      expected: '01. D\n2. 无法确定',
    },
    {
      label: 'compatible field aliases and scalar values',
      content: JSON.stringify({
        results: [
          { question_number: '01', final_answer: ['A', 'C'] },
          { questionNo: 2, finalAnswer: 42 },
          { 题号: '三', 答案: false },
        ],
      }),
      expected: '01. AC\n2. 42\n三. false',
    },
    {
      label: 'complete JSON fence',
      content: '```json\n{"answers":[{"number":"1","answer":"C"}]}\n```',
      expected: '1. C',
    },
  ];

  for (const { label, content, expected } of variants) {
    await t.test(label, async (t) => {
      const service = await screenService(t, () => completion(content));
      assert.deepEqual(await answer(service.args), screenResult(expected));
      assert.equal(service.requests.length, 1);
    });
  }
});

test('plain numbered replies preserve their original punctuation and line breaks', async (t) => {
  for (const content of ['1. B\n02、AC\n3(1)：42', '2(1) B', '  1、B\r\n\r\n2）C  \n']) {
    await t.test(JSON.stringify(content), (t) => expectOneRawAnswer(t, content));
  }
});

test('unformatted prose and mixed explanations are returned without another model request', async (t) => {
  const replies = [
    '第 1 题的最终选项为 B，但我没有遵守指定的输出格式。',
    '1. B\n解析：原始解释也应完整展示\n2) C',
    '我需要更多信息才能作答，请补充清晰的题目。',
    '  原始缩进必须保留。\r\n\r\n    第二行不能被整理或截掉。  \n',
  ];
  for (const [index, content] of replies.entries()) {
    await t.test('reply ' + (index + 1), async (t) => {
      const service = await expectOneRawAnswer(t, content);
      assert.equal(service.requests[0].path, '/v1/chat/completions');
      assert.equal(service.requests[0].authorization, 'Bearer ' + API_KEY);
      assert.equal(service.requests[0].body.model, 'mock-vision-model');
      assert.deepEqual(
        service.requests[0].body.messages.map((message) => message.role),
        ['system', 'user'],
      );
      assert.match(service.requests[0].body.messages[0].content, /只给最终答案/);
      assert.match(service.requests[0].body.messages[1].content[0].text, /当前屏幕截图/);
      assert.equal(service.requests[0].body.messages[1].content[1].image_url.url, SCREENSHOT);
      const serialized = JSON.stringify(service.requests[0].body.messages);
      for (const hidden of ['不应上传的岗位', '不应上传的简历', '不应上传的历史内容', API_KEY]) {
        assert.ok(!serialized.includes(hidden));
      }
    });
  }
});

test('JSON with extra explanation fields or surrounding prose is returned completely', async (t) => {
  const replies = [
    JSON.stringify({
      analysis: '模型额外返回的说明也必须显示',
      answers: [{ number: '1', answer: 'B' }],
    }),
    JSON.stringify({
      answers: [{ number: '1', answer: 'B', explanation: '模型返回的解释不应静默丢弃' }],
    }),
    [
      '以下是完整结果。',
      '```json',
      JSON.stringify({ answers: [{ number: '1', answer: 'C' }] }),
      '```',
      '这是模型额外补充的说明。',
    ].join('\n'),
  ];
  for (const [index, content] of replies.entries()) {
    await t.test('reply ' + (index + 1), (t) => expectOneRawAnswer(t, content));
  }
});

test('unexpected or empty answer objects fall back to the original nonempty response', async (t) => {
  const replies = [
    JSON.stringify({ answers: [] }),
    JSON.stringify({ answers: [], analysis: '当前图片里没有题目。' }),
    JSON.stringify({ answers: [{ number: '1', answer: '' }] }),
    JSON.stringify({ answers: [{ number: 'analysis', answer: 'B' }] }),
    JSON.stringify({ answers: [{ number: '解析\n1', answer: 'B' }] }),
    JSON.stringify({ unknown: '这是服务实际返回的内容' }),
  ];
  for (const [index, content] of replies.entries()) {
    await t.test('reply ' + (index + 1), (t) => expectOneRawAnswer(t, content));
  }
});

test('explanations and literal thinking tags in answer strings are retained', async (t) => {
  const replies = [
    'B。解析：模型额外返回的解释',
    'B 解析：模型额外返回的解释',
    'const label = "解析：一个键名";',
    'return "<think>literal</think>";',
    '<think>模型输出在普通 content 中的原始文字</think>B',
  ];
  for (const [index, content] of replies.entries()) {
    await t.test('answer ' + (index + 1), async (t) => {
      const service = await screenService(t, () =>
        completion(JSON.stringify({ answers: [{ number: '1', answer: content }] })),
      );
      assert.deepEqual(await answer(service.args), screenResult('1. ' + content));
      assert.equal(service.requests.length, 1);
    });
  }
});

test('literal thinking tags in raw content are not stripped or parsed as a different answer', async (t) => {
  const nested = JSON.stringify({ answers: [{ number: '1', answer: '内部文本' }] });
  const replies = [
    ['<think>', nested, '1. A', '</think>', '模型输出的结尾。'].join('\n'),
    ['下面是模型输出', '<think>', nested, '</think>'].join('\n'),
    ['<think>', nested, '1. A'].join('\n'),
    ['```javascript', 'const node = "<think>literal</think>";', '```'].join('\n'),
  ];
  for (const [index, content] of replies.entries()) {
    await t.test('reply ' + (index + 1), (t) => expectOneRawAnswer(t, content));
  }
});

test('screen answers retain code over previous service and storage limits', async (t) => {
  const code = [
    'function solve(values) {',
    '  const result = [];',
    '  const analysis = { reasoning: "1. B", value: "解析 is part of the data" };',
    ...Array.from(
      { length: 2000 },
      (_, index) => '  result.push(values[' + index + '] ?? ' + index + ');',
    ),
    '  return result;',
    '}',
  ].join('\n');
  assert.ok(code.length > 32_000);
  const service = await screenService(t, () =>
    completion(JSON.stringify({ answers: [{ number: '4', answer: code }] })),
  );
  assert.deepEqual(await answer(service.args), screenResult('4. ' + code));
  assert.equal(service.requests.length, 1);
});

test('unstructured long answers retain every character and all code whitespace', async (t) => {
  const content = [
    '模型没有遵守输出格式，以下内容也应全部展示：',
    '```javascript',
    'function solve(values) {',
    ...Array.from({ length: 2000 }, (_, index) => '  console.log(values[' + index + ']);'),
    '}',
    '```',
    '\n模型返回的最后一行。  ',
  ].join('\n');
  assert.ok(content.length > 32_000);
  await expectOneRawAnswer(t, content);
});

test('unreadable images and no-question replies are displayed without guessed answers', async (t) => {
  for (const content of ['无法查看图片，请提供题目后再作答。', '当前截图没有可识别的题目。']) {
    await t.test(content, (t) => expectOneRawAnswer(t, content));
  }
});

test('provider length cutoff returns all available text even when JSON is incomplete', async (t) => {
  const replies = ['{"answers":[{"number":"1","answer":"B"}', '1. B\n2. 第二题的回答还没有生成完'];
  for (const [index, content] of replies.entries()) {
    await t.test('reply ' + (index + 1), (t) =>
      expectOneRawAnswer(t, content, completion(content, { finish_reason: 'length' })),
    );
  }
});

test('provider filtering and refusal return actual nonempty text without another request', async (t) => {
  const filtered = '服务实际返回的说明应展示。';
  await t.test('content filter with content', (t) =>
    expectOneRawAnswer(t, filtered, completion(filtered, { finish_reason: 'content_filter' })),
  );
  const refusal = '服务返回的拒答原因应展示。';
  await t.test('refusal when content is empty', (t) =>
    expectOneRawAnswer(t, refusal, {
      choices: [{ message: { content: null, refusal } }],
    }),
  );
  await t.test('content takes priority over a separate refusal field', (t) =>
    expectOneRawAnswer(t, '1. B', {
      choices: [{ message: { content: '1. B', refusal: '不覆盖实际回答' } }],
    }),
  );
});

test('private reasoning fields are never substituted for a public answer', async (t) => {
  const service = await screenService(t, () => ({
    choices: [
      {
        message: {
          content: null,
          reasoning_content: '这不是可展示的回答，不能透传。',
        },
      },
    ],
  }));
  await assert.rejects(answer(service.args), { code: 'EMPTY_RESPONSE' });
  assert.equal(service.requests.length, 1);
});

test('empty public content still reports an empty response without extra paid attempts', async (t) => {
  for (const content of [null, '', '  \r\n  ']) {
    await t.test(JSON.stringify(content), async (t) => {
      const service = await screenService(t, () => completion(content));
      await assert.rejects(answer(service.args), { code: 'EMPTY_RESPONSE' });
      assert.equal(service.requests.length, 1);
    });
  }
});
