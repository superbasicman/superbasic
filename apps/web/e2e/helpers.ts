import { type Page, expect } from '@playwright/test';

/**
 * E2E Test Helper Functions
 *
 * Common utilities for authentication flow testing
 */

export interface TestUser {
  email: string;
  password: string;
  name?: string;
}

/**
 * Generate a unique test user with timestamp to avoid conflicts
 */
export function generateTestUser(overrides?: Partial<TestUser>): TestUser {
  const timestamp = Date.now();
  return {
    email: `test-${timestamp}@example.com`,
    password: 'Test1234!',
    name: 'Test User',
    ...overrides,
  };
}

/**
 * Register a new user via the registration form
 *
 * @param page - Playwright page object
 * @param user - User credentials to register
 * @returns The registered user credentials
 */
export async function registerUser(page: Page, user: TestUser): Promise<TestUser> {
  // Navigate to registration page
  await page.goto('/register');

  // Wait for form to be visible
  await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();

  // Fill in registration form
  await page.fill('input[name="email"]', user.email);

  if (user.name) {
    await page.fill('input[name="name"]', user.name);
  }

  await page.fill('input[name="password"]', user.password);
  await page.fill('input[name="passwordConfirmation"]', user.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation or success
  // Registration should redirect to home page after auto-login
  await page.waitForURL('/', { timeout: 10000 });

  return user;
}

/**
 * Login an existing user via the login form
 *
 * @param page - Playwright page object
 * @param credentials - User email and password
 */
export async function loginUser(
  page: Page,
  credentials: Pick<TestUser, 'email' | 'password'>
): Promise<void> {
  // Navigate to login page
  await page.goto('/login');

  // Wait for form to be visible
  await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();

  // Fill in login form
  await page.fill('input[name="email"]', credentials.email);
  await page.fill('input[name="password"]', credentials.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to home page
  await page.waitForURL('/', { timeout: 10000 });

  // Verify user is logged in by checking for user info
  await expect(page.locator('text=Logged in as')).toBeVisible({ timeout: 5000 });
}

/**
 * Logout the current user
 *
 * @param page - Playwright page object
 */
export async function logoutUser(page: Page): Promise<void> {
  // Click the sign out button
  await page.click('button:has-text("Sign out")');

  // Wait for redirect to login page
  await page.waitForURL('/login', { timeout: 10000 });

  // Verify we're on the login page
  await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();
}

/**
 * Verify user is authenticated and on the home page
 *
 * @param page - Playwright page object
 * @param email - Expected user email
 */
export async function verifyAuthenticated(page: Page, email: string): Promise<void> {
  // Should be on home page
  await expect(page).toHaveURL('/');

  // Should see user info
  await expect(page.locator('text=Logged in as')).toBeVisible();
  await expect(page.locator(`text=${email}`)).toBeVisible();
}

/**
 * Verify user is not authenticated (redirected to login)
 *
 * @param page - Playwright page object
 */
export async function verifyNotAuthenticated(page: Page): Promise<void> {
  // Should be redirected to login page
  await expect(page).toHaveURL('/login');
  await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();
}

/**
 * Attempt to access a protected route and verify redirect
 *
 * @param page - Playwright page object
 * @param route - Protected route to attempt to access
 */
export async function attemptProtectedRoute(page: Page, route: string): Promise<void> {
  await page.goto(route);

  // Should be redirected to login
  await verifyNotAuthenticated(page);
}
