<script setup>
import { computed, ref } from 'vue';
import AppIcon from '../../components/common/AppIcon.vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import HistoryRow from './components/HistoryRow.vue';

const {
  state,
  currentView,
  isBusy,
  isRecording,
  switchSession,
  exportSession,
  deleteSession,
  clearAllSessions,
  navigate,
} = useWorkspace();
const search = ref('');
const sessions = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return [...(state.value?.sessions || [])]
    .filter((session) => session.messages?.length > 0 || session.practice)
    .filter((session) =>
      `${session.title || ''} ${session.messages.map((message) => message.content).join(' ')} ${
        session.practice?.questions?.map((question) => question.title).join(' ') || ''
      }`
        .toLocaleLowerCase()
        .includes(query),
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
});
</script>

<template>
  <section
    id="view-history"
    class="page-view"
    aria-labelledby="history-title"
    :hidden="currentView !== 'history'"
  >
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR GROWTH, ONE CONVERSATION AT A TIME</div>
        <h1 id="history-title">
          每一次思考，都有迹可循<AppIcon class="heading-star" name="message" />
        </h1>
        <p>回看问题与回答，留住值得再次练习的思路。</p>
      </div>
      <div class="history-heading-actions">
        <label class="search-field">
          <AppIcon name="search" />
          <input
            id="history-search"
            v-model="search"
            placeholder="搜索会话…"
            aria-label="搜索会话记录"
            :disabled="isBusy"
          />
        </label>
        <button
          id="clear-all-sessions"
          type="button"
          class="button history-clear-button"
          :disabled="!state || isBusy || isRecording"
          @click="clearAllSessions"
        >
          <AppIcon name="trash" />
          清除所有会话
        </button>
      </div>
    </div>
    <div id="history-list" class="history-list">
      <HistoryRow
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :disabled="isBusy"
        @open="switchSession"
        @export="exportSession"
        @delete="deleteSession"
      />
    </div>
    <div id="history-empty" class="simple-empty history-empty" :hidden="sessions.length > 0">
      <span class="simple-empty-icon"><AppIcon name="history" /></span>
      <h3>{{ search.trim() ? '没有找到匹配的会话' : '你的第一条记录，还在路上' }}</h3>
      <p>
        {{ search.trim() ? '换一个关键词，再试一次。' : '在面试助手中提问，或开始一次模拟面试。' }}
      </p>
      <button
        id="history-start"
        class="button primary"
        :disabled="isBusy"
        @click="navigate('assistant')"
      >
        开始提问
      </button>
    </div>
  </section>
</template>
