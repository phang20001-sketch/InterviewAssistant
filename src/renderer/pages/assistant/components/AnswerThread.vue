<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';
import MarkdownContent from '../../../components/common/MarkdownContent.vue';
import { useWorkspace } from '../../../composables/useWorkspace.js';

const {
  state,
  assistantSession,
  latestAnswer,
  assistantLoading,
  isBusy,
  question,
  pendingSource,
  questionInputRef,
  setMode,
  exportSession,
  copyAnswer,
} = useWorkspace();

const body = ref(null);
const messages = computed(() => assistantSession.value?.messages || []);
const lastMessage = computed(() => messages.value.at(-1));
const isDemo = computed(() =>
  messages.value.length
    ? Boolean(lastMessage.value?.demo)
    : Boolean(state.value?.settings.demoMode),
);
const footerLabel = computed(() => {
  if (!messages.value.length) return '准备好，随时开始';
  return isDemo.value ? '本地示例回答，仅供练习参考' : 'AI 回答供参考，请结合实际情况判断';
});

async function followUp() {
  setMode('text');
  pendingSource.value = 'text';
  question.value = '请进一步解释上一个回答中的关键点，并给出一个具体的例子。';
  await nextTick();
  questionInputRef.value?.focus();
}

watch(
  [messages, assistantLoading],
  async () => {
    await nextTick();
    if (body.value) body.value.scrollTop = body.value.scrollHeight;
  },
  { deep: true },
);
</script>

<template>
  <section class="card answer-card">
    <div class="card-header">
      <div class="section-title">
        <span class="ai-symbol" aria-hidden="true">✳</span>
        <h2>回答与思路</h2>
        <span class="answer-mode-badge" id="answer-mode-badge">
          {{ isDemo ? '示例' : 'AI' }}
        </span>
      </div>
      <div class="answer-header-actions">
        <button
          class="icon-button"
          id="export-current"
          title="导出当前会话"
          aria-label="导出当前会话"
          :disabled="isBusy || !messages.length"
          @click="exportSession(assistantSession?.id)"
        >
          <AppIcon name="download" />
        </button>
        <button
          class="icon-button"
          id="copy-answer"
          title="复制回答"
          aria-label="复制回答"
          :disabled="isBusy || !latestAnswer"
          @click="copyAnswer"
        >
          <AppIcon name="copy" />
        </button>
      </div>
    </div>

    <div ref="body" class="answer-body" id="answer-body">
      <div v-if="assistantLoading" class="answer-loading">
        <span class="loading-spark">✳</span>
        <strong>{{ assistantLoading.title }}</strong>
        <p>{{ assistantLoading.description }}</p>
      </div>

      <template v-else-if="messages.length">
        <article
          v-for="(message, index) in messages"
          :key="message.id || index"
          class="message-block"
        >
          <div class="message-meta">
            <span class="message-avatar">
              {{ message.role === 'assistant' ? '✳' : '我' }}
            </span>
            <strong>{{ message.role === 'assistant' ? '面试助手' : '你的问题' }}</strong>
            <span v-if="message.role === 'assistant' && message.demo" class="demo-message-label">
              本地示例 · 非 AI 生成
            </span>
            <span
              v-if="message.role !== 'assistant' && message.source && message.source !== 'text'"
            >
              {{ message.source === 'screenshot' ? '附截图' : '语音转写' }}
            </span>
          </div>

          <div v-if="message.role !== 'assistant'" class="question-bubble">
            {{ message.content }}
          </div>
          <div
            v-else-if="message.answerFormat === 'numbered-only'"
            class="markdown-content screen-answer-content"
            v-text="message.content"
          ></div>
          <MarkdownContent v-else :content="message.content" />
        </article>
      </template>

      <div v-else class="answer-empty" id="answer-empty">
        <div class="empty-art" aria-hidden="true">
          <span class="empty-art-line line-one"></span>
          <span class="empty-art-line line-two"></span>
          <span class="empty-art-line line-three"></span>
          <span class="empty-art-star">✳</span>
        </div>
        <h3>好答案，从一个好问题开始</h3>
        <p>
          在左侧输入问题，获取清晰的回答思路。<br />
          也可以截图提问，或录下问题后转写。
        </p>
        <div class="answer-capabilities">
          <span><AppIcon name="layers" />结构化回答</span>
          <span><AppIcon name="code" />代码解析</span>
          <span><AppIcon name="message" />追问练习</span>
        </div>
      </div>
    </div>

    <div class="answer-footer">
      <span class="status-dot"></span>
      <span id="answer-footer-label">{{ footerLabel }}</span>
      <button
        id="followup-button"
        class="text-button"
        :disabled="isBusy || !latestAnswer"
        @click="followUp"
      >
        继续追问
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  </section>
</template>
