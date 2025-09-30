<script setup lang="ts">
import { isValidEmail } from "@/utils/validators";

interface Props {
  modelValue: string;
  type?: "text" | "email" | "password";
  placeholder?: string;
  required?: boolean;
}

withDefaults(defineProps<Props>(), {
  type: "text",
  placeholder: "",
  required: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value);
}

function validate(value: string, type: string): boolean {
  if (type === "email") {
    return isValidEmail(value);
  }
  return true;
}
</script>

<template>
  <input
    :type="type"
    :placeholder="placeholder"
    :required="required"
    :value="modelValue"
    @input="handleInput"
  />
</template>
