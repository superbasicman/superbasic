import { Hono } from "hono";

const healthRoute = new Hono();

healthRoute.get("/", (c) => {
  const response = {
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    version: "1.0.01",
  };

  return c.json(response);
});

export { healthRoute };
