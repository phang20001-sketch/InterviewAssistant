<script setup>
import { onBeforeUnmount, onMounted, provide } from 'vue';
import DesktopTitleBar from './components/layout/DesktopTitleBar.vue';
import AppSidebar from './components/layout/AppSidebar.vue';
import WorkspaceHeader from './components/layout/WorkspaceHeader.vue';
import TransparencyToolbar from './components/layout/TransparencyToolbar.vue';
import ToastList from './components/layout/ToastList.vue';
import AssistantPage from './pages/assistant/AssistantPage.vue';
import MockPage from './pages/mock/MockPage.vue';
import LibraryPage from './pages/library/LibraryPage.vue';
import HistoryPage from './pages/history/HistoryPage.vue';
import SettingsPage from './pages/settings/SettingsPage.vue';
import { createWorkspace, workspaceKey } from './composables/useWorkspace.js';

const workspace = createWorkspace();
provide(workspaceKey, workspace);
const { startupError, isBusy, bootstrap, dispose } = workspace;

onMounted(() => {
  window.addEventListener('beforeunload', dispose);
  bootstrap();
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', dispose);
  dispose();
});
</script>

<template>
  <DesktopTitleBar />
  <TransparencyToolbar />
  <div class="app-shell">
    <AppSidebar />
    <main class="main-panel">
      <WorkspaceHeader />
      <div class="page-scroll">
        <div id="startup-error" class="startup-error" role="alert" :hidden="!startupError">
          <span id="startup-error-message">{{ startupError }}</span>
          <button id="retry-startup" class="button" :disabled="isBusy" @click="bootstrap">
            重试
          </button>
        </div>
        <AssistantPage />
        <MockPage />
        <LibraryPage />
        <HistoryPage />
        <SettingsPage />
      </div>
    </main>
  </div>
  <ToastList />
</template>
