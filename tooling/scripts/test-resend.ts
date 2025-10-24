#!/usr/bin/env tsx
/**
 * Test script to verify Resend email integration
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx pnpm tsx tooling/scripts/test-resend.ts your-email@example.com
 *
 * Or source the env file first:
 *   export $(cat apps/api/.env.local | xargs) && pnpm tsx tooling/scripts/test-resend.ts your-email@example.com
 */

import { Resend } from "resend";

const testEmail = process.argv[2];

if (!testEmail) {
  console.error("❌ Error: Please provide an email address");
  console.log("\nUsage:");
  console.log(
    "  RESEND_API_KEY=re_xxx pnpm tsx tooling/scripts/test-resend.ts your-email@example.com"
  );
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || "noreply@superbasicfinance.com";

if (!apiKey) {
  console.error("❌ RESEND_API_KEY environment variable is required");
  console.log(
    "Usage: RESEND_API_KEY=re_xxx pnpm tsx tooling/scripts/test-resend.ts your-email@example.com"
  );
  process.exit(1);
}

if (!apiKey || apiKey === "your_resend_api_key_here") {
  console.error("❌ Error: RESEND_API_KEY not configured");
  console.log("\nSet it with:");
  console.log(
    "  RESEND_API_KEY=re_xxx pnpm tsx tooling/scripts/test-resend.ts",
    testEmail
  );
  process.exit(1);
}

console.log("📧 Sending test magic link email...");
console.log(`   To: ${testEmail}`);
console.log(`   From: ${from}`);
console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
console.log("");

const resend = new Resend(apiKey);

const magicLinkUrl =
  "http://localhost:3000/v1/auth/callback/email?token=test_token_12345";

resend.emails
  .send({
    from,
    to: testEmail,
    subject: "Sign in to SuperBasic Finance",
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
        
        <a href="${magicLinkUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-bottom: 24px;">Sign In</a>
        
        <p style="margin-bottom: 16px; color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="margin-bottom: 24px; word-break: break-all; color: #2563eb; font-size: 14px;">${magicLinkUrl}</p>
        
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

${magicLinkUrl}

This link will expire in 24 hours.

If you didn't request this email, you can safely ignore it.

Need help? Contact us at support@superbasicfinance.com
  `.trim(),
  })
  .then((result) => {
    console.log("✅ Email sent successfully!");
    console.log("");
    console.log("Response:", JSON.stringify(result, null, 2));

    if (result.data?.id) {
      console.log("");
      console.log("📬 Email ID:", result.data.id);
      console.log("");
      console.log("Next steps:");
      console.log("1. Check your inbox:", testEmail);
      console.log("2. Check spam/junk folder if not in inbox");
      console.log('3. Subject: "Sign in to SuperBasic Finance"');
      console.log('4. From: "<your-domain-here>"');
    }
  })
  .catch((error) => {
    console.error("\n❌ Failed to send email");
    console.error("Error:", error);

    if (error.message) {
      console.error("\nMessage:", error.message);
    }

    if (error.statusCode) {
      console.error("Status:", error.statusCode);
    }

    process.exit(1);
  });
