# OAuth POST Fix - UnknownAction Error

**Date**: 2025-10-25  
**Issue**: Clicking "Continue with Google" resulted in `UnknownAction` error and redirect to `/login?error=Configuration`

## Problem

Server logs showed:
```
[auth][error] UnknownAction: Unsupported action
method: 'GET',
url: 'http://localhost:3000/v1/auth/signin/google',
```

The OAuth button was triggering a GET request, but **Auth.js requires POST requests with CSRF tokens** for OAuth signin endpoints.

## Root Cause

The `loginWithGoogle()` function in `apps/web/src/lib/api.ts` was using:

```typescript
loginWithGoogle(): void {
  window.location.href = `${API_URL}/v1/auth/signin/google`;
}
```

This triggers a browser navigation (GET request), not a form submission (POST request).

## Solution

Updated `loginWithGoogle()` to programmatically create and submit a form with CSRF token:

```typescript
async loginWithGoogle(): Promise<void> {
  // Fetch CSRF token
  const csrfResponse = await fetch(`${API_URL}/v1/auth/csrf`, {
    credentials: 'include',
  });
  const { csrfToken } = await csrfResponse.json();

  // Create form with CSRF token and callbackUrl
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${API_URL}/v1/auth/signin/google`;

  const csrfInput = document.createElement('input');
  csrfInput.type = 'hidden';
  csrfInput.name = 'csrfToken';
  csrfInput.value = csrfToken;
  form.appendChild(csrfInput);

  const callbackInput = document.createElement('input');
  callbackInput.type = 'hidden';
  callbackInput.name = 'callbackUrl';
  callbackInput.value = `${window.location.origin}/`;
  form.appendChild(callbackInput);

  // Submit form
  document.body.appendChild(form);
  form.submit();
}
```

## Why This Works

1. **CSRF Protection**: Auth.js requires CSRF tokens for all authentication requests
2. **POST Method**: OAuth signin endpoints only accept POST requests
3. **Form Submission**: Browser handles the form submission and redirect properly
4. **CallbackUrl**: Tells Auth.js where to redirect after OAuth completion

## Files Modified

- `apps/web/src/lib/api.ts` - Updated `loginWithGoogle()` to use form submission
- `apps/web/src/contexts/AuthContext.tsx` - Updated to handle async `loginWithGoogle()`

## Testing

```bash
# Start dev servers
pnpm dev

# Open browser
open http://localhost:5173/login

# Click "Continue with Google"
# Should:
# 1. ✅ Redirect to Google OAuth consent screen (no error)
# 2. ✅ After consent, redirect back to app
# 3. ✅ User logged in automatically
# 4. ✅ No console errors
```

## Key Learning

Auth.js OAuth endpoints require:
- POST method (not GET)
- CSRF token in request body
- Form-encoded data (`application/x-www-form-urlencoded`)

Simple `window.location.href` redirects won't work - must use form submission.
