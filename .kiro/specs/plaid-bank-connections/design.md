# Phase 4: Plaid Integration - Technical Design

## Overview

This document defines the technical architecture for integrating Plaid Link to enable bank account connections in SuperBasic Finance. The design follows the established service/repository pattern from Phase 3.5 and maintains the API-first, thin client architecture.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Client                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Plaid Link   │  │ Connections  │  │ Account      │          │
│  │ Component    │  │ List         │  │ Details      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS/JSON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Server (Hono)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Route Handlers                         │   │
│  │  POST /v1/plaid/link-token                               │   │
│  │  POST /v1/plaid/exchange                                 │   │
│  │  GET  /v1/plaid/connections                              │   │
│  │  POST /v1/plaid/sync                                     │   │
│  │  POST /v1/webhooks/plaid                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Plaid Service (@repo/core)                   │   │
│  │  - createLinkToken()                                     │   │
│  │  - exchangePublicToken()                                 │   │
│  │  - syncAccounts()                                        │   │
│  │  - handleWebhook()                                       │   │
│  │  - getConnections()                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Plaid Repository (@repo/core)                   │   │
│  │  - createConnection()                                    │   │
│  │  - updateConnection()                                    │   │
│  │  - getConnectionsByUserId()                              │   │
│  │  - createAccount()                                       │   │
│  │  - updateAccount()                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ plaid_items  │  │ plaid_       │  │ plaid_       │          │
│  │              │  │ accounts     │  │ webhooks     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Plaid API (External)                        │
│  - Link Token Creation                                           │
│  - Public Token Exchange                                         │
│  - Account Metadata Retrieval                                    │
│  - Webhook Events                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### plaid_items Table

Stores Plaid Item connections (one per financial institution per user).

```prisma
model PlaidItem {
  id                String    @id @default(cuid())
  userId            String    // Foreign key to users.id
  profileId         String?   // Foreign key to profiles.id (optional)
  
  // Plaid identifiers
  itemId            String    @unique // Plaid's item_id
  accessToken       String    // Encrypted access token
  
  // Institution metadata
  institutionId     String    // Plaid institution_id
  institutionName   String    // Human-readable name
  
  // Connection status
  status            String    @default("active") // active, error, expired
  errorCode         String?   // Plaid error code if status=error
  errorMessage      String?   // Human-readable error message
  
  // Timestamps
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastSyncedAt      DateTime? // Last successful account sync
  
  // Relations
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  profile           Profile?  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  accounts          PlaidAccount[]
  webhooks          PlaidWebhook[]
  
  @@index([userId])
  @@index([profileId])
  @@index([status])
}
```

### plaid_accounts Table

Stores bank account metadata from Plaid.

```prisma
model PlaidAccount {
  id                String    @id @default(cuid())
  itemId            String    // Foreign key to plaid_items.id
  
  // Plaid identifiers
  accountId         String    @unique // Plaid's account_id
  
  // Account metadata
  name              String    // Account name (e.g., "Chase Checking")
  officialName      String?   // Official account name from institution
  type              String    // checking, savings, credit, investment, etc.
  subtype           String?   // More specific type (e.g., "401k")
  mask              String?   // Last 4 digits of account number
  
  // Balance information
  currentBalance    Decimal?  @db.Decimal(19, 4)
  availableBalance  Decimal?  @db.Decimal(19, 4)
  isoCurrencyCode   String?   @default("USD")
  
  // Timestamps
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  balanceUpdatedAt  DateTime? // Last balance update
  
  // Relations
  item              PlaidItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  @@index([itemId])
  @@index([accountId])
}
```

### plaid_webhooks Table

Audit log for Plaid webhook events.

```prisma
model PlaidWebhook {
  id                String    @id @default(cuid())
  itemId            String?   // Foreign key to plaid_items.id (null for non-item events)
  
  // Webhook metadata
  webhookType       String    // TRANSACTIONS, ITEM, etc.
  webhookCode       String    // UPDATE_AVAILABLE, ERROR, etc.
  
  // Event data
  payload           Json      // Full webhook payload
  
  // Processing status
  processed         Boolean   @default(false)
  processedAt       DateTime?
  error             String?   // Error message if processing failed
  
  // Timestamps
  receivedAt        DateTime  @default(now())
  
  // Relations
  item              PlaidItem? @relation(fields: [itemId], references: [id], onDelete: SetNull)
  
  @@index([itemId])
  @@index([processed])
  @@index([webhookType, webhookCode])
}
```

