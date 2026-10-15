<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';
import { useModelProfiles } from '../useModelProfiles.js';
import ModelProfileEditor from './ModelProfileEditor.vue';

const {
  profiles,
  activeProfileId,
  activeProfile,
  keyStatus,
  disabled,
  testingProfileId,
  savingAndTesting,
  verificationResults,
  editorOpen,
  editingId,
  draft,
  credential,
  openEditor,
  closeEditor,
  toggleCredentialEditing,
  saveProfile,
  testProfile,
  selectProfile,
  deleteProfile,
} = useModelProfiles();
</script>

<template>
  <section class="card settings-card model-manager" aria-labelledby="model-manager-title">
    <div class="card-header model-manager-header">
      <div class="section-title">
        <AppIcon name="cpu" />
        <h2 id="model-manager-title">模型管理</h2>
        <span class="subtle-tag">{{ profiles.length }} 个配置</span>
      </div>
      <button
        id="add-model-profile"
        type="button"
        class="button small"
        :disabled="disabled"
        @click="openEditor()"
      >
        <AppIcon name="plus" />添加模型
      </button>
    </div>
    <div class="model-manager-body">
      <div v-if="activeProfile" class="model-current-summary">
        <div>
          <span class="model-current-label">当前问答模型</span>
          <strong>{{ activeProfile.name }}</strong>
          <p>{{ activeProfile.model }}</p>
        </div>
        <span id="key-status" class="subtle-tag">{{ keyStatus }}</span>
      </div>
      <p class="model-manager-hint">
        在这里添加、编辑和验证模型。每个配置独立保存地址、模型名称和 Key，点击「使用」切换。
        验证会实际请求对应模型，成功后关闭该配置的演示模式；验证其他配置不会切换当前模型。
      </p>
      <div class="model-profile-list">
        <article
          v-for="profile in profiles"
          :key="profile.id"
          class="model-profile-row"
          :class="{ 'is-active': profile.id === activeProfileId }"
          :data-profile-id="profile.id"
        >
          <div class="model-profile-details">
            <div class="model-profile-heading">
              <h3>{{ profile.name }}</h3>
              <span v-if="profile.id === activeProfileId" class="model-profile-active"
                >当前使用</span
              >
            </div>
            <p class="model-profile-model">{{ profile.model }}</p>
            <p class="model-profile-address">{{ profile.baseUrl }}</p>
            <div class="model-profile-status">
              <span>{{ profile.hasApiKey ? 'Key 已保存' : '未配置 Key' }}</span>
              <span>{{ profile.demoMode ? '演示模式 · 本地示例' : 'AI 模式 · 请求模型' }}</span>
              <span
                v-if="verificationResults[profile.id]"
                class="model-profile-verification"
                :class="{ 'is-error': verificationResults[profile.id] === 'error' }"
                role="status"
              >
                {{
                  verificationResults[profile.id] === 'success' ? '本次验证通过' : '本次验证失败'
                }}
              </span>
            </div>
          </div>
          <div class="model-profile-actions">
            <button
              type="button"
              class="button small test-model-profile"
              :disabled="disabled"
              :aria-label="`验证模型 ${profile.name} 的连接`"
              @click="testProfile(profile)"
            >
              <AppIcon name="link" />
              {{ testingProfileId === profile.id ? '验证中…' : '验证连接' }}
            </button>
            <button
              type="button"
              class="button small use-model-profile"
              :class="{ primary: profile.id !== activeProfileId }"
              :disabled="disabled || profile.id === activeProfileId"
              :aria-label="`使用模型 ${profile.name}`"
              @click="selectProfile(profile)"
            >
              {{ profile.id === activeProfileId ? '使用中' : '使用' }}
            </button>
            <button
              type="button"
              class="button small edit-model-profile"
              :disabled="disabled"
              :aria-label="`编辑模型 ${profile.name}`"
              @click="openEditor(profile)"
            >
              编辑
            </button>
            <button
              type="button"
              class="button small delete-model-profile"
              :disabled="disabled || profiles.length <= 1"
              :title="profiles.length <= 1 ? '至少保留一个模型配置' : ''"
              :aria-label="`删除模型 ${profile.name}`"
              @click="deleteProfile(profile)"
            >
              删除
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
  <ModelProfileEditor
    :open="editorOpen"
    :editing="Boolean(editingId)"
    :draft="draft"
    :credential="credential"
    :disabled="disabled"
    :saving-and-testing="savingAndTesting"
    @close="closeEditor"
    @save="saveProfile()"
    @save-test="saveProfile(true)"
    @toggle-credential="toggleCredentialEditing"
  />
</template>
