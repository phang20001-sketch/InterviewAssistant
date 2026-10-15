const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
const work = path.resolve(__dirname, '../work');
fs.mkdirSync(work, { recursive: true });
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from('encrypted:' + Buffer.from(text).toString('base64')),
  decryptString: (bytes) => Buffer.from(bytes.toString().slice(10), 'base64').toString(),
};
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(work, 'store-test-'));
  t.after(() => {
    if (directory.startsWith(work + path.sep))
      fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
test('sessions and answers survive restarting, while credentials never enter the renderer state', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'unit-test-secret', role: '后端工程师', demoMode: false });
  let state = store.createSession({ mode: 'mock' });
  store.appendAnswer(
    state.activeSessionId,
    '项目中如何处理缓存一致性？',
    { content: '先说明一致性要求。', demo: false },
    'text',
  );
  store = new Store(directory, encryption);
  state = store.snapshot();
  assert.equal(state.settings.role, '后端工程师');
  assert.equal(state.sessions[0].messages.length, 2);
  assert.equal(state.settings.hasApiKey, true);
  assert.equal(store.credential(), 'unit-test-secret');
  assert.equal(JSON.stringify(state).includes('unit-test-secret'), false);
  assert.equal(
    fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8').includes('unit-test-secret'),
    false,
  );
  store.saveSettings({ apiKey: '' });
  assert.equal(store.credential(), 'unit-test-secret');
  store.saveSettings({ clearApiKey: true });
  assert.equal(store.snapshot().settings.hasApiKey, false);
});
test('failed validation never modifies persisted settings and unavailable encryption never stores plaintext', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, { ...encryption, isEncryptionAvailable: () => false });
  const original = fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8');
  assert.throws(() => store.saveSettings({ resume: 'x'.repeat(16001) }));
  assert.throws(() => store.saveSettings({ apiKey: 'secret' }), /加密/);
  assert.equal(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8'), original);
});
test('independent text and background opacity persist without changing credentials or accepting invalid values', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  assert.equal(store.settings().transparentTextOpacity, 100);
  assert.equal(store.settings().transparentBackgroundOpacity, 0);
  store.saveSettings({
    apiKey: 'opacity-test-secret',
    transparentTextOpacity: 42,
    transparentBackgroundOpacity: 73,
  });
  const before = fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8');
  for (const value of [-1, 101, 0.5, '50', null, true, NaN, Infinity]) {
    for (const key of ['transparentTextOpacity', 'transparentBackgroundOpacity']) {
      assert.throws(() => store.saveSettings({ [key]: value }), /0 到 100/);
      assert.equal(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8'), before);
    }
  }
  store = new Store(directory, encryption);
  assert.equal(store.settings().transparentTextOpacity, 42);
  assert.equal(store.settings().transparentBackgroundOpacity, 73);
  assert.equal(store.credential(), 'opacity-test-secret');
  store.saveSettings({ transparentTextOpacity: 0, transparentBackgroundOpacity: 100 });
  assert.equal(store.settings().transparentTextOpacity, 0);
  assert.equal(store.settings().transparentBackgroundOpacity, 100);
});

test('transparent font size persists independently and invalid updates leave the workspace intact', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  assert.equal(store.settings().transparentFontSize, 16);
  store.saveSettings({
    apiKey: 'font-size-test-secret',
    transparentTextOpacity: 42,
    transparentBackgroundOpacity: 73,
    transparentFontSize: 24,
  });
  const file = path.join(directory, 'workspace.json');
  const before = fs.readFileSync(file, 'utf8');
  const savedVault = JSON.parse(before).vault;
  for (const value of [11, 33, 16.5, '20', null, true, NaN, Infinity]) {
    assert.throws(
      () => store.saveSettings({ transparentFontSize: value, role: 'must not be saved' }),
      /12 到 32/,
    );
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  store = new Store(directory, encryption);
  assert.equal(store.settings().transparentFontSize, 24);
  assert.equal(store.settings().transparentTextOpacity, 42);
  assert.equal(store.settings().transparentBackgroundOpacity, 73);
  assert.equal(store.credential(), 'font-size-test-secret');
  store.saveSettings({ transparentFontSize: 12 });
  assert.equal(store.settings().transparentFontSize, 12);
  store.saveSettings({ transparentFontSize: 32 });
  store = new Store(directory, encryption);
  assert.equal(store.settings().transparentFontSize, 32);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).vault, savedVault);
  assert.equal(store.snapshot().settings.hasApiKey, true);
  assert.equal(JSON.stringify(store.snapshot()).includes('font-size-test-secret'), false);
});