## API Endpoints

### POST /v1/plaid/link-token

Create a Link token for initializing Plaid Link.

**Authentication:** Session or PAT with `write:connections` scope

**Request:**
```json
{
  "mode": "create" | "update",
  "itemId": "string" // Required if mode=update
}
```

**Response (201):**
```json
{
  "linkToken": "link-sandbox-abc123...",
  "expiration": "2024-01-01T12:30:00Z"
}
```

**Errors:**
- 401: Unauthorized
- 403: Insufficient scope
- 404: Item not found (update mode)
- 500: Plaid API error

### POST /v1/plaid/exchange

Exchange public token for access token and create connection.

**Authentication:** Session or PAT with `write:connections` scope

**Request:**
```json
{
  "publicToken": "public-sandbox-abc123...",
  "institutionId": "ins_123",
  "institutionName": "Chase"
}
```

**Response (201):**
```json
{
  "itemId": "cuid_abc123",
  "institutionName": "Chase",
  "accounts": [
    {
      "id": "cuid_def456",
      "name": "Chase Checking",
      "type": "checking",
      "mask": "1234",
      "currentBalance": 1234.56,
      "isoCurrencyCode": "USD"
    }
  ]
}
```

**Errors:**
- 401: Unauthorized
- 403: Insufficient scope
- 400: Invalid public token
- 500: Plaid API error

### GET /v1/plaid/connections

List user's bank connections.

**Authentication:** Session or PAT with `read:connections` scope

**Response (200):**
```json
{
  "connections": [
    {
      "id": "cuid_abc123",
      "institutionName": "Chase",
      "status": "active",
      "lastSyncedAt": "2024-01-01T12:00:00Z",
      "accounts": [
        {
          "id": "cuid_def456",
          "name": "Chase Checking",
          "type": "checking",
          "mask": "1234",
          "currentBalance": 1234.56,
          "isoCurrencyCode": "USD"
        }
      ]
    }
  ]
}
```

### POST /v1/plaid/sync

Manually trigger account sync for a connection.

**Authentication:** Session or PAT with `write:connections` scope

**Request:**
```json
{
  "itemId": "cuid_abc123"
}
```

**Response (200):**
```json
{
  "itemId": "cuid_abc123",
  "syncedAt": "2024-01-01T12:00:00Z",
  "accountsUpdated": 2
}
```

**Errors:**
- 401: Unauthorized
- 403: Insufficient scope
- 404: Connection not found
- 423: Connection locked (error status)
- 500: Plaid API error

### POST /v1/webhooks/plaid

Receive webhook events from Plaid.

**Authentication:** HMAC signature verification

**Request:**
```json
{
  "webhook_type": "ITEM",
  "webhook_code": "ERROR",
  "item_id": "plaid_item_123",
  "error": {
    "error_code": "ITEM_LOGIN_REQUIRED",
    "error_message": "the login details of this item have changed..."
  }
}
```

**Response (200):**
```json
{
  "received": true
}
```

## Service Layer Design

### PlaidService

Located in `packages/core/src/plaid/plaid-service.ts`

**Dependencies:**
- `PlaidRepository` - Data access
- `PlaidClient` - Plaid SDK wrapper
- `EncryptionService` - Access token encryption

**Methods:**

```typescript
interface PlaidService {
  // Link token creation
  createLinkToken(params: {
    userId: string;
    profileId?: string;
    mode: 'create' | 'update';
    itemId?: string;
  }): Promise<{ linkToken: string; expiration: Date }>;

  // Public token exchange
  exchangePublicToken(params: {
    userId: string;
    profileId?: string;
    publicToken: string;
    institutionId: string;
    institutionName: string;
  }): Promise<{
    item: PlaidItem;
    accounts: PlaidAccount[];
  }>;

  // Account sync
  syncAccounts(params: {
    userId: string;
    itemId: string;
  }): Promise<{
    itemId: string;
    syncedAt: Date;
    accountsUpdated: number;
  }>;

  // Connection management
  getConnections(params: {
    userId: string;
  }): Promise<PlaidItem[]>;

  // Webhook handling
  handleWebhook(params: {
    webhookType: string;
    webhookCode: string;
    itemId?: string;
    payload: unknown;
  }): Promise<void>;
}
```

