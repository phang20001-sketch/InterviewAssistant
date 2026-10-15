import { computed } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';

export function useCaptureControls() {
  const { state, isBusy, isRecording, captureAnswerPhase, captureAndAnswer } = useWorkspace();
  const captureDisabled = computed(() => isBusy.value || !state.value || isRecording.value);
  const captureLabel = computed(() => {
    if (captureAnswerPhase.value === 'capturing') return '截屏中…';
    if (captureAnswerPhase.value === 'answering') return '作答中…';
    return '截屏作答';
  });

  return { captureDisabled, captureLabel, captureAndAnswer };
}
