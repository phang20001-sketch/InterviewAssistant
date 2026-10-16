<script setup>
import appMark from '../../../../assets/icon.svg';
import { computed } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import AppIcon from '../common/AppIcon.vue';

const { state, currentView, isBusy, navigate } = useWorkspace();
const sections = [
  { view: 'assistant', name: '面试助手', icon: 'sparkles' },
  { view: 'mock', name: '模拟面试', icon: 'mic' },
  { view: 'library', name: '题库练习', icon: 'book' },
  { view: 'history', name: '面试记录', icon: 'history' },
];
const historyCount = computed(
  () =>
    state.value?.sessions.filter((session) => session.messages?.length || session.practice)
      .length || 0,
);
const version = computed(() => state.value?.appInfo?.version || '1.0.0');
</script>

<template>
  <aside class="sidebar">
    <a
      class="brand"
      href="#assistant"
      aria-label="面试工作台首页"
      @click.prevent="navigate('assistant')"
    >
      <img class="brand-symbol" :src="appMark" alt="" />
      <span class="brand-copy">面试工作台<small>INTERVIEW STUDIO</small></span>
    </a>
    <div class="workspace-badge">
      <span class="workspace-avatar">我</span>
      <span>我的工作空间<small>个人 · 本地存储</small></span>
      <span class="workspace-chevron">⌄</span>
    </div>
    <div class="nav-label">WORKSPACE</div>
    <nav id="main-nav" aria-label="主导航">
      <button
        v-for="section in sections"
        :key="section.view"
        class="nav-item"
        :class="{ active: currentView === section.view }"
        :data-view="section.view"
        :disabled="isBusy"
        @click="navigate(section.view)"
      >
        <AppIcon :name="section.icon" />
        <span>{{ section.name }}</span>
        <span v-if="section.view === 'assistant'" class="nav-key">AI</span>
        <span v-else-if="section.view === 'mock'" class="nav-tag">练习</span>
        <span v-else-if="section.view === 'history'" id="history-count" class="nav-count">
          {{ historyCount }}
        </span>
      </button>
    </nav>
    <div class="sidebar-divider"></div>
    <button
      class="nav-item"
      :class="{ active: currentView === 'settings' }"
      data-view="settings"
      :disabled="isBusy"
      @click="navigate('settings')"
    >
      <AppIcon name="sliders" />
      <span>模型与设置</span>
    </button>
    <div class="sidebar-spacer"></div>
    <div class="practice-card">
      <span class="practice-orbit" aria-hidden="true"><AppIcon name="message" /></span>
      <strong>准备充分，自在表达。</strong>
      <p>让每一次练习，都离理想机会更近。</p>
      <button id="sidebar-practice" :disabled="isBusy" @click="navigate('mock')">
        开始一场模拟 <span aria-hidden="true">↗</span>
      </button>
    </div>
    <div class="sidebar-footer">
      <span class="status-dot"></span>
      <span>本地工作空间</span>
      <span id="app-version">v{{ version }}</span>
    </div>
  </aside>
</template>
