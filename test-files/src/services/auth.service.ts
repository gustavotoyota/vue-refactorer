// Authentication service
import { apiClient } from './api';
import type { User } from '../types/user';
import { isValidEmail } from '@/utils/validators';

export interface LoginCredentials {
  email: string;
  password: string;
}

export class AuthService {
  async login(credentials: LoginCredentials): Promise<User> {
    if (!isValidEmail(credentials.email)) {
      throw new Error('Invalid email');
    }
    return apiClient.post<User>('/auth/login', credentials);
  }

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', {});
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      return await apiClient.get<User>('/auth/me');
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();

