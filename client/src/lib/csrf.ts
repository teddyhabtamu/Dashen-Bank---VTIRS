export function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export function csrfHeaders(): Record<string, string> {
  const token = csrfToken();
  return token ? { "x-csrf-token": token } : {};
}