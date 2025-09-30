// Validation utility functions
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidPrice(price: number): boolean {
  return price >= 0 && Number.isFinite(price);
}

export function hasMinLength(str: string, minLength: number): boolean {
  return str.length >= minLength;
}

