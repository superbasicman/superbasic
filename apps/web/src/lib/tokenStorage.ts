type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
};

const EXPIRY_STORAGE_KEY = 'sbf_token_expires_at';

let inMemoryTokens: StoredTokens | null = null;

export function saveTokens(params: { accessToken: string; expiresIn: number }) {
  const expiresAt = Date.now() + params.expiresIn * 1000;
  inMemoryTokens = {
    accessToken: params.accessToken,
    accessTokenExpiresAt: expiresAt,
  };
  // Persist expiry to sessionStorage so we can check validity after page refresh
  try {
    sessionStorage.setItem(EXPIRY_STORAGE_KEY, expiresAt.toString());
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function getStoredTokens(): StoredTokens | null {
  return inMemoryTokens;
}

export function getAccessToken(): string | null {
  return inMemoryTokens?.accessToken ?? null;
}

export function getAccessTokenExpiry(): number | null {
  return inMemoryTokens?.accessTokenExpiresAt ?? null;
}

/**
 * Check if we had a valid token before page refresh.
 * Returns true if the persisted expiry is still in the future.
 */
export function hasValidPersistedExpiry(): boolean {
  try {
    const stored = sessionStorage.getItem(EXPIRY_STORAGE_KEY);
    if (!stored) return false;
    const expiresAt = parseInt(stored, 10);
    // Add 60s buffer to account for clock skew and network latency
    return !isNaN(expiresAt) && expiresAt > Date.now() + 60000;
  } catch {
    return false;
  }
}

export function clearTokens() {
  inMemoryTokens = null;
  try {
    sessionStorage.removeItem(EXPIRY_STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable
  }
}
