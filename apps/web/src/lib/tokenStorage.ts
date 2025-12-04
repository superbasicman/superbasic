const STORAGE_KEY = 'sb.auth-tokens';

type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
};

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveTokens(params: { accessToken: string; expiresIn: number }) {
  if (!isBrowser()) {
    return;
  }

  const payload: StoredTokens = {
    accessToken: params.accessToken,
    accessTokenExpiresAt: Date.now() + params.expiresIn * 1000,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getStoredTokens(): StoredTokens | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredTokens;
    if (
      parsed &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.accessTokenExpiresAt === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getStoredTokens()?.accessToken ?? null;
}

export function getAccessTokenExpiry(): number | null {
  return getStoredTokens()?.accessTokenExpiresAt ?? null;
}

export function clearTokens() {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}