test('missing or invalid legacy transparent font size uses defaults without rewriting saved data', (t) => {
  const directory = temporary(t);
  const file = path.join(directory, 'workspace.json');
  const original = new Store(directory, encryption);
  original.saveSettings({ apiKey: 'legacy-font-size-secret', transparentTextOpacity: 54 });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const value of [undefined, 0, 100, 16.5, '20', null]) {
    const legacy = structuredClone(saved);
    if (value === undefined) delete legacy.settings.transparentFontSize;
    else legacy.settings.transparentFontSize = value;
    const serialized = JSON.stringify(legacy, null, 2);
    fs.writeFileSync(file, serialized);
    const reopened = new Store(directory, encryption);
    assert.equal(reopened.settings().transparentFontSize, 16);
    assert.equal(reopened.settings().transparentTextOpacity, 54);
    assert.equal(reopened.credential(), 'legacy-font-size-secret');
    assert.equal(fs.readFileSync(file, 'utf8'), serialized);
  }
});
test('deleting the active and last session preserves a usable workspace', (t) => {
  const store = new Store(temporary(t), encryption);
  const first = store.snapshot().activeSessionId;
  const second = store.createSession({ mode: 'coding' }).activeSessionId;
  assert.equal(store.deleteSession(second).activeSessionId, first);
  const next = store.deleteSession(first);
  assert.equal(next.sessions.length, 1);
  assert.notEqual(next.activeSessionId, first);
  assert.throws(
    () => store.appendAnswer(first, 'orphan', { content: 'should not save' }, 'text'),
    /删除/,
  );
});

test('clearing sessions removes every old mode from disk and preserves encrypted settings', (t) => {
  const directory = temporary(t);
  const file = path.join(directory, 'workspace.json');
  let store = new Store(directory, encryption);
  store.saveSettings({
    apiKey: 'clear-sessions-key',
    transcriptionApiKey: 'clear-sessions-transcription-key',
    role: '后端工程师',
    resume: '保留的个人简历',
    demoMode: false,
    transparentTextOpacity: 45,
    transparentBackgroundOpacity: 70,
    transparentFontSize: 24,
  });
  const oldIds = [store.snapshot().activeSessionId];
  const contents = [];
  for (const mode of ['interview', 'coding', 'mock']) {
    const id = store.createSession({ mode }).activeSessionId;
    oldIds.push(id);
    const question = `clear-sessions-old-${mode}-question`;
    const answer = `clear-sessions-old-${mode}-answer`;
    contents.push(question, answer);
    store.appendAnswer(id, question, { content: answer }, 'text');
  }
  oldIds.push(store.createSession({ mode: 'mock', title: '空会话也需删除' }).activeSessionId);
  const settings = store.settings();
  const vault = JSON.parse(fs.readFileSync(file, 'utf8')).vault;

  const state = store.clearSessions();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].mode, 'interview');
  assert.equal(state.sessions[0].title, '新的面试');
  assert.equal(state.sessions[0].id, state.activeSessionId);
  assert.deepEqual(state.sessions[0].messages, []);
  assert.deepEqual(store.settings(), settings);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).vault, vault);
  assert.equal(state.settings.hasApiKey, true);
  assert.equal(state.settings.hasTranscriptionApiKey, true);
  assert.equal(store.credential(), 'clear-sessions-key');
  assert.equal(store.credential('transcriptionApiKey'), 'clear-sessions-transcription-key');
  assert.equal(Object.hasOwn(state, 'vault'), false);

  const persisted = fs.readFileSync(file, 'utf8');
  for (const value of [...oldIds, ...contents]) {
    assert.equal(persisted.includes(value), false);
  }
  store = new Store(directory, encryption);
  assert.deepEqual(store.snapshot(), state);
  for (const id of oldIds) assert.throws(() => store.session(id), /没有找到/);
  store.appendAnswer(state.activeSessionId, '新的问题', { content: '新的回答' }, 'text');
  store = new Store(directory, encryption);
  assert.equal(store.session(state.activeSessionId).messages.at(-1).content, '新的回答');

  const second = store.clearSessions();
  const third = store.clearSessions();
  assert.equal(third.sessions.length, 1);
  assert.equal(third.sessions[0].messages.length, 0);
  assert.notEqual(third.activeSessionId, second.activeSessionId);
  assert.deepEqual(store.settings(), settings);
  assert.equal(store.credential(), 'clear-sessions-key');
});

