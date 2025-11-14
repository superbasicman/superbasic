# Plaid Integration Setup Guide

> **⚠️ Phase 4 - Not Yet Implemented**  
> This guide is for **Phase 4** of the project roadmap. Plaid integration has not been started yet.  
> The setup wizard and configuration are ready, but no Plaid features are currently implemented in the application.

This guide walks you through setting up Plaid Link integration for SuperBasic Finance (Phase 4).

## Quick Start

Run the interactive setup wizard:

```bash
pnpm setup:plaid
```

The wizard will guide you through:
1. Plaid developer account registration (if needed)
2. API credential configuration
3. Encryption key generation
4. Environment variable setup
5. Optional: Plaid SDK installation
6. Optional: API connection test

## Prerequisites

Before running the setup wizard:

1. **Complete base setup:**
   ```bash
   pnpm setup:env
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Have access to:**
   - Your email (for Plaid account registration)
   - Terminal/command line

## What You'll Need

### Required

- **Plaid Developer Account** - Free, create at https://dashboard.plaid.com/signup
- **Plaid API Credentials** - Client ID and Secret from dashboard
- **Encryption Key** - Generated automatically by the wizard

### Optional

- **Webhook URL** - For receiving Plaid notifications (requires HTTPS)
  - For local development, use ngrok or similar tunneling service
  - For production, use your actual API domain

## Step-by-Step Manual Setup

If you prefer to set up manually instead of using the wizard:

### 1. Register for Plaid

1. Go to https://dashboard.plaid.com/signup
2. Fill in your details and verify email
3. Complete onboarding questionnaire
4. Choose "Sandbox" for development

### 2. Get API Credentials

1. Go to https://dashboard.plaid.com/team/keys
2. Copy your Sandbox credentials:
   - `client_id`
   - `secret`

### 3. Generate Encryption Key

```bash
openssl rand -base64 32
```

Save this key - you'll need it to decrypt stored access tokens.

### 4. Configure Environment Variables

Add to `apps/api/.env.local`:

```bash
# Plaid Integration
PLAID_ENV=sandbox
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ACCESS_TOKEN_ENCRYPTION_KEY=your_generated_key
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=http://localhost:5173/oauth/callback
```

### 5. Configure Redirect URI in Plaid Dashboard

1. Go to https://dashboard.plaid.com/team/api
2. Navigate to "Allowed redirect URIs"
3. Add: `http://localhost:5173/oauth/callback`
4. Click "Save"

### 6. Install Plaid SDK

```bash
pnpm add plaid
```

### 7. Test Connection

Create a test script or use the built-in test in the wizard.

## Environment Modes

### Sandbox (Recommended for Development)

- **Free tier:** Unlimited
- **Use for:** Local development, testing, CI/CD
- **Test credentials:** `user_good` / `pass_good`
- **Data:** Synthetic test data

**Setup:**
```bash
PLAID_ENV=sandbox
```

### Development (Limited Free Usage)

- **Free tier:** 100 Item creations/month
- **Use for:** Integration testing with real banks
- **Test credentials:** Your actual bank credentials
- **Data:** Real data from your accounts

**Setup:**
```bash
PLAID_ENV=development
```

### Production (Requires Approval)

- **Cost:** Pay per API call
- **Use for:** Live production environment
- **Requirements:** 
  - Business verification
  - Privacy policy
  - Terms of service
  - App approval process

**Setup:**
```bash
PLAID_ENV=production
```

## Testing Your Setup

### 1. Verify Environment Variables

```bash
# From project root
grep PLAID apps/api/.env.local
```

Should show all required variables set.

### 2. Test API Connection

The setup wizard includes an optional connection test. You can also test manually:

```typescript
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const config = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
});

const client = new PlaidApi(config);

// Test by creating a link token
const response = await client.linkTokenCreate({
  user: { client_user_id: 'test-user' },
  client_name: 'SuperBasic Finance',
  products: ['transactions'],
  country_codes: ['US'],
  language: 'en',
});

console.log('✅ Connection successful!');
console.log('Link token:', response.data.link_token);
```

### 3. Test Encryption/Decryption

