<script setup>
import AppIcon from '../../components/common/AppIcon.vue';
import MarkdownContent from '../../components/common/MarkdownContent.vue';
import ResumeStatus from '../../components/common/ResumeStatus.vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import MockFeedbackPanel from './components/MockFeedbackPanel.vue';
import MockGenerationHistory from './components/MockGenerationHistory.vue';
import MockPreferencesSnapshot from './components/MockPreferencesSnapshot.vue';
import MockQuestionPanel from './components/MockQuestionPanel.vue';
import { useMockPractice } from './useMockPractice.js';

const { currentView } = useWorkspace();
const {
  state,
  isBusy,
  session,
  practice,
  questions,
  reviews,
  messages,
  question,
  answer,
  questionCount,
  progress,
  reviewed,
  completed,
  canNext,
  hasResume,
  modelReady,
  canGenerate,
  canAppend,
  generating,
  appending,
  submitting,
  averageScore,
  scoreCount,
  submit,
  nextQuestion,
  startPractice,
  appendQuestions,
  openSettings,
  openHistory,
} = useMockPractice();
</script>

<template>
  <section
    id="view-mock"
    class="page-view"
    aria-labelledby="mock-title"
    :hidden="currentView !== 'mock'"
  >
    <div class="page-heading">
      <div>
        <div class="eyebrow">PRACTICE MAKES PROGRESS</div>
        <h1 id="mock-title">
          结合简历和偏好，认真练一轮<AppIcon class="heading-star" name="message" />
        </h1>
        <p>AI 结合简历和面试偏好生成问题，逐题点评、打分；问题和整轮记录持续保存在本地。</p>
      </div>
      <div class="mock-generation-actions">
        <label for="mock-question-count">本次题数</label>
        <select id="mock-question-count" v-model.number="questionCount" :disabled="isBusy">
          <option :value="3">3 题</option>
          <option :value="5">5 题</option>
          <option :value="8">8 题</option>
        </select>
        <button id="append-mock" class="button" :disabled="!canAppend" @click="appendQuestions">
          <AppIcon :name="appending ? 'refresh' : 'sparkles'" />
          {{ appending ? '正在追加问题…' : '追加问题' }}
        </button>
        <button
          id="new-mock"
          class="button primary"
          :disabled="!canGenerate"
          @click="startPractice"
        >
          <AppIcon :name="generating ? 'refresh' : 'sparkles'" />
          {{ generating ? '正在准备新的面试…' : '新的面试' }}
        </button>
      </div>
    </div>

    <p id="mock-generation-guidance" class="mock-session-note mock-generation-guidance">
      追加问题沿用本场简历和面试偏好，累加题目并保留作答；新的面试使用当前已保存设置，
      旧场次仍保留在“面试记录”。只有点击这两个按钮才会生成问题。
    </p>

    <ResumeStatus :required="!practice?.resume" />

    <p v-if="practice?.resume && !hasResume" class="mock-session-note">
      本场已保存简历，仍可追加问题和继续作答。上传新的简历后，点击“新的面试”使用。
    </p>

    <div
      v-if="state && !modelReady"
      id="mock-model-notice"
      class="mock-session-note mock-setup-note"
    >
      <div>
        <strong>请先配置真实 AI 模型</strong>
        <p>生成、追加问题和评分需要可用的模型、API Key，并关闭演示模式。</p>
      </div>
      <button class="button small" :disabled="isBusy" @click="openSettings">前往模型设置</button>
    </div>

    <div
      v-if="practice && questions.length"
      id="mock-session-summary"
      class="mock-session-summary"
      :class="{ completed }"
      role="status"
    >
      <div>
        <strong>{{
          completed ? '本场面试已完成并已保存，可继续追加问题' : '本场进度自动保存在本地'
        }}</strong>
        <p>
          已点评 {{ reviews.length }} / {{ questions.length }} 题
          <template v-if="practice.model"> · {{ practice.model }}</template>
          <template v-if="practice.role"> · {{ practice.role }}</template>
        </p>
      </div>
      <div class="mock-summary-actions">
        <span v-if="reviews.length" id="mock-average-score" class="mock-average-score">
          {{ averageScore === null ? '评分未提供' : `平均 ${averageScore} / 100 分` }}
          <small v-if="scoreCount < reviews.length">{{ scoreCount }} 题有有效评分</small>
        </span>
        <button class="text-button" :disabled="isBusy" @click="openHistory">
          <AppIcon name="history" />查看本地记录
        </button>
      </div>
    </div>

    <MockGenerationHistory v-if="practice" :practice="practice" />

    <details v-if="practice?.resume" id="mock-resume-snapshot" class="mock-question-source">
      <summary>查看本场使用的简历</summary>
      <p class="mock-session-note">
        本场追加问题和点评都会参考这份简历及保存的面试偏好。
        <template v-if="practice.role">本场面试岗位：{{ practice.role }}。</template>
      </p>
      <MarkdownContent :content="practice.resume" plain-text />
    </details>

    <MockPreferencesSnapshot v-if="practice" :practice="practice" />

    <section v-if="practice && !questions.length" class="card mock-unparsed-card">
      <div class="card-header">
        <div class="section-title">
          <AppIcon name="message" />
          <h2>模型返回的原始内容</h2>
        </div>
        <span class="subtle-tag">已保存到本地</span>
      </div>
      <div class="mock-unparsed-content">
        <p class="mock-session-note">
          这次回复未识别出可逐题练习的题目，完整回复已保留在上方生成记录。
          可以点击“追加问题”沿用本场资料继续生成，或点击“新的面试”另开一场。
        </p>
      </div>
    </section>

    <div v-else class="mock-grid">
      <MockQuestionPanel
        v-model:answer="answer"
        :question="question"
        :progress="progress"
        :disabled="isBusy"
        :reviewed="reviewed"
        :completed="completed"
        :generating="generating"
        :has-resume="hasResume"
        :legacy="Boolean(session && !practice && messages.length)"
        @submit="submit"
      />
      <MockFeedbackPanel
        :questions="questions"
        :reviews="reviews"
        :messages="messages"
        :has-practice="Boolean(practice)"
        :submitting="submitting"
        :generating="generating"
        :can-next="canNext"
        :completed="completed"
        :disabled="isBusy"
        @next="nextQuestion"
      />
    </div>
  </section>
</template>
