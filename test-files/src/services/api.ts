// API service
import { isValidUrl } from '../utils/validators';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    if (!isValidUrl(baseUrl)) {
      throw new Error('Invalid API URL');
    }
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    return response.json();
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }
}

export const apiClient = new ApiClient('https://api.example.com');

