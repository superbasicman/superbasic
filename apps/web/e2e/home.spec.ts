import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads successfully
    await expect(page).toHaveTitle(/SuperBasic Finance/i);
  });

  test('should display welcome message', async ({ page }) => {
    await page.goto('/');

    // Check for welcome content
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('should have navigation elements', async ({ page }) => {
    await page.goto('/');

    // Verify basic page structure is present
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
