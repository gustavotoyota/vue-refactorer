// Main entry point
import { createApp } from 'vue';
import App from './components/App.vue';
import type { User } from '@/types';
import { authService } from './services/auth.service';
import { userService } from '~/services/user.service';

// Initialize app
const app = createApp(App);

// Global error handler
app.config.errorHandler = (err, instance, info) => {
  console.error('Global error:', err, info);
};

// Mount app
app.mount('#app');

// Export services for external use
export { authService, userService };
export type { User };

