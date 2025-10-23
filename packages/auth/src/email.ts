import { Resend } from 'resend';

export interface SendMagicLinkEmailParams {
  to: string;
  url: string;
}

export async function sendMagicLinkEmail({ to, url }: SendMagicLinkEmailParams): Promise<void> {
  // Lazy-load Resend client to avoid requiring API key at module load time
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  await resend.emails.send({
    from,
    to,
    subject: 'Sign in to SuperBasic Finance',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb; margin-bottom: 24px;">Sign in to SuperBasic Finance</h1>
          
          <p style="margin-bottom: 24px;">Click the button below to sign in to your account:</p>
          
          <a href="${url}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-bottom: 24px;">Sign In</a>
          
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
}
