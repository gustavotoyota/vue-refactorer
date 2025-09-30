<script setup lang="ts">
import { watch } from "vue";
import Button from "./Button.vue";

interface Props {
  isOpen: boolean;
  title?: string;
  showCloseButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: "",
  showCloseButton: true,
});

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }
);

function handleClose() {
  emit("close");
}

function handleConfirm() {
  emit("confirm");
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    handleClose();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-backdrop" @click="handleBackdropClick">
      <div class="modal">
        <div v-if="title || showCloseButton" class="modal-header">
          <h2 v-if="title">{{ title }}</h2>
          <Button
            v-if="showCloseButton"
            class="close-button"
            @click="handleClose"
          >
            ×
          </Button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot
            name="footer"
            :handleClose="handleClose"
            :handleConfirm="handleConfirm"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
