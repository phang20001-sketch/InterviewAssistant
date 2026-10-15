const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store, defaults } = require('../src/store.cjs');

const work = path.resolve(__dirname, '../work');
fs.mkdirSync(work, { recursive: true });
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from('encrypted:' + Buffer.from(text).toString('base64')),
  decryptString: (bytes) => Buffer.from(bytes.toString().slice(10), 'base64').toString(),
};

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(work, 'model-profiles-store-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(work + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}

function createProfile(store, overrides = {}) {
  const before = store.snapshot().modelProfiles.map((profile) => profile.id);
  const state = store.saveModelProfile({
    name: '第二个模型',
    baseUrl: 'https://second.example/v1',
    model: 'second-model',
    ...overrides,
  });
  return state.modelProfiles.find((profile) => !before.includes(profile.id));
}

function editable(profile, overrides = {}) {
  return {
    id: profile.id,
    name: profile.name,
    baseUrl: profile.baseUrl,
    model: profile.model,
    demoMode: profile.demoMode,
    ...overrides,
  };
}

function assertNoChanges(store, action, pattern) {
  const snapshot = store.snapshot();
  const serialized = fs.readFileSync(store.file, 'utf8');
  assert.throws(action, pattern);
  assert.deepEqual(store.snapshot(), snapshot);
  assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
  assert.equal(fs.existsSync(store.file + '.tmp'), false);
}

test('legacy models migrate in memory with their encrypted key without rewriting the file', (t) => {
  const directory = temporary(t);
  const file = path.join(directory, 'workspace.json');
  const encrypted = encryption.encryptString('legacy-only-secret').toString('base64');
  const legacy = {
    version: 1,
    settings: { ...defaults, model: 'legacy-vision', demoMode: false },
    vault: { apiKey: encrypted, transcriptionApiKey: encrypted },
    sessions: [{ id: 'legacy-session', title: '已有会话', mode: 'interview', messages: [] }],
    activeSessionId: 'legacy-session',
  };
  const serialized = JSON.stringify(legacy, null, 2);
  fs.writeFileSync(file, serialized);

  let store = new Store(directory, encryption);
  const state = store.snapshot();
  assert.equal(state.activeModelProfileId, 'default-model');
  assert.deepEqual(state.modelProfiles, [
    {
      id: 'default-model',
      name: '默认模型',
      baseUrl: defaults.baseUrl,
      model: 'legacy-vision',
      demoMode: false,
      hasApiKey: true,
    },
  ]);
  assert.equal(store.credential(), 'legacy-only-secret');
  assert.equal(store.credential('transcriptionApiKey'), 'legacy-only-secret');
  assert.equal(fs.readFileSync(file, 'utf8'), serialized);
  assert.equal(Object.hasOwn(state, 'vault'), false);
  assert.equal(JSON.stringify(state).includes(encrypted), false);

  store = new Store(directory, encryption);
  assert.deepEqual(store.snapshot(), state);
  assert.equal(fs.readFileSync(file, 'utf8'), serialized);
  store.saveSettings({ transparentFontSize: 22 });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.vault.modelProfiles['default-model'], encrypted);
  assert.equal(saved.vault.apiKey, encrypted);
  assert.equal(saved.vault.transcriptionApiKey, encrypted);
});

