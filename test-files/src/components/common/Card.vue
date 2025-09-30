<script setup lang="ts">
interface Props {
  title?: string;
  elevated?: boolean;
}

withDefaults(defineProps<Props>(), {
  title: "",
  elevated: false,
});
</script>

<template>
  <div :class="['card', { elevated }]">
    <div v-if="title" class="card-header">
      <h2>{{ title }}</h2>
    </div>
    <div class="card-content">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>