### PlaidRepository

Located in `packages/core/src/plaid/plaid-repository.ts`

**Dependencies:**
- `PrismaClient` - Database access

**Methods:**

```typescript
interface PlaidRepository {
  // Item operations
  createItem(data: CreatePlaidItemInput): Promise<PlaidItem>;
  updateItem(id: string, data: UpdatePlaidItemInput): Promise<PlaidItem>;
  getItemById(id: string): Promise<PlaidItem | null>;
  getItemByPlaidItemId(itemId: string): Promise<PlaidItem | null>;
  getItemsByUserId(userId: string): Promise<PlaidItem[]>;

  // Account operations
  createAccount(data: CreatePlaidAccountInput): Promise<PlaidAccount>;
  updateAccount(id: string, data: UpdatePlaidAccountInput): Promise<PlaidAccount>;
  getAccountsByItemId(itemId: string): Promise<PlaidAccount[]>;
  upsertAccounts(itemId: string, accounts: PlaidAccountInput[]): Promise<PlaidAccount[]>;

  // Webhook operations
  createWebhook(data: CreatePlaidWebhookInput): Promise<PlaidWebhook>;
  markWebhookProcessed(id: string): Promise<void>;
  getUnprocessedWebhooks(): Promise<PlaidWebhook[]>;
}
```

## Security Considerations

### Access Token Encryption

Access tokens must be encrypted before storage using AES-256-GCM:

```typescript
// packages/core/src/plaid/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.PLAID_ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptAccessToken(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptAccessToken(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### Webhook Signature Verification

Verify Plaid webhook signatures using HMAC-SHA256:

```typescript
// packages/core/src/plaid/webhook-verification.ts
import { createHmac } from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
}
```

## Error Handling

### Domain Errors

```typescript
// packages/core/src/plaid/plaid-errors.ts

export class PlaidConnectionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'PlaidConnectionError';
  }
}

export class PlaidItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Plaid item not found: ${itemId}`);
    this.name = 'PlaidItemNotFoundError';
  }
}

export class PlaidInvalidTokenError extends Error {
  constructor() {
    super('Invalid or expired Plaid token');
    this.name = 'PlaidInvalidTokenError';
  }
}

export class PlaidInstitutionDownError extends Error {
  constructor(institutionName: string) {
    super(`Institution unavailable: ${institutionName}`);
    this.name = 'PlaidInstitutionDownError';
  }
}

export class PlaidItemLockedError extends Error {
  constructor(itemId: string) {
    super(`Item requires re-authentication: ${itemId}`);
    this.name = 'PlaidItemLockedError';
  }
}
```

### Error Mapping

Route handlers map domain errors to HTTP status codes:

```typescript
// apps/api/src/routes/v1/plaid/exchange.ts
try {
  const result = await plaidService.exchangePublicToken({ ... });
  return c.json(result, 201);
} catch (error) {
  if (error instanceof PlaidInvalidTokenError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof PlaidInstitutionDownError) {
    return c.json({ error: error.message }, 503);
  }
  if (error instanceof PlaidItemLockedError) {
    return c.json({ error: error.message }, 423);
  }
  throw error; // Let global error handler catch unexpected errors
}
```

## Testing Strategy

### Unit Tests

Test service layer with mocked repository and Plaid client:

```typescript
// packages/core/src/plaid/__tests__/plaid-service.test.ts
describe('PlaidService', () => {
  it('should create link token for new connection', async () => {
    const mockPlaidClient = {
      linkTokenCreate: vi.fn().mockResolvedValue({
        link_token: 'link-sandbox-abc123',
        expiration: '2024-01-01T12:30:00Z',
      }),
    };
    
    const service = new PlaidService(mockRepository, mockPlaidClient);
    
    const result = await service.createLinkToken({
      userId: 'user_123',
      mode: 'create',
    });
    
    expect(result.linkToken).toBe('link-sandbox-abc123');
    expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith({
      user: { client_user_id: 'user_123' },
      client_name: 'SuperBasic Finance',
      products: ['auth', 'transactions'],
      country_codes: ['US'],
      language: 'en',
    });
  });
});
```

### Integration Tests

Test repository layer with test database:

