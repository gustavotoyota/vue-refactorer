<script setup lang="ts">
import { ref } from "vue";
import { useAuth } from "~/composables";

const { isAuthenticated, isAdmin } = useAuth();
const isOpen = ref(true);

interface MenuItem {
  label: string;
  path: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

const menuItems: MenuItem[] = [
  { label: "Home", path: "/" },
  { label: "Products", path: "/products" },
  { label: "Profile", path: "/profile", requiresAuth: true },
  { label: "Admin", path: "/admin", requiresAdmin: true },
];

function toggleSidebar() {
  isOpen.value = !isOpen.value;
}

function isMenuItemVisible(item: MenuItem): boolean {
  if (item.requiresAdmin) return isAdmin.value;
  if (item.requiresAuth) return isAuthenticated.value;
  return true;
}
</script>

<template>
  <aside :class="{ open: isOpen }">
    <button @click="toggleSidebar">Toggle Menu</button>
    <nav>
      <ul>
        <li v-for="item in menuItems" :key="item.path">
          <a v-if="isMenuItemVisible(item)" :href="item.path">
            {{ item.label }}
          </a>
        </li>
      </ul>
    </nav>
  </aside>
</template>
