<script setup>
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  title: { type: String, required: true },
  ariaLabel: { type: String, required: true },
  value: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  unit: { type: String, default: '%' },
});

defineEmits(['input', 'change']);
</script>

<template>
  <label class="transparent-opacity-control" :for="id" :title="title">
    <span class="transparent-control-label">
      {{ label }}
      <output :id="`${id}-value`" :for="id">{{ value }}{{ unit }}</output>
    </span>
    <input
      :id="id"
      data-transparency-control
      type="range"
      :min="min"
      :max="max"
      step="1"
      :value="value"
      :aria-label="ariaLabel"
      @input="$emit('input', $event.target.value)"
      @change="$emit('change')"
    />
  </label>
</template>
