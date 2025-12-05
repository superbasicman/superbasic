const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const REFRESH_TOKEN_BASE = 'sb.refresh-token';


export const REFRESH_TOKEN_COOKIE = IS_PRODUCTION
  ? `__Host-${REFRESH_TOKEN_BASE}`
  : REFRESH_TOKEN_BASE;
export const REFRESH_COOKIE_PATH = IS_PRODUCTION ? '/' : '/v1/auth/refresh';
export const USE_HOST_PREFIX = IS_PRODUCTION;
