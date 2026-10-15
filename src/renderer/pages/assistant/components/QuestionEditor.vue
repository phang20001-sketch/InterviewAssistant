<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';
import { useWorkspace } from '../../../composables/useWorkspace.js';
import VoiceRecorder from './VoiceRecorder.vue';

const {
  state,
  currentMode,
  question,
  imageData,
  pendingSource,
  isBusy,
  questionInputRef,
  recorder,
  setMode,
  askQuestion,
  chooseScreens,
  removeScreenshot,
} = useWorkspace();

const input = ref(null);
const { isRecording } = recorder;

const inputModes = [
  { value: 'text', icon: 'type', label: '文字输入' },
  { value: 'screenshot', icon: 'scan', label: '截图识别' },
  { value: 'voice', icon: 'mic', label: '语音转写' },
];

const quickQuestions = [
  {
    title: '解释一下 JavaScript 闭包',
    question: '请解释 JavaScript 中的闭包及其应用场景。',
  },
  {
    title: '如何用 STAR 法则讲好项目经历',
    question: '请用 STAR 法则介绍一次你解决复杂问题的经历。',
  },
];

const sourceLabel = computed(
  () =>
    ({
      text: '文字输入',
      screenshot: '可附文字说明',
      voice: '转写后可编辑',
    })[currentMode.value],
);

const inputPlaceholder = computed(() =>
  imageData.value
    ? '描述你希望分析的问题，例如：请分析截图中的题目并说明解题思路。'
    : '输入一个面试问题，或者描述你遇到的难题…\n\n例如：如何理解 JavaScript 的闭包？',
);

const canAsk = computed(
  () =>
    Boolean(state.value) &&
    !isBusy.value &&
    !isRecording.value &&
    Boolean(imageData.value || question.value.trim()),
);

function clearQuestion() {
  question.value = '';
  removeScreenshot();
}

async function selectQuestion(value) {
  question.value = value;
  pendingSource.value = 'text';
  setMode('text');
  await nextTick();
  input.value?.focus();
}

onMounted(() => {
  questionInputRef.value = input.value;
});

onBeforeUnmount(() => {
  if (questionInputRef.value === input.value) questionInputRef.value = null;
});
</script>

<template>
  <section class="card question-card">
    <div class="card-header">
      <div class="section-title">
        <span class="section-dot"></span>
        <h2>问题工作区</h2>
      </div>
      <span class="subtle-tag" id="session-status">
        {{ isBusy ? '正在处理' : '准备就绪' }}
      </span>
    </div>

    <div class="mode-tabs" role="tablist" aria-label="输入方式">
      <button
        v-for="mode in inputModes"
        :key="mode.value"
        class="mode-tab"
        :class="{ active: currentMode === mode.value }"
        :data-mode="mode.value"
        :aria-selected="currentMode === mode.value"
        :disabled="isBusy"
        role="tab"
        @click="setMode(mode.value)"
      >
        <AppIcon :name="mode.icon" />
        {{ mode.label }}
      </button>
    </div>

    <div class="question-content">
      <VoiceRecorder :hidden="currentMode !== 'voice'" />

      <div
        class="screenshot-panel"
        id="screenshot-panel"
        :hidden="currentMode !== 'screenshot' || Boolean(imageData)"
      >
        <button class="screenshot-pick" id="pick-screen" :disabled="isBusy" @click="chooseScreens">
          <AppIcon class="capture-icon" name="scan" />
          <strong>选择屏幕，捕获问题</strong>
          <span>截图将作为本次提问的附件</span>
          <span class="button small">
            选择屏幕
            <AppIcon name="arrow-right" />
          </span>
        </button>
      </div>

      <div class="image-preview" id="image-preview" :hidden="!imageData">
        <img id="screenshot-preview" :src="imageData || undefined" alt="待分析的屏幕截图" />
        <button
          id="remove-screenshot"
          class="icon-button image-remove"
          aria-label="移除截图"
          :disabled="isBusy"
          @click="removeScreenshot"
        >
          <AppIcon name="x" />
        </button>
        <span class="image-label">
          <AppIcon name="image" />
          已添加截图
        </span>
      </div>

      <label class="input-label" for="question-input">
        面试官的问题
        <span id="input-source-label">{{ sourceLabel }}</span>
      </label>
      <textarea
        ref="input"
        v-model="question"
        id="question-input"
        class="question-input"
        maxlength="12000"
        :placeholder="inputPlaceholder"
        :disabled="isBusy"
      ></textarea>
      <div class="input-meta">
        <span>
          <AppIcon name="lock" />
          会话保存在本机
        </span>
        <span id="question-count">{{ question.length }} / 12000</span>
      </div>
      <div class="question-actions">
        <button id="clear-question" class="text-button" :disabled="isBusy" @click="clearQuestion">
          清空
        </button>
        <button
          id="ask-question"
          class="button primary ask-button"
          :disabled="!canAsk"
          @click="askQuestion"
        >
          <AppIcon name="sparkles" />
          <span id="ask-label">{{ isBusy ? '正在生成' : '生成回答' }}</span>
          <kbd>Ctrl ↵</kbd>
        </button>
      </div>
    </div>

    <div class="quick-question-area">
      <div class="mini-label">
        <AppIcon name="lightbulb" />
        没有灵感？试试这些问题
      </div>
      <button
        v-for="item in quickQuestions"
        :key="item.question"
        class="quick-question"
        :data-question="item.question"
        :disabled="isBusy"
        @click="selectQuestion(item.question)"
      >
        {{ item.title }}
        <span>↗</span>
      </button>
    </div>
  </section>
</template>
