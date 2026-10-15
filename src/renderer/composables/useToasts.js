import { ref } from 'vue';

const toasts = ref([]);
let nextId = 0;

export function errorText(error, fallback = '操作未完成，请重试。') {
  const raw = typeof error?.message === 'string' ? error.message : String(error || '');
  const message = raw
    .replace(/^Error invoking remote method ['"]studio:[^'"]+['"]:\s*/, '')
    .replace(/^(?:GatewayError|Error):\s*/, '')
    .trim();
  return message ? `${fallback} ${message}` : fallback;
}

export function toast(message, error = false) {
  const id = ++nextId;
  toasts.value.push({ id, message, error });
  setTimeout(
    () => {
      toasts.value = toasts.value.filter((item) => item.id !== id);
    },
    error ? 6500 : 3600,
  );
}

export function useToasts() {
  return { toasts, toast, errorText };
}
