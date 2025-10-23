    k# Task 7: Resend Email Service Setup

**Status**: ✅ Complete  
**Date**: 2024-10-23  
**Phase**: 2.1 - Auth.js Migration (Sub-Phase 3)

## What Was Done

Configured Resend as the email service provider for magic link authentication.

### Key Decisions

1. **Chose Resend over alternatives** (SendGrid, Postmark, Nodemailer):

   - Modern API with excellent DX
   - Generous free tier (3,000 emails/month)
   - Built by Vercel ecosystem developers
   - Perfect for serverless/Vercel deployment
   - No SMTP connection management needed

2. **Architecture**:
   - Email utility lives in `@repo/auth` package (shared between API and future services)
   - Uses Resend SDK directly (not SMTP)
   - Environment variables: `RESEND_API_KEY` and `EMAIL_FROM`

### Files Created/Modified

**Created:**

- `packages/auth/src/email.ts` - Email utility with `sendMagicLinkEmail()` function
- `tooling/scripts/test-resend.ts` - Test script to verify Resend integration

**Modified:**

- `packages/auth/src/index.ts` - Exported email utilities
- `packages/auth/package.json` - Added `resend` dependency
- `apps/api/.env.example` - Updated with Resend variables
- `apps/api/.env.local` - Added actual Resend API key
- `.kiro/specs/authjs-migration/tasks.md` - Marked Task 7 as complete

## Email Template

The magic link email includes:

- Clean HTML design with blue CTA button
- Plain text fallback for email clients without HTML support
- Clickable "Sign In" button
- Plain text link (for copy/paste)
- 24-hour expiration notice
- Support contact information
- Professional styling matching brand colors

## Testing

### Test Script Usage

```bash
# Method 1: Pass environment variables inline
RESEND_API_KEY=re_xxx EMAIL_FROM=onboarding@resend.dev \
  pnpm tsx tooling/scripts/test-resend.ts your-email@example.com

# Method 2: Source env file first
export $(cat apps/api/.env.local | xargs)
pnpm tsx tooling/scripts/test-resend.ts your-email@example.com
```

### Sanity Checks

```bash
# Verify RESEND_API_KEY in .env.local
grep "RESEND_API_KEY=" apps/api/.env.local | grep -v "your_resend"
# ✅ Should show actual API key starting with re_

# Verify EMAIL_FROM is set
grep "EMAIL_FROM=" apps/api/.env.local
# ✅ Should show: EMAIL_FROM=onboarding@resend.dev

# Test Resend integration
RESEND_API_KEY=re_xxx pnpm tsx tooling/scripts/test-resend.ts test@example.com
# ✅ Should output: Email sent successfully!

# Verify email utility is exported
grep "sendMagicLinkEmail" packages/auth/src/index.ts
# ✅ Should show export statement

# Check TypeScript builds
pnpm build --filter=@repo/auth
# ✅ Should complete without errors
```

## Domain Verification (✅ COMPLETE)

**Status**: `superbasicfinance.com` verified in Resend

**DNS Records Added to Route53:**
1. **MX Record**: Added Resend's feedback SMTP server to existing MX record
2. **TXT Record (SPF)**: Name = `send`, Value = SPF string for sender authentication
3. **TXT Record (DKIM)**: Name = `resend._domainkey`, Value = DKIM key for email signing

**Result**: Can now send emails to any address (not just signup email)

## Environment Variables

### Development & Production (`.env.local`)

```bash
RESEND_API_KEY=re_QCFJoGYk_HZHQbemKkLH6Z7pfhEDgBv9t
EMAIL_FROM=noreply@superbasicfinance.com
```

**Note**: Domain is verified, so we use the custom domain for all environments

## API Usage

```typescript
import { sendMagicLinkEmail } from "@repo/auth";

// Send magic link email
await sendMagicLinkEmail({
  to: "user@example.com",
  url: "http://localhost:3000/v1/auth/callback/email?token=abc123",
});
```

## Next Steps

- **Task 8**: Add Email provider to Auth.js config
- **Task 9**: Integrate `sendMagicLinkEmail()` with Auth.js Email provider
- **Task 10**: Test magic link flow end-to-end
- **Task 11**: Implement rate limiting for magic link requests

## Notes

- Domain `superbasicfinance.com` is verified and ready for production use
- Resend free tier: 3,000 emails/month, 100 emails/day
- Email template is responsive and works in all major email clients
- Test script uses hardcoded defaults from `.env.local` for convenience
- Can send to any email address now that domain is verified

## Resources

- Resend Dashboard: https://resend.com/overview
- Resend API Docs: https://resend.com/docs/send-with-nodejs
- Domain Verification: https://resend.com/docs/dashboard/domains/introduction
