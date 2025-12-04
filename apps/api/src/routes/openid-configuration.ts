import { Hono } from 'hono';

const openidConfiguration = new Hono();

openidConfiguration.get('/', (c) => {
  const baseUrl = process.env.API_URL || 'http://localhost:3001';

  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/v1/oauth/authorize`,
    token_endpoint: `${baseUrl}/v1/oauth/token`,
    userinfo_endpoint: `${baseUrl}/v1/oauth/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    revocation_endpoint: `${baseUrl}/v1/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/v1/oauth/introspect`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['EdDSA'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [
      'openid',
      'profile',
      'read:profile',
      'write:profile',
      'read:workspaces',
      'write:workspaces',
      'read:transactions',
      'write:transactions',
      'admin',
    ],
  });
});

export { openidConfiguration };
