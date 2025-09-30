// User service
import { apiClient } from './api';
import type { User, UserProfile } from '@/types';
import { isValidEmail } from '~/utils/validators';

export class UserService {
  async getUser(userId: string): Promise<User> {
    return apiClient.get<User>(`/users/${userId}`);
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    return apiClient.get<UserProfile>(`/users/${userId}/profile`);
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    if (data.email && !isValidEmail(data.email)) {
      throw new Error('Invalid email');
    }
    return apiClient.post<User>(`/users/${userId}`, data);
  }

  async searchUsers(query: string): Promise<User[]> {
    return apiClient.get<User[]>(`/users/search?q=${query}`);
  }
}

export const userService = new UserService();

