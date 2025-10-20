/**
 * Token management routes
 * Handles API key creation, listing, revocation, and updates
 */

import { Hono } from "hono";
import { createTokenRoute } from "./create.js";
import { listTokensRoute } from "./list.js";

const tokensRoute = new Hono();

// Mount token routes
tokensRoute.route("/", createTokenRoute);
tokensRoute.route("/", listTokensRoute);

export { tokensRoute };
