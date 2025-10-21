/**
 * Auth.js Handler for Hono
 * 
 * Custom integration using @auth/core since @auth/hono doesn't exist.
 * This handler wraps Auth.js to work with Hono's Web standard Request/Response APIs.
 */

import { Hono } from 'hono';
import { Auth } from '@auth/core';
import { authConfig } from '@repo/auth';

const authApp = new Hono();

/**
 * Mount Auth.js handler at all routes
 * Auth.js will handle:
 * - /signin/* - Sign in with various providers
 * - /signout - Sign out
 * - /callback/* - OAuth callbacks
 * - /session - Get current session
 * - /csrf - Get CSRF token
 * - /providers - List available providers
 */
authApp.all('/*', async (c) => {
  try {
    // Get the original request
    const request = c.req.raw;

    // Call Auth.js with the request and config
    const response = await Auth(request, authConfig);

    // Return the Auth.js response
    return response;
  } catch (error) {
    console.error('Auth.js handler error:', error);
    return c.json(
      { 
        error: 'Authentication error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      500
    );
  }
});

export { authApp };