test('creating and selecting models keeps keys isolated and survives a restart', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  const firstId = store.snapshot().activeModelProfileId;
  store.saveSettings({
    apiKey: 'first-profile-key',
    transcriptionApiKey: 'global-transcription-key',
    role: '后端工程师',
    resume: '全局简历内容',
    transparentFontSize: 28,
    demoMode: false,
  });

  const empty = createProfile(store);
  assert.equal(empty.hasApiKey, false);
  assert.equal(store.snapshot().activeModelProfileId, firstId);
  assert.equal(store.credential(), 'first-profile-key');
  store.selectModelProfile(empty.id);
  assert.equal(store.credential(), '');
  assert.equal(store.settings().baseUrl, 'https://second.example/v1');
  assert.equal(store.settings().model, 'second-model');
  assert.equal(store.settings().demoMode, false);
  assert.equal(store.snapshot().settings.hasApiKey, false);
  assert.equal(store.credential('transcriptionApiKey'), 'global-transcription-key');
  assert.equal(store.settings().role, '后端工程师');
  assert.equal(store.settings().resume, '全局简历内容');
  assert.equal(store.settings().transparentFontSize, 28);

  const second = createProfile(store, {
    name: '视觉模型',
    model: 'vision-model',
    apiKey: 'vision-profile-key',
  });
  assert.equal(second.hasApiKey, true);
  assert.equal(store.credential(), '');
  store.selectModelProfile(second.id);
  assert.equal(store.credential(), 'vision-profile-key');
  store = new Store(directory, encryption);
  assert.equal(store.snapshot().activeModelProfileId, second.id);
  assert.equal(store.credential(), 'vision-profile-key');
  store.selectModelProfile(firstId);
  assert.equal(store.credential(), 'first-profile-key');

  const serialized = fs.readFileSync(store.file, 'utf8');
  const stateText = JSON.stringify(store.snapshot());
  for (const secret of ['first-profile-key', 'global-transcription-key', 'vision-profile-key']) {
    assert.equal(serialized.includes(secret), false);
    assert.equal(stateText.includes(secret), false);
    const encrypted = encryption.encryptString(secret).toString('base64');
    assert.equal(stateText.includes(encrypted), false);
  }
  const disk = JSON.parse(serialized);
  assert.equal(disk.vault.apiKey, disk.vault.modelProfiles[firstId]);
  assert.deepEqual(Object.keys(disk.vault.modelProfiles).sort(), [firstId, second.id].sort());
  assert.equal(
    disk.modelProfiles.some((profile) => Object.hasOwn(profile, 'apiKey')),
    false,
  );
});

test('editing preserves blank keys, supports explicit clearing and updates the active alias', (t) => {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({ apiKey: 'original-key' });
  const initial = store.snapshot().modelProfiles[0];
  store.saveModelProfile(editable(initial, { name: '重命名模型', apiKey: '' }));
  assert.equal(store.credential(), 'original-key');
  store.saveModelProfile(editable(initial, { apiKey: '   ' }));
  assert.equal(store.credential(), 'original-key');

  const second = createProfile(store, { apiKey: 'second-key' });
  store.saveModelProfile(editable(second, { model: 'updated-model', apiKey: 'edited-key' }));
  assert.equal(store.credential(), 'original-key');
  assert.equal(store.settings().model, initial.model);
  store.selectModelProfile(second.id);
  assert.equal(store.credential(), 'edited-key');
  assert.equal(store.settings().model, 'updated-model');

  const active = store.snapshot().modelProfiles.find((profile) => profile.id === second.id);
  store.saveModelProfile(
    editable(active, { baseUrl: 'http://localhost:1234/v1', model: 'local-model', demoMode: true }),
  );
  assert.equal(store.settings().baseUrl, 'http://localhost:1234/v1');
  assert.equal(store.settings().model, 'local-model');
  assert.equal(store.settings().demoMode, true);
  assert.equal(store.credential(), 'edited-key');
  store.saveModelProfile(editable(active, { clearApiKey: true, apiKey: '' }));
  assert.equal(store.credential(), '');
  assert.equal(store.snapshot().settings.hasApiKey, false);
  assert.equal(
    store.snapshot().modelProfiles.find((profile) => profile.id === second.id).hasApiKey,
    false,
  );
  const disk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.equal(Object.hasOwn(disk.vault, 'apiKey'), false);
  assert.equal(Object.hasOwn(disk.vault.modelProfiles, second.id), false);
  store.selectModelProfile(initial.id);
  assert.equal(store.credential(), 'original-key');
});

