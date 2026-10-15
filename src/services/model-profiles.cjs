const { randomUUID } = require('node:crypto');

const MAX_MODEL_PROFILES = 50;
const connectionKeys = ['baseUrl', 'model', 'demoMode'];
const profileKeys = new Set(['id', 'name', ...connectionKeys]);
const inputKeys = new Set([...profileKeys, 'apiKey', 'clearApiKey']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateId(id) {
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) ||
    ['constructor', 'prototype', '__proto__'].includes(id)
  )
    throw new Error('模型配置标识无效。');
}

function requiredText(value, maximum, label) {
  if (typeof value !== 'string' || value.length > maximum || !value.trim())
    throw new Error(`${label}不能为空，且不能超过 ${maximum} 个字符。`);
  return value.trim();
}

function validateProfile(profile) {
  if (!isRecord(profile) || Object.keys(profile).some((key) => !profileKeys.has(key)))
    throw new Error('模型配置格式无效。');
  validateId(profile.id);
  requiredText(profile.name, 80, '模型配置名称');
  requiredText(profile.baseUrl, 512, 'API 地址');
  requiredText(profile.model, 160, '模型名称');
  if (typeof profile.demoMode !== 'boolean') throw new Error('模型演示选项格式无效。');
}

function validateEncryptedKey(value) {
  if (typeof value !== 'string' || !value || value.length > 16384)
    throw new Error('模型密钥存储格式无效。');
}

function activeProfile(data) {
  const profile = data.modelProfiles.find((item) => item.id === data.activeModelProfileId);
  if (!profile) throw new Error('没有找到当前模型配置。');
  return profile;
}

function activateProfile(data, profile) {
  data.activeModelProfileId = profile.id;
  for (const key of connectionKeys) data.settings[key] = profile[key];
  const encrypted = data.vault.modelProfiles[profile.id];
  if (encrypted) data.vault.apiKey = encrypted;
  else delete data.vault.apiKey;
}

function initializeModelProfiles(data) {
  if (data.vault === undefined) data.vault = {};
  if (!isRecord(data.vault)) throw new Error('密钥存储格式无效。');

  if (data.modelProfiles === undefined) {
    if (data.activeModelProfileId !== undefined) throw new Error('当前模型配置数据不完整。');
    if (
      data.vault.modelProfiles !== undefined &&
      (!isRecord(data.vault.modelProfiles) || Object.keys(data.vault.modelProfiles).length)
    )
      throw new Error('模型密钥缺少对应配置。');

    const profile = {
      id: 'default-model',
      name: '默认模型',
      baseUrl: data.settings.baseUrl,
      model: data.settings.model,
      demoMode: data.settings.demoMode,
    };
    validateProfile(profile);
    data.modelProfiles = [profile];
    data.activeModelProfileId = profile.id;
    data.vault.modelProfiles = {};
    if (data.vault.apiKey !== undefined) {
      validateEncryptedKey(data.vault.apiKey);
      data.vault.modelProfiles[profile.id] = data.vault.apiKey;
    }
    return;
  }

  if (
    !Array.isArray(data.modelProfiles) ||
    !data.modelProfiles.length ||
    data.modelProfiles.length > MAX_MODEL_PROFILES
  )
    throw new Error(`模型配置数量必须在 1 到 ${MAX_MODEL_PROFILES} 之间。`);

  for (const profile of data.modelProfiles) validateProfile(profile);
  const ids = new Set(data.modelProfiles.map((profile) => profile.id));
  if (ids.size !== data.modelProfiles.length) throw new Error('模型配置标识重复。');
  validateId(data.activeModelProfileId);
  const selected = activeProfile(data);
  if (!isRecord(data.vault.modelProfiles)) throw new Error('模型密钥存储格式无效。');
  for (const [id, encrypted] of Object.entries(data.vault.modelProfiles)) {
    if (!ids.has(id)) throw new Error('模型密钥缺少对应配置。');
    validateEncryptedKey(encrypted);
  }
  const currentKey = data.vault.modelProfiles[selected.id];
  if (data.vault.apiKey !== currentKey) throw new Error('当前模型密钥数据不一致。');
  activateProfile(data, selected);
}

