<script setup lang="ts">
import { useAuth } from "@/composables/useAuth";
import { Button } from "../common";
import { capitalize } from "~/utils/string-utils";

const { currentUser, isAuthenticated, logout } = useAuth();

function getUserDisplayName(): string {
  if (!currentUser.value) return "Guest";
  return capitalize(currentUser.value.name);
}
</script>

<template>
  <header>
    <nav>
      <div class="logo">My App</div>
      <div class="user-section">
        <span v-if="isAuthenticated">Welcome, {{ getUserDisplayName() }}</span>
        <Button v-if="isAuthenticated" label="Logout" @click="logout" />
      </div>
    </nav>
  </header>
</template>
