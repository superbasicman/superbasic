import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { renderEmailVerification } from '@repo/email-templates';

export interface SendMagicLinkEmailParams {
  to: string;
  url: string;
}

export interface SendVerificationEmailParams {
  to: string;
  verificationUrl: string;
  expiresInHours?: number;
}

export function getRecipientLogId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12);
}

export async function sendMagicLinkEmail({ to, url }: SendMagicLinkEmailParams): Promise<void> {
  // Lazy-load Resend client to avoid requiring API key at module load time
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const recipient = getRecipientLogId(to);

  console.log('[sendMagicLinkEmail] Sending magic link email:', {
    recipient,
    from,
    urlLength: url.length,
  });

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject: 'Your sign-in link for SuperBasic Finance',
      html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb; margin-bottom: 24px;">Welcome back!</h1>
          
          <p style="margin-bottom: 24px;">You requested a sign-in link for your SuperBasic Finance account. Click the button below to continue:</p>
          
          <a href="${url}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-bottom: 24px;">Continue to SuperBasic Finance</a>
          
          <p style="margin-bottom: 16px; color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
          <p style="margin-bottom: 24px; word-break: break-all; color: #2563eb; font-size: 14px;">${url}</p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
          
          <p style="color: #666; font-size: 14px; margin-bottom: 8px;">This link will expire in 24 hours.</p>
          <p style="color: #666; font-size: 14px; margin-bottom: 8px;">If you didn't request this email, you can safely ignore it.</p>
          <p style="color: #666; font-size: 14px;">Need help? Contact us at support@superbasicfinance.com</p>
        </body>
      </html>
    `,
      text: `
Sign in to SuperBasic Finance

Click the link below to sign in to your account:

${url}

This link will expire in 24 hours.

If you didn't request this email, you can safely ignore it.

Need help? Contact us at support@superbasicfinance.com
    `.trim(),
    });

    console.log('[sendMagicLinkEmail] Email sent successfully:', {
      recipient,
      emailId: result.data?.id,
      error: result.error,
    });

    if (result.error) {
      console.error('[sendMagicLinkEmail] Resend API returned error:', result.error);
      throw new Error(`Failed to send email: ${result.error.message}`);
    }
  } catch (error) {
    console.error('[sendMagicLinkEmail] Failed to send email:', { recipient, error });
    throw error;
  }
}

/**
 * Send email verification email using React Email template
 */
export async function sendVerificationEmail({
  to,
  verificationUrl,
  expiresInHours = 24,
}: SendVerificationEmailParams): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const recipient = getRecipientLogId(to);

  console.log('[sendVerificationEmail] Sending verification email:', {
    recipient,
    from,
  });

  try {
    const { html, text } = await renderEmailVerification({
      verificationUrl,
      expiresInHours,
    });

    const result = await resend.emails.send({
      from,
      to,
      subject: 'Verify your email address - SuperBasic Finance',
      html,
      text,
    });

    console.log('[sendVerificationEmail] Email sent successfully:', {
      recipient,
      emailId: result.data?.id,
      error: result.error,
    });

    if (result.error) {
      console.error('[sendVerificationEmail] Resend API returned error:', result.error);
      throw new Error(`Failed to send email: ${result.error.message}`);
    }
  } catch (error) {
    console.error('[sendVerificationEmail] Failed to send email:', { recipient, error });
    throw error;
  }
}
