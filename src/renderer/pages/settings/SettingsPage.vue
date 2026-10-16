<script setup>
import AppIcon from '../../components/common/AppIcon.vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { useSettings } from './useSettings.js';
import DesktopSettingsCard from './components/DesktopSettingsCard.vue';
import InterviewPreferencesCard from './components/InterviewPreferencesCard.vue';
import ModelManager from './components/ModelManager.vue';
import TranscriptionSettingsCard from './components/TranscriptionSettingsCard.vue';

const { currentView } = useWorkspace();
const {
  form,
  draft,
  credentials,
  isBusy,
  toggleCredentialEditing,
  saveSettings,
  importResume,
  openDataFolder,
} = useSettings();
</script>

<template>
  <section
    id="view-settings"
    class="page-view"
    aria-labelledby="settings-title"
    :hidden="currentView !== 'settings'"
  >
    <div class="page-heading">
      <div>
        <div class="eyebrow">MAKE IT YOUR OWN</div>
        <h1 id="settings-title">
          配置你的专属面试助手<AppIcon class="heading-star" name="message" />
        </h1>
        <p>管理常用模型，结合目标岗位和个人经历，定制你的面试练习。</p>
      </div>
      <button
        id="save-settings"
        type="submit"
        form="settings-form"
        class="button primary"
        :disabled="isBusy"
      >
        <AppIcon name="check" />保存设置
      </button>
    </div>
    <ModelManager />
    <form id="settings-form" ref="form" class="settings-grid" @submit.prevent="saveSettings()">
      <InterviewPreferencesCard :draft="draft" :disabled="isBusy" @import-resume="importResume" />
      <TranscriptionSettingsCard
        :draft="draft"
        :credential="credentials.transcriptionApiKey"
        :disabled="isBusy"
        @toggle-credential="toggleCredentialEditing('transcriptionApiKey')"
      />
      <DesktopSettingsCard :draft="draft" :disabled="isBusy" @open-data-folder="openDataFolder" />
    </form>
  </section>
</template>
