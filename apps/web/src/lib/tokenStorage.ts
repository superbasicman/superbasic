type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
};

let inMemoryTokens: StoredTokens | null = null;

export function saveTokens(params: { accessToken: string; expiresIn: number }) {
  inMemoryTokens = {
    accessToken: params.accessToken,
    accessTokenExpiresAt: Date.now() + params.expiresIn * 1000,
  };
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

export function clearTokens() {
  inMemoryTokens = null;
}