test('legacy settings saves update only the active profile and appearance saves preserve every key', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  const first = store.snapshot().modelProfiles[0];
  store.saveSettings({ apiKey: 'first-key' });
  const second = createProfile(store, { apiKey: 'second-key', demoMode: true });
  store.selectModelProfile(second.id);
  store.saveSettings({
    baseUrl: 'https://changed.example/v1',
    model: 'changed-model',
    demoMode: false,
    apiKey: 'changed-second-key',
    transcriptionApiKey: 'separate-global-key',
    role: '架构师',
  });
  let selected = store.snapshot().modelProfiles.find((profile) => profile.id === second.id);
  assert.equal(selected.baseUrl, 'https://changed.example/v1');
  assert.equal(selected.model, 'changed-model');
  assert.equal(selected.demoMode, false);
  assert.equal(selected.hasApiKey, true);
  assert.equal(store.credential(), 'changed-second-key');
  const vault = JSON.parse(fs.readFileSync(store.file, 'utf8')).vault;
  store.saveSettings({ transparentTextOpacity: 35, transparentBackgroundOpacity: 61 });
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')).vault, vault);

  store = new Store(directory, encryption);
  selected = store.snapshot().modelProfiles.find((profile) => profile.id === second.id);
  assert.equal(store.credential(), 'changed-second-key');
  assert.equal(selected.model, 'changed-model');
  store.selectModelProfile(first.id);
  assert.equal(store.credential(), 'first-key');
  assert.equal(store.settings().model, first.model);
  assert.equal(store.settings().role, '架构师');
  assert.equal(store.credential('transcriptionApiKey'), 'separate-global-key');
  store.saveSettings({ clearApiKey: true });
  assert.equal(store.snapshot().modelProfiles[0].hasApiKey, false);
  store.selectModelProfile(second.id);
  assert.equal(store.credential(), 'changed-second-key');
});

test('deleting models removes their encrypted keys while conversations and other settings survive', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'first-key', transcriptionApiKey: 'transcription-key' });
  const first = store.snapshot().modelProfiles[0];
  const second = createProfile(store, { apiKey: 'second-key' });
  const third = createProfile(store, { apiKey: 'third-key' });
  const sessionId = store.snapshot().activeSessionId;
  store.appendAnswer(sessionId, '保留的问题', { content: '保留的回答' }, 'text');
  const sessions = store.snapshot().sessions;

  store.deleteModelProfile(third.id);
  assert.equal(store.credential(), 'first-key');
  assert.equal(store.snapshot().activeModelProfileId, first.id);
  assert.deepEqual(store.snapshot().sessions, sessions);
  store.selectModelProfile(second.id);
  store.deleteModelProfile(second.id);
  assert.equal(store.snapshot().activeModelProfileId, first.id);
  assert.equal(store.credential(), 'first-key');
  assert.equal(store.credential('transcriptionApiKey'), 'transcription-key');
  const diskText = fs.readFileSync(store.file, 'utf8');
  for (const key of ['second-key', 'third-key']) {
    assert.equal(diskText.includes(encryption.encryptString(key).toString('base64')), false);
  }
  store = new Store(directory, encryption);
  assert.deepEqual(store.snapshot().sessions, sessions);
  assert.equal(store.snapshot().modelProfiles.length, 1);
  assertNoChanges(store, () => store.deleteModelProfile(first.id), /至少需要保留/);
  assertNoChanges(store, () => store.selectModelProfile(second.id), /没有找到/);
  assertNoChanges(store, () => store.deleteModelProfile(second.id), /没有找到/);
});

test('clearing conversations preserves all model profiles and keys across restart', (t) => {
  const directory = temporary(t);
  let store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'first-key' });
  const second = createProfile(store, { apiKey: 'second-key' });
  store.selectModelProfile(second.id);
  store.appendAnswer(store.snapshot().activeSessionId, '应清除的问题', { content: '应清除的回答' });
  const profiles = store.snapshot().modelProfiles;
  const vault = JSON.parse(fs.readFileSync(store.file, 'utf8')).vault;
  store.clearSessions();
  store = new Store(directory, encryption);
  assert.deepEqual(store.snapshot().modelProfiles, profiles);
  assert.equal(store.snapshot().activeModelProfileId, second.id);
  assert.equal(store.credential(), 'second-key');
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')).vault, vault);
  assert.deepEqual(store.snapshot().sessions[0].messages, []);
});

