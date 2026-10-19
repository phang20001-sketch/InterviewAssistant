import { computed } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { modifierLabel } from '../../services/platform.js';

export function useCaptureControls() {
  const { state, isBusy, isRecording, captureAnswerPhase, captureAndAnswer } = useWorkspace();
  const captureDisabled = computed(() => isBusy.value || !state.value || isRecording.value);
  const captureShortcut = `${modifierLabel} E`;
  const captureTitle = `截取软件所在屏幕并作答（${captureShortcut} 可后台触发）`;
  const captureLabel = computed(() => {
    if (captureAnswerPhase.value === 'capturing') return '截屏中…';
    if (captureAnswerPhase.value === 'answering') return '作答中…';
    return '截屏作答';
  });

  return { captureDisabled, captureLabel, captureTitle, captureAndAnswer };
}
