// Authentication composable
import { ref, computed } from 'vue';
import type { User } from '@/types/user';
import { authService, type LoginCredentials } from '../services/auth.service';

const currentUser = ref<User | null>(null);
const isLoading = ref(false);

export function useAuth() {
  const isAuthenticated = computed(() => currentUser.value !== null);
  const isAdmin = computed(() => currentUser.value?.role === 'admin');

  async function login(credentials: LoginCredentials) {
    isLoading.value = true;
    try {
      const user = await authService.login(credentials);
      currentUser.value = user;
      return user;
    } finally {
      isLoading.value = false;
    }
  }

  async function logout() {
    isLoading.value = true;
    try {
      await authService.logout();
      currentUser.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchCurrentUser() {
    isLoading.value = true;
    try {
      const user = await authService.getCurrentUser();
      currentUser.value = user;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    currentUser,
    isAuthenticated,
    isAdmin,
    isLoading,
    login,
    logout,
    fetchCurrentUser,
  };
}

