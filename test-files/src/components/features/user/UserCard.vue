<script setup lang="ts">
import type { User } from "@/types/user";
import { capitalize, truncate } from "~/utils/string-utils";
import { formatDate, daysAgo } from "@/utils/date-utils";
import { Button } from "../../common";

interface Props {
  user: User;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "view-profile": [userId: string];
}>();

function handleViewProfile() {
  emit("view-profile", props.user.id);
}

function getUserRoleBadge(role: string): string {
  return capitalize(role);
}

function getJoinedText(date: Date): string {
  const days = daysAgo(date);
  if (days === 0) return "Joined today";
  if (days === 1) return "Joined yesterday";
  return `Joined ${formatDate(date)}`;
}
</script>

<template>
  <div class="user-card">
    <div class="user-info">
      <h3>{{ user.name }}</h3>
      <p>{{ truncate(user.email, 30) }}</p>
      <span class="badge">{{ getUserRoleBadge(user.role) }}</span>
      <p class="joined">{{ getJoinedText(user.createdAt) }}</p>
    </div>
    <div class="actions">
      <Button label="View Profile" @click="handleViewProfile" />
    </div>
  </div>
</template>