```typescript
// packages/core/src/plaid/__tests__/plaid-repository.test.ts
describe('PlaidRepository', () => {
  it('should create and retrieve plaid item', async () => {
    const item = await repository.createItem({
      userId: 'user_123',
      itemId: 'plaid_item_123',
      accessToken: 'encrypted_token',
      institutionId: 'ins_123',
      institutionName: 'Chase',
    });
    
    const retrieved = await repository.getItemById(item.id);
    
    expect(retrieved).toMatchObject({
      userId: 'user_123',
      itemId: 'plaid_item_123',
      institutionName: 'Chase',
      status: 'active',
    });
  });
});
```

### E2E Tests

Test complete flow with Plaid Sandbox:

```typescript
// apps/api/src/routes/v1/plaid/__tests__/plaid-flow.e2e.test.ts
describe('Plaid Integration E2E', () => {
  it('should complete bank connection flow', async () => {
    // 1. Create link token
    const linkTokenRes = await request(app)
      .post('/v1/plaid/link-token')
      .set('Cookie', sessionCookie)
      .send({ mode: 'create' });
    
    expect(linkTokenRes.status).toBe(201);
    const { linkToken } = linkTokenRes.body;
    
    // 2. Simulate Plaid Link flow (use Sandbox public token)
    const publicToken = 'public-sandbox-test-token';
    
    // 3. Exchange public token
    const exchangeRes = await request(app)
      .post('/v1/plaid/exchange')
      .set('Cookie', sessionCookie)
      .send({
        publicToken,
        institutionId: 'ins_109508',
        institutionName: 'First Platypus Bank',
      });
    
    expect(exchangeRes.status).toBe(201);
    expect(exchangeRes.body.accounts).toHaveLength(2);
    
    // 4. Verify connection appears in list
    const connectionsRes = await request(app)
      .get('/v1/plaid/connections')
      .set('Cookie', sessionCookie);
    
    expect(connectionsRes.status).toBe(200);
    expect(connectionsRes.body.connections).toHaveLength(1);
  });
});
```

## Environment Configuration

```bash
# Plaid API Credentials
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET_SANDBOX=your_sandbox_secret
PLAID_SECRET_DEVELOPMENT=your_development_secret
PLAID_SECRET_PRODUCTION=your_production_secret
PLAID_ENV=sandbox # sandbox | development | production

# Encryption
PLAID_ENCRYPTION_KEY=64_character_hex_string # 32 bytes

# Webhook
PLAID_WEBHOOK_SECRET=your_webhook_secret
PLAID_WEBHOOK_URL=https://api.superbasicfinance.com/v1/webhooks/plaid
```

## Performance Considerations

### Caching

- Cache institution metadata (name, logo) for 24 hours
- Cache account balances for 5 minutes (refresh on manual sync)

### Rate Limiting

- Link token creation: 10 per hour per user
- Public token exchange: 5 per hour per user
- Manual sync: 3 per hour per connection

### Database Indexes

```sql
-- Optimize connection lookups
CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX idx_plaid_items_status ON plaid_items(status);

-- Optimize account queries
CREATE INDEX idx_plaid_accounts_item_id ON plaid_accounts(item_id);

-- Optimize webhook processing
CREATE INDEX idx_plaid_webhooks_processed ON plaid_webhooks(processed);
CREATE INDEX idx_plaid_webhooks_type_code ON plaid_webhooks(webhook_type, webhook_code);
```

## Migration Path

1. Create database migration for new tables
2. Implement repository layer with tests
3. Implement service layer with tests
4. Create API route handlers
5. Add Plaid SDK wrapper
6. Implement encryption utilities
7. Add webhook handler
8. Create web client components
9. Add E2E tests
10. Deploy to staging with Sandbox
11. Test with real bank accounts in Development
12. Deploy to production

## Rollback Plan

If issues arise:
1. Disable Plaid routes via feature flag
2. Hide bank connection UI in web client
3. Preserve existing data (no destructive migrations)
4. Investigate and fix issues in staging
5. Redeploy when ready

## Success Metrics

- Link token creation latency < 1 second
- Public token exchange latency < 3 seconds
- Account sync latency < 5 seconds
- Webhook processing latency < 2 seconds
- Connection success rate > 95%
- Zero plaintext access tokens in logs or database
