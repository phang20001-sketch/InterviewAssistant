<script setup>
import { computed } from 'vue';
import { modifierLabel } from '../../services/platform.js';
import AppIcon from '../../components/common/AppIcon.vue';
import ResumeStatus from '../../components/common/ResumeStatus.vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import AnswerThread from './components/AnswerThread.vue';
import QuestionEditor from './components/QuestionEditor.vue';
import ScreenPicker from './components/ScreenPicker.vue';

const { state, currentView, isBusy, navigate, newSession } = useWorkspace();

const demoMode = computed(() => Boolean(state.value?.settings.demoMode));
const modelName = computed(() =>
  demoMode.value ? '演示模型' : state.value?.settings.model || '未配置模型',
);
</script>

<template>
  <section
    class="page-view"
    id="view-assistant"
    aria-labelledby="assistant-title"
    :hidden="currentView !== 'assistant'"
  >
    <div class="page-heading">
      <div>
        <div class="eyebrow">INTERVIEW WORKSPACE</div>
        <h1 id="assistant-title">
          从容面对，每一个问题
          <AppIcon class="heading-star" name="message" />
        </h1>
        <p>理清思路，组织答案，把最好的自己表达出来。</p>
      </div>
      <div class="heading-actions">
        <button
          class="button model-button"
          id="open-model-settings"
          :disabled="isBusy"
          @click="navigate('settings')"
        >
          <span class="model-dot"></span>
          <span id="model-name">{{ modelName }}</span>
          <AppIcon name="chevron-down" />
        </button>
        <button class="button primary" id="new-session" :disabled="isBusy" @click="newSession()">
          <AppIcon name="plus" />
          新会话
        </button>
      </div>
    </div>

    <div class="demo-banner" id="demo-banner" :hidden="!demoMode">
      <AppIcon class="demo-icon" name="beaker" />
      <div>
        <strong>现在是演示模式</strong>
        <span>体验内置示例回答；连接你自己的模型后，即可获取 AI 回答。</span>
      </div>
      <button id="configure-model" :disabled="isBusy" @click="navigate('settings')">
        连接模型
        <span aria-hidden="true">↗</span>
      </button>
    </div>

    <ResumeStatus compact />

    <div class="assistant-grid">
      <QuestionEditor />
      <AnswerThread />
    </div>

    <div class="workspace-bottom">
      <span>
        <AppIcon name="keyboard" />
        <kbd>{{ modifierLabel }} Shift Enter</kbd>
        回答
        <span class="shortcut-separator">·</span>
        <kbd>{{ modifierLabel }} E</kbd>
        截屏作答
        <span class="shortcut-separator">·</span>
        <kbd>{{ modifierLabel }} R</kbd>
        清空聊天
      </span>
      <span>每一步准备，都算数。</span>
    </div>
  </section>

  <ScreenPicker />
</template>
