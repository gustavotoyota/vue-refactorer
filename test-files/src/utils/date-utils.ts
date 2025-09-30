// Date utility functions
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString();
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function daysAgo(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

