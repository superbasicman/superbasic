/**
 * Token management routes
 * Handles API key creation, listing, revocation, and updates
 */

import { Hono } from 'hono';
import { createTokenRoute } from './create.js';
import { listTokensRoute } from './list.js';
import { revokeTokenRoute } from './revoke.js';
import { updateTokenRoute } from './update.js';

const tokensRoute = new Hono();

// Mount token routes
tokensRoute.route('/', createTokenRoute);
tokensRoute.route('/', listTokensRoute);
tokensRoute.route('/', revokeTokenRoute);
tokensRoute.route('/', updateTokenRoute);

export { tokensRoute };
