<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';

defineProps({
  question: { type: Object, default: null },
  progress: { type: String, required: true },
  answer: { type: String, default: '' },
  disabled: Boolean,
  reviewed: Boolean,
  completed: Boolean,
  generating: Boolean,
  hasResume: Boolean,
  legacy: Boolean,
});

defineEmits(['update:answer', 'submit']);
</script>

<template>
  <section class="card mock-question-card">
    <div class="card-header">
      <div class="section-title">
        <span class="section-dot"></span>
        <h2>本轮问题</h2>
      </div>
      <span id="mock-progress" class="subtle-tag">{{ progress }}</span>
    </div>
    <div v-if="question" class="mock-question-content">
      <span id="mock-topic" class="topic-tag" :class="question.category">
        {{ question.topic || '简历追问' }}
      </span>
      <h2 id="mock-question">{{ question.title }}</h2>
      <p>{{ question.description || '结合简历中的经历，说明你的思考、行动和实际结果。' }}</p>
      <label class="input-label" for="mock-answer">你的回答</label>
      <textarea
        id="mock-answer"
        :value="answer"
        maxlength="10000"
        placeholder="在这里整理并写下你的回答…"
        :disabled="disabled || reviewed || completed"
        @input="$emit('update:answer', $event.target.value)"
      ></textarea>
      <div class="mock-actions">
        <span>
          {{
            completed
              ? '本轮已结束，可在右侧回看全部点评。'
              : reviewed
                ? '查看点评后，点击右侧下一题。'
                : 'Ctrl + Enter 提交作答'
          }}
        </span>
        <button
          id="submit-mock"
          class="button primary"
          :disabled="disabled || reviewed || completed || !answer.trim()"
          @click="$emit('submit')"
        >
          <AppIcon name="sparkles" />{{ reviewed ? '本题已点评' : '提交并评分' }}
        </button>
      </div>
    </div>
    <div v-else class="simple-empty mock-question-empty">
      <span class="simple-empty-icon"><AppIcon :name="generating ? 'sparkles' : 'book'" /></span>
      <h3>
        {{
          generating
            ? '正在结合简历和偏好准备问题'
            : legacy
              ? '这是一份旧版练习记录'
              : '从你的真实经历开始'
        }}
      </h3>
      <p v-if="generating">AI 会根据已保存的简历和面试偏好生成问题，生成后可以逐题作答。</p>
      <p v-else-if="legacy">
        已有作答和点评保留在右侧。<br />点击“新的面试”，结合简历和偏好开始练习。
      </p>
      <p v-else-if="!hasResume">先上传并保存简历，设置面试偏好，<br />再点击“新的面试”。</p>
      <p v-else>选择本次题数，再点击“新的面试”。<br />进入页面不会自动调用模型。</p>
    </div>
  </section>
</template>
