<script setup>
import { computed } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';

const props = defineProps({
  session: { type: Object, required: true },
  disabled: Boolean,
});
defineEmits(['open', 'export', 'delete']);
const preview = computed(
  () =>
    props.session.practice?.questions?.[0]?.title ||
    props.session.messages.find((message) => message.role === 'user')?.content ||
    '',
);
const rounds = computed(
  () => props.session.messages.filter((message) => message.role === 'user').length,
);
const practiceStatus = computed(() => {
  const practice = props.session.practice;
  if (!practice) return '';
  if (practice.status === 'unparsed') return '已保存模型返回';
  const total = practice.questions.length;
  const answered = practice.reviews.length;
  return practice.status === 'completed' ? `已完成 ${total} 题` : `已答 ${answered} / ${total} 题`;
});
const timestamp = computed(() => {
  const date = new Date(props.session.updatedAt || props.session.createdAt);
  if (Number.isNaN(date.getTime())) return '最近';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
});
</script>

<template>
  <article class="history-row">
    <span class="history-row-icon"
      ><AppIcon :name="session.mode === 'mock' ? 'mic' : 'message'"
    /></span>
    <button class="history-main" :disabled="disabled" @click="$emit('open', session.id)">
      <h3>{{ session.title || '未命名会话' }}</h3>
      <p>{{ preview }}</p>
      <div class="history-metadata">
        <span>{{ session.mode === 'mock' ? '模拟面试' : '面试助手' }}</span>
        <span>{{ practiceStatus || `${rounds} 轮对话` }}</span
        ><span>{{ timestamp }}</span>
      </div>
    </button>
    <div class="history-row-actions">
      <button class="button small" :disabled="disabled" @click="$emit('open', session.id)">
        {{ session.practice?.status === 'completed' ? '查看记录 ↗' : '继续会话 ↗' }}
      </button>
      <button
        class="icon-button"
        title="导出会话"
        aria-label="导出会话"
        :disabled="disabled"
        @click="$emit('export', session.id)"
      >
        <AppIcon name="download" />
      </button>
      <button
        class="icon-button danger"
        title="删除会话"
        aria-label="删除会话"
        :disabled="disabled"
        @click="$emit('delete', session.id)"
      >
        <AppIcon name="trash" />
      </button>
    </div>
  </article>
</template>