test('clearing sessions deletes only precisely named local workspace copies', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  const original = fs.readFileSync(store.file, 'utf8');
  const copies = [
    'workspace.json.bak',
    'workspace.json.tmp',
    'workspace.json.before-1.0.3-20261015150904.bak',
    'workspace.json.before-1.1.3-20261015165349.bak',
    'workspace.before-1.0.1-1792041600000.json',
  ];
  const unrelated = [
    'notes.bak',
    'workspace-other.json',
    'workspace.json.before-manual.bak',
    'workspace.json.before-1.1.3-20261015.bak',
    'workspace.json.before-1.1.3-20261015165349.bak.keep',
    'workspace.before-1.0.2-1792041600000.json',
    'interview-export.md',
  ];
  for (const name of copies) fs.writeFileSync(path.join(directory, name), original);
  for (const name of unrelated) fs.writeFileSync(path.join(directory, name), 'leave untouched');
  const nested = path.join(directory, 'exports');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, copies[0]), 'leave nested files untouched');

  store.clearSessions();
  for (const name of copies) assert.equal(fs.existsSync(path.join(directory, name)), false);
  for (const name of unrelated) {
    assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), 'leave untouched');
  }
  assert.equal(
    fs.readFileSync(path.join(nested, copies[0]), 'utf8'),
    'leave nested files untouched',
  );
});

test('clearing sessions refuses a directory named as a copy and keeps current data intact', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.appendAnswer(store.snapshot().activeSessionId, '仍应保留的问题', {
    content: '仍应保留的回答',
  });
  const original = fs.readFileSync(store.file, 'utf8');
  const state = store.snapshot();
  const unexpectedDirectory = path.join(directory, 'workspace.json.bak');
  fs.mkdirSync(unexpectedDirectory);
  fs.writeFileSync(path.join(unexpectedDirectory, 'keep.txt'), 'do not recurse');
  fs.writeFileSync(path.join(directory, 'workspace.json.tmp'), 'existing old copy');

  assert.throws(() => store.clearSessions(), /无法清除本地会话副本/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(
    fs.readFileSync(path.join(unexpectedDirectory, 'keep.txt'), 'utf8'),
    'do not recurse',
  );
  assert.equal(
    fs.readFileSync(path.join(directory, 'workspace.json.tmp'), 'utf8'),
    'existing old copy',
  );
});

test('clearing sessions never follows a directory link named as a workspace copy', (t) => {
  const directory = temporary(t);
  const destination = temporary(t);
  const store = new Store(directory, encryption);
  const original = fs.readFileSync(store.file, 'utf8');
  const state = store.snapshot();
  const linkedCopy = path.join(directory, 'workspace.json.bak');
  fs.writeFileSync(path.join(destination, 'keep.txt'), 'do not follow');
  fs.symlinkSync(destination, linkedCopy, process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(() => store.clearSessions(), /无法清除本地会话副本/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(fs.lstatSync(linkedCopy).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'do not follow');
});

test('failed copy removal reports failure without changing the current workspace', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  const original = fs.readFileSync(store.file, 'utf8');
  const state = store.snapshot();
  const backup = path.join(directory, 'workspace.json.bak');
  fs.writeFileSync(backup, original);
  const unlink = fs.unlinkSync;
  const mock = t.mock.method(fs, 'unlinkSync', (file) => {
    if (file === backup)
      throw Object.assign(new Error('test permission failure'), { code: 'EACCES' });
    return unlink(file);
  });

  assert.throws(() => store.clearSessions(), /无法清除本地会话副本/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(fs.existsSync(backup), true);
  mock.mock.restore();
});

test('failed atomic replacement never changes the current in-memory or persisted sessions', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.appendAnswer(store.snapshot().activeSessionId, '原来的问题', { content: '原来的回答' });
  const original = fs.readFileSync(store.file, 'utf8');
  const state = store.snapshot();
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === store.file)
      throw Object.assign(new Error('test replacement failure'), { code: 'EACCES' });
    return rename(source, target);
  });

  assert.throws(() => store.clearSessions(), /无法保存本地数据/);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  assert.equal(fs.existsSync(store.file + '.tmp'), false);
  mock.mock.restore();
  assert.deepEqual(new Store(directory, encryption).snapshot(), state);
  assert.equal(store.clearSessions().sessions[0].messages.length, 0);
});

test('corrupt storage is left intact and produces an actionable error', (t) => {
  const directory = temporary(t);
  const file = path.join(directory, 'workspace.json');
  fs.writeFileSync(file, 'not-json');
  assert.throws(() => new Store(directory, encryption), /先备份/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'not-json');
});

test('long model answers retain every line and survive restarting', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  const id = store.snapshot().activeSessionId;
  const content = [
    '  AI 原始回答：',
    '    不符合格式也要保留。',
    '内容'.repeat(25000),
    '  最后一行。',
  ].join('\n');
  assert.ok(content.length > 32000);
  store.appendAnswer(
    id,
    '截屏作答',
    { content, demo: false, answerFormat: 'numbered-only' },
    'screenshot',
  );
  store = new Store(directory, encryption);
  assert.equal(store.session(id).messages.at(-1).content, content);
  assert.equal(store.session(id).messages.at(-1).answerFormat, 'numbered-only');
});
