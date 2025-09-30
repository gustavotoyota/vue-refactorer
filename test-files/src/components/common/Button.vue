<script setup lang="ts">
interface Props {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: "primary",
  disabled: false,
});

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button :class="variant" :disabled="disabled" @click="emit('click')">
    {{ label }}
  </button>
</template>
