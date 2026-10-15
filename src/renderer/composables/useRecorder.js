import { computed, ref } from 'vue';
import { desktop } from '../services/desktop.js';

const MAX_RECORDING_DURATION = 5 * 60 * 1000;
const MAX_QUESTION_LENGTH = 12000;
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/**
 * Keep microphone ownership and transcription separate from page presentation.
 * Dependencies are injected so this composable does not import the workspace.
 */
export function useRecorder({ state, isBusy, question, pendingSource, perform, toast }) {
  const isRecording = ref(false);
  const isTranscribing = ref(false);
  const elapsedSeconds = ref(0);

  let mediaRecorder = null;
  let audioStream = null;
  let recordingTimer = null;
  let recordingTimeout = null;
  let disposed = false;

  const recordingLabel = computed(() => {
    if (isTranscribing.value) return '正在转写录音';
    if (!isRecording.value) return '把问题说出来';

    const minutes = String(Math.floor(elapsedSeconds.value / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds.value % 60).padStart(2, '0');
    return `正在录音 · ${minutes}:${seconds}`;
  });

  const recordingHint = computed(() => {
    if (isTranscribing.value) return '录音已结束，正在请求转写服务。';
    if (isRecording.value) return '最长 5 分钟。点击结束后，才会上传音频转写。';
    return '录音结束后转为文字，可编辑后再提问。';
  });

  const buttonLabel = computed(() => (isRecording.value ? '结束并转写' : '开始录音'));

  function releaseMedia() {
    audioStream?.getTracks().forEach((track) => track.stop());
    audioStream = null;
    clearInterval(recordingTimer);
    clearTimeout(recordingTimeout);
    recordingTimer = null;
    recordingTimeout = null;
    isRecording.value = false;
  }

  async function transcribe(chunks, mimeType) {
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      toast('没有录到声音，请重试。', true);
      return;
    }

    await perform(async () => {
      isTranscribing.value = true;
      try {
        const result = await desktop.transcribe({
          audio: await blob.arrayBuffer(),
          mimeType,
        });
        if (disposed) return;

        if (!result?.text?.trim()) {
          toast('转写结果为空，请检查录音内容。', true);
          return;
        }

        const combined = [question.value.trim(), result.text.trim()].filter(Boolean).join('\n');
        question.value = combined.slice(0, MAX_QUESTION_LENGTH);
        pendingSource.value = 'voice';

        if (combined.length > MAX_QUESTION_LENGTH) {
          toast('转写内容较长，已保留前 12000 字，请检查后提问。');
        }
        toast('转写完成。确认文字后，点击生成回答。');
      } finally {
        isTranscribing.value = false;
      }
    }, '语音转写失败。');
  }

  function connectRecorder(recorder, preferredType) {
    const chunks = [];
    let failed = false;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data);
    });

    recorder.addEventListener('error', () => {
      failed = true;
      if (mediaRecorder === recorder) {
        releaseMedia();
        mediaRecorder = null;
      }
      if (!disposed) toast('录音中断，请检查麦克风后重试。', true);
    });

    recorder.addEventListener('stop', async () => {
      const mimeType = recorder.mimeType || preferredType || 'audio/webm';
      if (mediaRecorder === recorder) {
        releaseMedia();
        mediaRecorder = null;
      }
      if (!disposed && !failed) await transcribe(chunks, mimeType);
    });
  }

  async function toggleRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (disposed || isBusy.value || !state.value || mediaRecorder || isTranscribing.value) return;

    if (state.value.settings.demoMode) {
      toast('演示模式不进行语音转写。请先在模型与设置中配置转写服务。');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast('当前环境无法录音，请检查麦克风支持。', true);
      return;
    }

    await perform(async () => {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (disposed) {
        releaseMedia();
        return;
      }

      const preferredType = AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      mediaRecorder = preferredType
        ? new MediaRecorder(audioStream, { mimeType: preferredType })
        : new MediaRecorder(audioStream);

      connectRecorder(mediaRecorder, preferredType);
      mediaRecorder.start(1000);
      isRecording.value = true;
      elapsedSeconds.value = 0;
      const startedAt = Date.now();

      recordingTimer = setInterval(() => {
        elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
      }, 1000);

      recordingTimeout = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      }, MAX_RECORDING_DURATION);
    }, '无法访问麦克风，请检查系统权限。');

    if (!isRecording.value) releaseMedia();
  }

  function dispose() {
    disposed = true;
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    releaseMedia();
    mediaRecorder = null;
  }

  return {
    isRecording,
    isTranscribing,
    recordingLabel,
    recordingHint,
    buttonLabel,
    toggleRecording,
    dispose,
  };
}