```typescript
import crypto from 'crypto';

const KEY = Buffer.from(process.env.PLAID_ACCESS_TOKEN_ENCRYPTION_KEY!, 'base64');
const testToken = 'access-sandbox-test-token';

// Encrypt
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
let encrypted = cipher.update(testToken, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag();
const encryptedToken = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

// Decrypt
const [ivHex, authTagHex, encryptedText] = encryptedToken.split(':');
const decipher = crypto.createDecipheriv(
  'aes-256-gcm',
  KEY,
  Buffer.from(ivHex, 'hex')
);
decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
decrypted += decipher.final('utf8');

console.log('Original:', testToken);
console.log('Encrypted:', encryptedToken);
console.log('Decrypted:', decrypted);
console.log('Match:', testToken === decrypted ? '✅' : '❌');
```

## Sandbox Testing

### Test Credentials

Use these in Plaid Link when testing in Sandbox mode:

**Successful Connection:**
- Username: `user_good`
- Password: `pass_good`
- Any test institution

**Authentication Error:**
- Username: `user_bad`
- Password: `pass_good`

**Locked Account:**
- Username: `user_locked`
- Password: `pass_good`

### Test Institutions

The sandbox includes test versions of real banks:
- Chase (transactions, balance, auth)
- Bank of America (transactions, balance)
- Wells Fargo (transactions, balance)
- Citi (transactions, balance, investments)
- And many more...

## Troubleshooting

### "Invalid credentials" error

**Problem:** Plaid API returns 401 Unauthorized

**Solutions:**
- Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` are correct
- Check you're using credentials for the right environment (sandbox/development/production)
- Ensure no extra whitespace in credentials
- Verify credentials are for the correct Plaid account

### "Redirect URI not allowed" error

**Problem:** OAuth flow fails with redirect error

**Solutions:**
- Add redirect URI to Plaid dashboard: https://dashboard.plaid.com/team/api
- Ensure URI exactly matches (including protocol, port, path)
- Check spelling and capitalization
- Verify you saved changes in Plaid dashboard

### "Encryption key error" when decrypting tokens

**Problem:** Cannot decrypt stored access tokens

**Solutions:**
- Verify `PLAID_ACCESS_TOKEN_ENCRYPTION_KEY` hasn't changed
- Ensure key is base64-encoded
- Check key is exactly 32 bytes (44 characters in base64)
- If key is lost, you must re-authenticate all connections

### Link initialization fails

**Problem:** Plaid Link doesn't load in web UI

**Solutions:**
- Verify link token creation endpoint works
- Check browser console for errors
- Ensure Plaid Link SDK is loaded
- Verify `PLAID_ENV` matches your credentials

## Next Steps

After completing setup:

1. **Review Phase 4 specifications:**
   - `.kiro/specs/plaid-bank-connections/requirements.md`
   - `.kiro/specs/plaid-bank-connections/design.md`
   - `.kiro/specs/plaid-bank-connections/tasks.md`

2. **Read the quick reference:**
   - `.plaid-setup-reference.md`

3. **Start implementation:**
   - Database schema and migrations
   - Plaid client wrapper
   - API endpoints
   - Web UI integration

4. **Test thoroughly:**
   - Use Sandbox extensively
   - Test all error scenarios
   - Verify webhook handling
   - Test OAuth flow for supported banks

## Resources

### Official Documentation

- **Plaid Docs:** https://plaid.com/docs/
- **Plaid Quickstart:** https://plaid.com/docs/quickstart/
- **Plaid API Reference:** https://plaid.com/docs/api/
- **Plaid Link:** https://plaid.com/docs/link/

### Plaid Dashboard

- **Main Dashboard:** https://dashboard.plaid.com
- **API Keys:** https://dashboard.plaid.com/team/keys
- **API Settings:** https://dashboard.plaid.com/team/api
- **Logs:** https://dashboard.plaid.com/logs

### Project Documentation

- **Agents Guide:** `.kiro/steering/agents.md`
- **Database Schema:** `.kiro/steering/database-schema.md`
- **Phase 4 Specs:** `.kiro/specs/plaid-bank-connections/`
- **Quick Reference:** `.plaid-setup-reference.md`

## Support

### Plaid Support

- **Email:** support@plaid.com
- **Dashboard Chat:** Use widget in bottom-right of dashboard
- **Status Page:** https://status.plaid.com

### Project Support

- **GitHub Issues:** Create an issue for bugs or questions
- **Documentation:** Check `.kiro/steering/` and `docs/` directories
- **Team:** Contact project maintainers

---

**Ready to start?**

```bash
pnpm setup:plaid
```

**Already set up?**

Check the quick reference: `.plaid-setup-reference.md`