test('invalid model updates are rejected atomically and never write unencrypted keys', (t) => {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({ apiKey: 'keep-current-key' });
  const valid = { name: '新配置', baseUrl: 'https://new.example/v1', model: 'new-model' };
  const invalid = [
    null,
    [],
    {},
    { ...valid, id: 'unknown-profile' },
    { ...valid, id: '../invalid' },
    { ...valid, id: '__proto__' },
    { ...valid, name: '' },
    { ...valid, name: ' '.repeat(3) },
    { ...valid, name: '长'.repeat(81) },
    { ...valid, baseUrl: '' },
    { ...valid, baseUrl: 'x'.repeat(513) },
    { ...valid, model: '' },
    { ...valid, model: 'x'.repeat(161) },
    { ...valid, demoMode: 'false' },
    { ...valid, apiKey: null },
    { ...valid, apiKey: 12 },
    { ...valid, apiKey: 'x'.repeat(2049) },
    { ...valid, clearApiKey: 'true' },
    { ...valid, settings: { resume: 'do not save unrelated fields' } },
    { ...valid, vault: { apiKey: 'do not save plaintext' } },
  ];
  for (const input of invalid) {
    assertNoChanges(store, () => store.saveModelProfile(input));
  }
  const unavailable = new Store(store.directory, {
    ...encryption,
    isEncryptionAvailable: () => false,
  });
  assertNoChanges(
    unavailable,
    () => unavailable.saveModelProfile({ ...valid, apiKey: 'must-never-be-written' }),
    /加密/,
  );
  assert.equal(unavailable.credential(), 'keep-current-key');
});

test('the model count limit rejects extra configurations while existing ones remain editable', (t) => {
  const store = new Store(temporary(t), encryption);
  for (let index = 1; index < 50; index += 1) {
    createProfile(store, { name: `配置 ${index}` });
  }
  assert.equal(store.snapshot().modelProfiles.length, 50);
  assertNoChanges(store, () => createProfile(store), /最多保存 50/);
  const last = store.snapshot().modelProfiles.at(-1);
  store.saveModelProfile(editable(last, { name: '仍可编辑' }));
  assert.equal(store.snapshot().modelProfiles.at(-1).name, '仍可编辑');
});

test('malformed saved profiles are left intact instead of dropping models or encrypted keys', (t) => {
  const directory = temporary(t);
  const store = new Store(directory, encryption);
  store.saveSettings({ apiKey: 'saved-key' });
  const saved = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const mutations = [
    (data) => {
      data.modelProfiles = [];
    },
    (data) => {
      data.modelProfiles.push({ ...data.modelProfiles[0] });
    },
    (data) => {
      data.activeModelProfileId = 'missing';
    },
    (data) => {
      data.modelProfiles[0].name = '';
    },
    (data) => {
      data.modelProfiles[0].demoMode = 'false';
    },
    (data) => {
      data.modelProfiles[0].apiKey = 'invalid-plaintext';
    },
    (data) => {
      data.vault.modelProfiles.missing = 'orphan-key';
    },
    (data) => {
      data.vault.modelProfiles = [];
    },
    (data) => {
      data.vault.apiKey = 'mismatched-key';
    },
    (data) => {
      delete data.activeModelProfileId;
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(saved);
    mutate(invalid);
    const serialized = JSON.stringify(invalid, null, 2);
    fs.writeFileSync(store.file, serialized);
    assert.throws(() => new Store(directory, encryption), /先备份/);
    assert.equal(fs.readFileSync(store.file, 'utf8'), serialized);
  }
});

test('failed disk replacement never changes model selection, keys or the in-memory model list', (t) => {
  const store = new Store(temporary(t), encryption);
  store.saveSettings({ apiKey: 'first-key' });
  const second = createProfile(store, { apiKey: 'second-key' });
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === store.file) throw new Error('simulated atomic replacement failure');
    return rename(source, target);
  });
  assertNoChanges(store, () => store.selectModelProfile(second.id), /无法保存本地数据/);
  assertNoChanges(store, () => store.deleteModelProfile(second.id), /无法保存本地数据/);
  assertNoChanges(
    store,
    () => store.saveModelProfile(editable(second, { apiKey: 'rejected-new-key' })),
    /无法保存本地数据/,
  );
  assert.equal(store.credential(), 'first-key');
  mock.mock.restore();
  assert.deepEqual(new Store(store.directory, encryption).snapshot(), store.snapshot());
});
