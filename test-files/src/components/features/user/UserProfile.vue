<script setup lang="ts">
import { computed } from "vue";
import { useUser } from "@/composables/useUser";
import type { UserProfile as UserProfileType } from "~/types";
import UserCard from "./UserCard.vue";
import { Input, Button } from "@/components/common";

interface Props {
  userId: string;
}

const props = defineProps<Props>();

const { user, profile, isLoading, fetchProfile } = useUser(props.userId);

fetchProfile(props.userId);

const displayName = computed(() => {
  return profile.value?.bio
    ? `${user.value?.name} - ${profile.value.bio}`
    : user.value?.name;
});

const themeLabel = computed(() => {
  return profile.value?.preferences.theme === "dark"
    ? "Dark Mode"
    : "Light Mode";
});

function handleViewProfile(userId: string) {
  console.log("Viewing profile:", userId);
}
</script>

<template>
  <div class="user-profile">
    <div v-if="isLoading">Loading...</div>
    <div v-else-if="user">
      <h1>{{ displayName }}</h1>
      <UserCard :user="user" @view-profile="handleViewProfile" />
      <div v-if="profile" class="profile-details">
        <p v-if="profile.avatar">Avatar: {{ profile.avatar }}</p>
        <p>Theme: {{ themeLabel }}</p>
        <p>
          Notifications:
          {{ profile.preferences.notifications ? "Enabled" : "Disabled" }}
        </p>
      </div>
    </div>
  </div>
</template>
