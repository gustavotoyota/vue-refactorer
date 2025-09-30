<script setup lang="ts">
import { formatDate } from "@/utils/date-utils";

const currentYear = new Date().getFullYear();
const buildDate = formatDate(new Date());
</script>

<template>
  <footer>
    <div class="footer-content">
      <p>&copy; {{ currentYear }} My App. All rights reserved.</p>
      <p class="build-info">Built on {{ buildDate }}</p>
    </div>
  </footer>
</template>
