import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerUser,
  loginUser,
  logoutUser,
  verifyAuthenticated,
  verifyNotAuthenticated,
  attemptProtectedRoute,
} from './helpers';

test.describe('Authentication E2E Tests', () => {
  /**
   * Task 8.1: Registration E2E Tests
   * Requirements: 6.1, 6.2
   */
  test.describe('Registration Flow', () => {
    test('should navigate to registration page', async ({ page }) => {
      await page.goto('/register');

      // Verify registration page loads
      await expect(page).toHaveURL('/register');
      await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();

      // Verify form elements are present
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('input[name="passwordConfirmation"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should submit registration form with valid data', async ({ page }) => {
      const user = generateTestUser();

      await page.goto('/register');

      // Fill in registration form
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="name"]', user.name || '');
      await page.fill('input[name="password"]', user.password);
      await page.fill('input[name="passwordConfirmation"]', user.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for navigation (should redirect to home after auto-login)
      await page.waitForURL('/', { timeout: 10000 });

      // Verify user is authenticated
      await verifyAuthenticated(page, user.email);
    });

    test('should redirect to home page after successful registration', async ({ page }) => {
      const user = generateTestUser();

      await page.goto('/register');

      // Fill and submit registration form
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="name"]', user.name || '');
      await page.fill('input[name="password"]', user.password);
      await page.fill('input[name="passwordConfirmation"]', user.password);
      await page.click('button[type="submit"]');

      // Should redirect to home page
      await expect(page).toHaveURL('/', { timeout: 10000 });

      // Should display user information
      await expect(page.locator('text=Logged in as')).toBeVisible();
      await expect(page.locator(`text=${user.email}`)).toBeVisible();
    });

    test('should show error for duplicate email', async ({ page }) => {
      const user = generateTestUser();

      // Register user first time
      await registerUser(page, user);

      // Logout
      await logoutUser(page);

      // Try to register again with same email
      await page.goto('/register');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="name"]', 'Another User');
      await page.fill('input[name="password"]', user.password);
      await page.fill('input[name="passwordConfirmation"]', user.password);
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('text=/email.*already.*exists/i')).toBeVisible({ timeout: 5000 });

      // Should remain on registration page
      await expect(page).toHaveURL('/register');
    });

    test('should show validation error for invalid email', async ({ page }) => {
      await page.goto('/register');

      // Fill with invalid email
      await page.fill('input[name="email"]', 'invalid-email');
      await page.fill('input[name="password"]', 'Test1234!');
      await page.fill('input[name="passwordConfirmation"]', 'Test1234!');

      // Blur email field to trigger validation
      await page.locator('input[name="password"]').click();

      // Should show validation error
      await expect(page.locator('text=/invalid.*email/i')).toBeVisible();
    });

    test('should show validation error for weak password', async ({ page }) => {
      await page.goto('/register');

      // Fill with weak password
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'weak');
      await page.fill('input[name="passwordConfirmation"]', 'weak');

      // Blur password field to trigger validation
      await page.locator('input[name="passwordConfirmation"]').click();

      // Should show validation error
      await expect(page.locator('text=/at least 8 characters/i')).toBeVisible();
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.goto('/register');

      // Fill with mismatched passwords
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'Test1234!');
      await page.fill('input[name="passwordConfirmation"]', 'Different1234!');

      // Blur confirmation field to trigger validation
      await page.locator('button[type="submit"]').click();

      // Should show validation error
      await expect(page.locator('text=/passwords do not match/i')).toBeVisible();
    });
  });

  /**
   * Task 8.2: Login E2E Tests
   * Requirements: 6.3, 6.4
   */
  test.describe('Login Flow', () => {
    test('should navigate to login page', async ({ page }) => {
      await page.goto('/login');

      // Verify login page loads
      await expect(page).toHaveURL('/login');
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();

      // Verify form elements are present
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should submit login form with valid credentials', async ({ page }) => {
      // Register a user first
      const user = generateTestUser();
      await registerUser(page, user);
      await logoutUser(page);

      // Now login
      await page.goto('/login');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      // Should redirect to home page
      await page.waitForURL('/', { timeout: 10000 });
    });

    test('should redirect to dashboard after successful login', async ({ page }) => {
      // Register a user first
      const user = generateTestUser();
      await registerUser(page, user);
      await logoutUser(page);

      // Login
      await loginUser(page, user);

      // Should be on home page (dashboard)
      await expect(page).toHaveURL('/');
      await expect(page.locator('h1:has-text("SuperBasic Finance")')).toBeVisible();
    });

    test('should display user information on dashboard', async ({ page }) => {
      // Register a user first
      const user = generateTestUser();
      await registerUser(page, user);
      await logoutUser(page);

      // Login
      await loginUser(page, user);

      // Verify user information is displayed
      await expect(page.locator('text=Logged in as')).toBeVisible();
      await expect(page.locator(`text=${user.email}`)).toBeVisible();

      if (user.name) {
        await expect(page.locator(`text=${user.name}`)).toBeVisible();
      }
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      // Try to login with invalid credentials
      await page.fill('input[name="email"]', 'nonexistent@example.com');
      await page.fill('input[name="password"]', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('text=/invalid.*credentials/i')).toBeVisible({ timeout: 5000 });

      // Should remain on login page
      await expect(page).toHaveURL('/login');
    });

    test('should show error for wrong password', async ({ page }) => {
      // Register a user first
      const user = generateTestUser();
      await registerUser(page, user);
      await logoutUser(page);

      // Try to login with wrong password
      await page.goto('/login');
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('text=/invalid.*credentials/i')).toBeVisible({ timeout: 5000 });

      // Should remain on login page
      await expect(page).toHaveURL('/login');
    });
  });

  /**
   * Task 8.3: Session Persistence E2E Tests
   * Requirements: 6.6
   */
  test.describe('Session Persistence', () => {
    test('should persist session after page refresh', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Verify authenticated
      await verifyAuthenticated(page, user.email);

      // Refresh the page
      await page.reload();

      // Should still be authenticated
      await verifyAuthenticated(page, user.email);
    });

    test('should remain authenticated after navigation', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate away and back
      await page.goto('/login');
      await page.goto('/');

      // Should still be authenticated
      await verifyAuthenticated(page, user.email);
    });

    test('should access protected routes when authenticated', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to home (protected route)
      await page.goto('/');

      // Should be able to access it
      await expect(page).toHaveURL('/');
      await expect(page.locator('text=Logged in as')).toBeVisible();
    });

    test('should maintain session across multiple page loads', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate multiple times
      for (let i = 0; i < 3; i++) {
        await page.goto('/');
        await verifyAuthenticated(page, user.email);
        await page.reload();
        await verifyAuthenticated(page, user.email);
      }
    });
  });

  /**
   * Task 8.4: Logout E2E Tests
   * Requirements: 6.5, 6.7
   */
  test.describe('Logout Flow', () => {
    test('should click logout button', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Verify logout button is present
      await expect(page.locator('button:has-text("Sign out")')).toBeVisible();

      // Click logout
      await page.click('button:has-text("Sign out")');

      // Should redirect to login page
      await page.waitForURL('/login', { timeout: 10000 });
    });

    test('should redirect to login page after logout', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Logout
      await logoutUser(page);

      // Should be on login page
      await expect(page).toHaveURL('/login');
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();
    });

    test('should clear session after logout', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Logout
      await logoutUser(page);

      // Try to access protected route
      await page.goto('/');

      // Should be redirected to login
      await verifyNotAuthenticated(page);
    });

    test('should redirect to login when accessing protected routes after logout', async ({
      page,
    }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Logout
      await logoutUser(page);

      // Try to access home page (protected)
      await attemptProtectedRoute(page, '/');

      // Should be on login page
      await verifyNotAuthenticated(page);
    });

    test('should not be able to use old session after logout', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Logout
      await logoutUser(page);

      // Try to navigate back
      await page.goBack();

      // Should still be redirected to login
      await page.waitForURL('/login', { timeout: 10000 });
      await verifyNotAuthenticated(page);
    });
  });

  /**
   * Task 8.5: Complete Authentication Journey E2E Test
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
   */
  test.describe('Complete Authentication Journey', () => {
    test('should complete full flow: register → login → dashboard → logout', async ({ page }) => {
      const user = generateTestUser();

      // Step 1: Register
      await page.goto('/register');
      await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();

      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="name"]', user.name || '');
      await page.fill('input[name="password"]', user.password);
      await page.fill('input[name="passwordConfirmation"]', user.password);
      await page.click('button[type="submit"]');

      // Should redirect to home after registration
      await page.waitForURL('/', { timeout: 10000 });
      await verifyAuthenticated(page, user.email);

      // Step 2: Logout
      await logoutUser(page);
      await verifyNotAuthenticated(page);

      // Step 3: Login
      await page.goto('/login');
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();

      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');

      // Step 4: Dashboard
      await page.waitForURL('/', { timeout: 10000 });
      await expect(page.locator('h1:has-text("SuperBasic Finance")')).toBeVisible();
      await expect(page.locator('text=Logged in as')).toBeVisible();
      await expect(page.locator(`text=${user.email}`)).toBeVisible();

      // Step 5: Verify session persists
      await page.reload();
      await verifyAuthenticated(page, user.email);

      // Step 6: Final logout
      await logoutUser(page);
      await verifyNotAuthenticated(page);

      // Step 7: Verify cannot access protected routes
      await attemptProtectedRoute(page, '/');
    });

    test('should verify data persists across authentication steps', async ({ page }) => {
      const user = generateTestUser({ name: 'Persistent User' });

      // Register with name
      await registerUser(page, user);

      // Verify name is displayed
      await expect(page.locator(`text=${user.name}`)).toBeVisible();

      // Logout and login again
      await logoutUser(page);
      await loginUser(page, user);

      // Name should still be displayed
      await expect(page.locator(`text=${user.name}`)).toBeVisible();
      await expect(page.locator(`text=${user.email}`)).toBeVisible();
    });

    test('should handle multiple authentication cycles', async ({ page }) => {
      const user = generateTestUser();

      // Register
      await registerUser(page, user);
      await verifyAuthenticated(page, user.email);

      // Cycle 1: Logout and login
      await logoutUser(page);
      await loginUser(page, user);
      await verifyAuthenticated(page, user.email);

      // Cycle 2: Logout and login
      await logoutUser(page);
      await loginUser(page, user);
      await verifyAuthenticated(page, user.email);

      // Cycle 3: Logout and login
      await logoutUser(page);
      await loginUser(page, user);
      await verifyAuthenticated(page, user.email);

      // Final logout
      await logoutUser(page);
      await verifyNotAuthenticated(page);
    });
  });

  /**
   * Additional: Protected Route Access Control
   * Requirements: 6.7
   */
  test.describe('Protected Route Access Control', () => {
    test('should redirect to login when accessing protected route without authentication', async ({
      page,
    }) => {
      // Try to access home page without authentication
      await page.goto('/');

      // Should be redirected to login
      await verifyNotAuthenticated(page);
    });

    test('should allow access to public routes without authentication', async ({ page }) => {
      // Login page should be accessible
      await page.goto('/login');
      await expect(page).toHaveURL('/login');
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible();

      // Register page should be accessible
      await page.goto('/register');
      await expect(page).toHaveURL('/register');
      await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();
    });

    test('should redirect authenticated users from login to home', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Try to access login page while authenticated
      await page.goto('/login');

      // Should redirect to home
      await page.waitForURL('/', { timeout: 10000 });
      await verifyAuthenticated(page, user.email);
    });

    test('should redirect authenticated users from register to home', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Try to access register page while authenticated
      await page.goto('/register');

      // Should redirect to home
      await page.waitForURL('/', { timeout: 10000 });
      await verifyAuthenticated(page, user.email);
    });
  });
});