function syncActiveModelProfile(data) {
  const profile = activeProfile(data);
  for (const key of connectionKeys) profile[key] = data.settings[key];
  validateProfile(profile);
  if (data.vault.apiKey) data.vault.modelProfiles[profile.id] = data.vault.apiKey;
  else delete data.vault.modelProfiles[profile.id];
}

function encryptedInputKey(input, encryption, previousKey) {
  if (Object.hasOwn(input, 'clearApiKey') && typeof input.clearApiKey !== 'boolean')
    throw new Error('清除 API Key 选项格式无效。');
  let encrypted = input.clearApiKey ? undefined : previousKey;
  if (Object.hasOwn(input, 'apiKey')) {
    if (typeof input.apiKey !== 'string' || input.apiKey.length > 2048)
      throw new Error('API Key 格式无效。');
    const secret = input.apiKey.trim();
    if (secret) {
      if (!encryption.isEncryptionAvailable())
        throw new Error('系统加密服务当前不可用，无法保存 API Key。');
      encrypted = encryption.encryptString(secret).toString('base64');
    }
  }
  return encrypted;
}

function saveModelProfile(data, input, encryption) {
  if (!isRecord(input) || Object.keys(input).some((key) => !inputKeys.has(key)))
    throw new Error('模型配置参数无效。');

  let existing;
  if (Object.hasOwn(input, 'id')) {
    validateId(input.id);
    existing = data.modelProfiles.find((profile) => profile.id === input.id);
    if (!existing) throw new Error('没有找到这条模型配置。');
  } else if (data.modelProfiles.length >= MAX_MODEL_PROFILES) {
    throw new Error(`最多保存 ${MAX_MODEL_PROFILES} 个模型配置，请先删除不用的配置。`);
  }
  const profile = {
    id: existing ? existing.id : randomUUID(),
    name: requiredText(input.name, 80, '模型配置名称'),
    baseUrl: requiredText(input.baseUrl, 512, 'API 地址'),
    model: requiredText(input.model, 160, '模型名称'),
    demoMode: Object.hasOwn(input, 'demoMode') ? input.demoMode : (existing?.demoMode ?? false),
  };
  validateProfile(profile);
  const encrypted = encryptedInputKey(input, encryption, data.vault.modelProfiles[profile.id]);

  if (existing) data.modelProfiles[data.modelProfiles.indexOf(existing)] = profile;
  else data.modelProfiles.push(profile);
  if (encrypted) data.vault.modelProfiles[profile.id] = encrypted;
  else delete data.vault.modelProfiles[profile.id];
  if (profile.id === data.activeModelProfileId) activateProfile(data, profile);
}

function selectModelProfile(data, id) {
  validateId(id);
  const selected = data.modelProfiles.find((profile) => profile.id === id);
  if (!selected) throw new Error('没有找到这条模型配置。');
  activateProfile(data, selected);
}

function deleteModelProfile(data, id) {
  validateId(id);
  if (!data.modelProfiles.some((profile) => profile.id === id))
    throw new Error('没有找到这条模型配置。');
  if (data.modelProfiles.length === 1) throw new Error('至少需要保留一个模型配置。');
  data.modelProfiles = data.modelProfiles.filter((profile) => profile.id !== id);
  delete data.vault.modelProfiles[id];
  if (data.activeModelProfileId === id) activateProfile(data, data.modelProfiles[0]);
}

function modelProfileSnapshot(data) {
  return data.modelProfiles.map((profile) => ({
    ...profile,
    hasApiKey: Boolean(data.vault.modelProfiles[profile.id]),
  }));
}

module.exports = {
  initializeModelProfiles,
  syncActiveModelProfile,
  saveModelProfile,
  selectModelProfile,
  deleteModelProfile,
  modelProfileSnapshot,
};
