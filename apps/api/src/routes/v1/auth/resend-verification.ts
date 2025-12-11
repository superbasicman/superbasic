import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sendVerificationEmail } from '@repo/auth-core';
import { verificationService } from '../../../services/index.js';
import type { AppBindings } from '../../../types/context.js';

const resendVerification = new Hono<AppBindings>();

const API_URL = process.env.AUTH_URL || 'http://localhost:3000';

/**
 * POST /v1/auth/resend-verification
 * Resends verification email (rate limited)
 */
resendVerification.post(
  '/',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const { email } = c.req.valid('json');

    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');
    const requestId = c.get('requestId');

    const result = await verificationService.resendVerificationEmail({
      email,
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

    // Send email if token was created (user exists and unverified)
    if (result) {
      const verificationUrl = `${API_URL}/v1/auth/verify-email?token=${encodeURIComponent(result.tokenValue)}`;

      try {
        await sendVerificationEmail({
          to: email,
          verificationUrl,
          expiresInHours: 24,
        });
      } catch (error) {
        console.error('[resendVerification] Failed to send email:', error);
        // Don't reveal error to prevent enumeration
      }
    }

    // Always return success to prevent email enumeration
    return c.json({
      success: true,
      message:
        'If an unverified account exists, a verification email has been sent.',
    });
  }
);

export { resendVerification };
