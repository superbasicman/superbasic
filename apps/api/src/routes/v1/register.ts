import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RegisterSchema } from '@repo/types';
import { userService } from '../../services/index.js';
import { DuplicateEmailError, InvalidEmailError, WeakPasswordError } from '@repo/core';

const registerRoute = new Hono();

registerRoute.post('/', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  // Extract IP for audit logging
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;

  try {
    // Call service layer
    const result = await userService.registerUser({
      email,
      password,
      ...(name !== undefined && { name }),
      ...(ip !== undefined && { ip }),
    });

    // Return success response
    return c.json(result, 201);
  } catch (error) {
    // Handle domain errors
    if (error instanceof DuplicateEmailError) {
      return c.json({ error: 'Email already in use' }, 409);
    }
    if (error instanceof InvalidEmailError) {
      return c.json({ error: 'Invalid email format' }, 400);
    }
    if (error instanceof WeakPasswordError) {
      return c.json({ error: error.message }, 400);
    }
    // Let global error handler catch unexpected errors
    throw error;
  }
});

export { registerRoute };
