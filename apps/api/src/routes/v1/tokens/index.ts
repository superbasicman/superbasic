/**
 * Token management routes
 * Handles API key creation, listing, revocation, and updates
 */

import { Hono } from "hono";
import { createTokenRoute } from "./create.js";

const tokensRoute = new Hono();

// Mount token routes
tokensRoute.route("/", createTokenRoute);

export { tokensRoute };
