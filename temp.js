// Quick smoke script for MFA/refresh flow using credentials login.
// Usage: API_URL=http://localhost:3000 node temp.js

/* eslint-disable no-console */
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || 'irobles1030@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'pass123.';

async function ensureFetch() {
  if (typeof fetch === 'undefined') {
    const { default: nodeFetch } = await import('node-fetch');
    // @ts-ignore - assign for runtime
    global.fetch = nodeFetch;
  }
}

function decodeJwt(token) {
  const [, payload] = token.split('.');
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json);
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.raw?.()['set-cookie'];
  if (raw) {
    return raw;
  }
  const single = headers.get('set-cookie');
  if (!single) {
    return [];
  }
  // Split on comma only when it separates cookies (lookahead for next key=value)
  return single.split(/,(?=[^;]+=[^;]+)/);
}

function buildCookieHeader(cookies) {
  return cookies
    .filter(Boolean)
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function main() {
  await ensureFetch();
  console.log(`Using API: ${BASE_URL}`);

  // 1) Get CSRF token for Auth.js credentials flow
  const csrfRes = await fetch(`${BASE_URL}/v1/auth/csrf`, {
    headers: { origin: BASE_URL },
  });
  if (!csrfRes.ok) {
    throw new Error(`CSRF fetch failed: ${csrfRes.status}`);
  }
  const csrfData = await csrfRes.json();
  const csrfCookies = getSetCookies(csrfRes.headers);
  const csrfCookieRaw =
    csrfCookies.find((c) => c.startsWith('__Host-authjs.csrf-token=')) ||
    csrfCookies.find((c) => c.startsWith('authjs.csrf-token='));
  if (!csrfData?.csrfToken || !csrfCookieRaw) {
    throw new Error('Missing CSRF token or cookie');
  }
  const csrfValue = csrfCookieRaw.split(';')[0].split('=').slice(1).join('=');
  const csrfCookieHeader = buildCookieHeader([
    `__Host-authjs.csrf-token=${csrfValue}`,
    `authjs.csrf-token=${csrfValue}`,
  ]);

  // 2) Sign in with credentials to get the Auth.js session cookie
  const loginRes = await fetch(`${BASE_URL}/v1/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: csrfCookieHeader,
      origin: BASE_URL,
    },
    body: new URLSearchParams({
      email: EMAIL,
      password: PASSWORD,
      csrfToken: csrfData.csrfToken,
    }).toString(),
  });

  if (![200, 302].includes(loginRes.status)) {
    const text = await loginRes.text();
    throw new Error(`Login failed: ${loginRes.status} ${text}`);
  }

  const loginCookies = getSetCookies(loginRes.headers);
  const sessionCookie = loginCookies.find((c) => c.startsWith('authjs.session-token='));
  if (!sessionCookie) {
    console.error('Login status:', loginRes.status);
    console.error('Set-Cookie headers:', loginCookies);
    throw new Error('No session cookie returned from credentials callback');
  }
  console.log('Obtained Auth.js session cookie');

  // 3) Exchange for access/refresh tokens
  const tokenRes = await fetch(`${BASE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: buildCookieHeader([sessionCookie]),
    },
    body: JSON.stringify({ clientType: 'web' }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${JSON.stringify(tokenJson)}`);
  }
  const { accessToken, refreshToken } = tokenJson;
  const accessPayload = decodeJwt(accessToken);
  console.log('Access token mfa_level:', accessPayload.mfa_level);

  // 4) Hit /v1/auth/session to confirm auth context carries mfaLevel
  const sessionRes = await fetch(`${BASE_URL}/v1/auth/session`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const sessionJson = await sessionRes.json();
  console.log('Auth context mfaLevel:', sessionJson?.auth?.mfaLevel);

  // 5) Refresh using the refresh token in the body (avoids CSRF header)
  const refreshRes = await fetch(`${BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const refreshJson = await refreshRes.json();
  if (!refreshRes.ok) {
    throw new Error(`Refresh failed: ${refreshRes.status} ${JSON.stringify(refreshJson)}`);
  }
  const refreshedPayload = decodeJwt(refreshJson.accessToken);
  console.log('Refreshed token mfa_level:', refreshedPayload.mfa_level);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
