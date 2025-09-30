// User composable
import { ref } from 'vue';
import type { User, UserProfile } from '~/types';
import { userService } from '@/services/user.service';
import { formatDate } from '../utils/date-utils';

export function useUser(userId?: string) {
  const user = ref<User | null>(null);
  const profile = ref<UserProfile | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchUser(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      user.value = await userService.getUser(id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch user';
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchProfile(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      profile.value = await userService.getUserProfile(id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch profile';
    } finally {
      isLoading.value = false;
    }
  }

  function formatUserDate(date: Date): string {
    return formatDate(date);
  }

  if (userId) {
    fetchUser(userId);
  }

  return {
    user,
    profile,
    isLoading,
    error,
    fetchUser,
    fetchProfile,
    formatUserDate,
  };
}

