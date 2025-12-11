import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RegisterSchema } from '@repo/types';
import { userService, verificationService } from '../../services/index.js';
import { DuplicateEmailError, InvalidEmailError, WeakPasswordError } from '@repo/core';
import { sendVerificationEmail } from '@repo/auth-core';
import type { AppBindings } from '../../types/context.js';

const registerRoute = new Hono<AppBindings>();

const API_URL = process.env.AUTH_URL || 'http://localhost:3000';

registerRoute.post('/', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  // Extract IP for audit logging
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;
  const userAgent = c.req.header('user-agent') || undefined;

  try {
    // Call service layer to create user
    const result = await userService.registerUser({
      email,
      password,
      ...(name !== undefined && { name }),
      ...(ip !== undefined && { ip }),
    });

    // Create email verification token
    const requestId = c.get('requestId');
    const verificationResult =
      await verificationService.createEmailVerificationToken({
        email,
        type: 'email_verification',
        expiresInHours: 24,
        ...(ip || userAgent || requestId
          ? {
              requestContext: {
                ...(ip && { ip }),
                ...(userAgent && { userAgent }),
                ...(requestId && { requestId }),
              },
            }
          : {}),
      });

    // Build verification URL
    const verificationUrl = `${API_URL}/v1/auth/verify-email?token=${encodeURIComponent(verificationResult.tokenValue)}`;

    // Send verification email
    try {
      await sendVerificationEmail({
        to: email,
        verificationUrl,
        expiresInHours: 24,
      });
    } catch (emailError) {
      console.error('[register] Failed to send verification email:', emailError);
      // Continue - user can request resend
    }

    // DO NOT create session - user must verify email first
    // Return response indicating verification is required
    return c.json(
      {
        user: result.user,
        requiresVerification: true,
        message: 'Please check your email to verify your account.',
      },
      201
    );
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
