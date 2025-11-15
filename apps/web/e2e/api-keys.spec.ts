import { test, expect } from '@playwright/test';
import { generateTestUser, registerUser } from './helpers';

test.describe('API Keys E2E Tests', () => {
  /**
   * Task 10.5: API Keys Settings Page
   * Requirements: 10.1, 10.2
   */
  test.describe('API Keys Settings Page', () => {
    test('should navigate to API keys settings from home', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Click "Manage API Keys" button
      await page.click('button:has-text("Manage API Keys")');

      // Should navigate to API keys page
      await expect(page).toHaveURL('/settings/api-keys');
      await expect(page.locator('h1:has-text("API Keys")')).toBeVisible();
    });

    test('should display empty state when no tokens exist', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Should show empty state
      await expect(page.locator('text=No API keys')).toBeVisible();
      await expect(page.locator('text=Get started by creating your first API key')).toBeVisible();
      await expect(page.locator('button:has-text("Create API Key")')).toBeVisible();
    });

    test('should display token list when tokens exist', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Create a token first
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Test Token');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Close token display modal
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Should display token in list
      await expect(page.locator('text=Test Token')).toBeVisible();
      await expect(page.locator('text=read:transactions')).toBeVisible();
      await expect(page.locator('text=Never used')).toBeVisible();
    });
  });

  /**
   * Task 10.5: Token Creation Flow
   * Requirements: 10.3, 10.4
   */
  test.describe('Token Creation Flow', () => {
    test('should open create token modal', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Click create button
      await page.click('button:has-text("Create API Key")');

      // Modal should be visible
      await expect(page.locator('h3:has-text("Create API Key")')).toBeVisible();
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('text=Scopes')).toBeVisible();
      await expect(page.locator('text=Expiration')).toBeVisible();
    });

    test('should create token with valid data', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Open create modal
      await page.click('button:has-text("Create API Key")');

      // Fill form
      await page.fill('input[name="name"]', 'CI/CD Pipeline');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('input[type="checkbox"][value="write:transactions"]');
      await page.selectOption('select#expiration', '90');

      // Submit
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Should show token display modal
      await expect(page.locator('h3:has-text("API Key Created Successfully")')).toBeVisible();
      await expect(page.locator('text=CI/CD Pipeline')).toBeVisible();
      await expect(page.locator('text=Save this token now')).toBeVisible();
    });

    test('should display plaintext token with copy button', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Create token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Test Token');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Token should be displayed
      const tokenInput = page.locator('input[readonly][value^="sbf_"]');
      await expect(tokenInput).toBeVisible();

      // Copy button should be visible
      await expect(page.locator('button:has-text("Copy")')).toBeVisible();

      // Click copy button
      await page.click('button:has-text("Copy")');

      // Should show "Copied!" feedback
      await expect(page.locator('text=Copied!')).toBeVisible({ timeout: 2000 });
    });

    test('should require confirmation before closing token display', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Create token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Test Token');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Done button should be disabled initially
      const doneButton = page.locator('button:has-text("Done")');
      await expect(doneButton).toBeDisabled();

      // Check confirmation checkbox
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');

      // Done button should now be enabled
      await expect(doneButton).toBeEnabled();

      // Click done
      await doneButton.click();

      // Should return to token list
      await expect(page.locator('h1:has-text("API Keys")')).toBeVisible();
      await expect(page.locator('text=Test Token')).toBeVisible();
    });

    test('should show validation error for empty name', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Open create modal
      await page.click('button:has-text("Create API Key")');

      // Try to submit without name
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Should show validation error
      await expect(page.locator('text=/name.*required/i')).toBeVisible();
    });

    test('should show validation error for no scopes selected', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Open create modal
      await page.click('button:has-text("Create API Key")');

      // Fill name but no scopes
      await page.fill('input[name="name"]', 'Test Token');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Should show validation error
      await expect(page.locator('text=/at least one scope.*required/i')).toBeVisible();
    });

    test('should show error for duplicate token name', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Create first token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Duplicate Name');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Try to create second token with same name
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Duplicate Name');
      await page.click('input[type="checkbox"][value="read:budgets"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Should show error
      await expect(page.locator('text=/name.*already.*exists/i')).toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * Task 10.5: Token Revocation Flow
   * Requirements: 10.5
   */
  test.describe('Token Revocation Flow', () => {
    test('should show revoke confirmation dialog', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Token to Revoke');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Click revoke button
      await page.click('button:has-text("Revoke")');

      // Should show confirmation dialog
      await expect(page.locator('h3:has-text("Revoke API Key")')).toBeVisible();
      await expect(page.locator('text=Are you sure')).toBeVisible();
      await expect(page.locator('text=Token to Revoke')).toBeVisible();
      await expect(page.locator('text=This action cannot be undone')).toBeVisible();
    });

    test('should cancel revocation', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Token to Keep');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Click revoke button
      await page.click('button:has-text("Revoke")');

      // Click cancel
      await page.click('button:has-text("Cancel")');

      // Token should still be in list
      await expect(page.locator('text=Token to Keep')).toBeVisible();
    });

    test('should revoke token successfully', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Token to Delete');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Verify token is in list
      await expect(page.locator('text=Token to Delete')).toBeVisible();

      // Click revoke button
      await page.click('button:has-text("Revoke")');

      // Confirm revocation
      await page.click('button:has-text("Revoke"):not(:has-text("Cancel"))');

      // Token should be removed from list
      await expect(page.locator('text=Token to Delete')).not.toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * Task 10.5: Token Name Editing Flow
   * Requirements: 12.5
   */
  test.describe('Token Name Editing Flow', () => {
    test('should open edit name dialog', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Original Name');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Click edit button
      await page.click('button:has-text("Edit")');

      // Should show edit dialog
      await expect(page.locator('h3:has-text("Edit Token Name")')).toBeVisible();
      await expect(page.locator('input[name="name"][value="Original Name"]')).toBeVisible();
    });

    test('should update token name successfully', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Old Name');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Click edit button
      await page.click('button:has-text("Edit")');

      // Change name
      await page.fill('input[name="name"]', 'New Name');
      await page.click('button[type="submit"]:has-text("Save")');

      // Should show updated name in list
      await expect(page.locator('text=New Name')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Old Name')).not.toBeVisible();
    });

    test('should cancel name edit', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Unchanged Name');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Click edit button
      await page.click('button:has-text("Edit")');

      // Change name but cancel
      await page.fill('input[name="name"]', 'Should Not Save');
      await page.click('button:has-text("Cancel")');

      // Should still show original name
      await expect(page.locator('text=Unchanged Name')).toBeVisible();
      await expect(page.locator('text=Should Not Save')).not.toBeVisible();
    });

    test('should show error for duplicate name on edit', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create two tokens
      await page.goto('/settings/api-keys');
      
      // Create first token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Token One');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Create second token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Token Two');
      await page.click('input[type="checkbox"][value="read:budgets"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Try to rename second token to first token's name
      const editButtons = page.locator('button:has-text("Edit")');
      await editButtons.last().click();

      await page.fill('input[name="name"]', 'Token One');
      await page.click('button[type="submit"]:has-text("Save")');

      // Should show error
      await expect(page.locator('text=/name.*already.*exists/i')).toBeVisible({ timeout: 5000 });
    });
  });

  /**
   * Task 10.5: Token Usage Indicators
   * Requirements: 11.3, 11.4, 11.5
   */
  test.describe('Token Usage Indicators', () => {
    test('should display "Never used" for new tokens', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Unused Token');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Should show "Never used" indicator
      await expect(page.locator('text=Never used')).toBeVisible();
    });

    test('should display token metadata correctly', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page and create a token
      await page.goto('/settings/api-keys');
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Metadata Test');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('input[type="checkbox"][value="write:budgets"]');
      await page.selectOption('select#expiration', '90');
      await page.click('button[type="submit"]:has-text("Create API Key")');
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Should display all metadata
      await expect(page.locator('text=Metadata Test')).toBeVisible();
      await expect(page.locator('text=read:transactions')).toBeVisible();
      await expect(page.locator('text=write:budgets')).toBeVisible();
      
      // Should show masked token (sbf_****xxxx format)
      await expect(page.locator('text=/sbf_\\*\\*\\*\\*/i')).toBeVisible();
    });
  });

  /**
   * Task 10.5: Complete Token Management Journey
   * Requirements: 10.1-10.5, 11.3-11.5, 12.5
   */
  test.describe('Complete Token Management Journey', () => {
    test('should complete full flow: create → view → edit → revoke', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Step 1: Navigate to API keys page
      await page.goto('/settings/api-keys');
      await expect(page.locator('h1:has-text("API Keys")')).toBeVisible();

      // Step 2: Create token
      await page.click('button:has-text("Create API Key")');
      await page.fill('input[name="name"]', 'Full Journey Token');
      await page.click('input[type="checkbox"][value="read:transactions"]');
      await page.click('input[type="checkbox"][value="read:budgets"]');
      await page.click('button[type="submit"]:has-text("Create API Key")');

      // Step 3: View plaintext token
      await expect(page.locator('h3:has-text("API Key Created Successfully")')).toBeVisible();
      const tokenInput = page.locator('input[readonly][value^="sbf_"]');
      await expect(tokenInput).toBeVisible();

      // Step 4: Copy token
      await page.click('button:has-text("Copy")');
      await expect(page.locator('text=Copied!')).toBeVisible({ timeout: 2000 });

      // Step 5: Confirm and close
      await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
      await page.click('button:has-text("Done")');

      // Step 6: Verify token in list
      await expect(page.locator('text=Full Journey Token')).toBeVisible();
      await expect(page.locator('text=read:transactions')).toBeVisible();
      await expect(page.locator('text=read:budgets')).toBeVisible();
      await expect(page.locator('text=Never used')).toBeVisible();

      // Step 7: Edit token name
      await page.click('button:has-text("Edit")');
      await page.fill('input[name="name"]', 'Renamed Journey Token');
      await page.click('button[type="submit"]:has-text("Save")');
      await expect(page.locator('text=Renamed Journey Token')).toBeVisible({ timeout: 5000 });

      // Step 8: Revoke token
      await page.click('button:has-text("Revoke")');
      await expect(page.locator('h3:has-text("Revoke API Key")')).toBeVisible();
      await page.click('button:has-text("Revoke"):not(:has-text("Cancel"))');

      // Step 9: Verify token is removed
      await expect(page.locator('text=Renamed Journey Token')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=No API keys')).toBeVisible();
    });

    test('should handle multiple tokens correctly', async ({ page }) => {
      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);

      // Navigate to API keys page
      await page.goto('/settings/api-keys');

      // Create three tokens
      const tokenNames = ['Token Alpha', 'Token Beta', 'Token Gamma'];
      
      for (const name of tokenNames) {
        await page.click('button:has-text("Create API Key")');
        await page.fill('input[name="name"]', name);
        await page.click('input[type="checkbox"][value="read:transactions"]');
        await page.click('button[type="submit"]:has-text("Create API Key")');
        await page.click('input[type="checkbox"]:near(:text("I\'ve saved this token"))');
        await page.click('button:has-text("Done")');
      }

      // Verify all tokens are displayed
      for (const name of tokenNames) {
        await expect(page.locator(`text=${name}`)).toBeVisible();
      }

      // Revoke middle token
      const revokeButtons = page.locator('button:has-text("Revoke")');
      await revokeButtons.nth(1).click();
      await page.click('button:has-text("Revoke"):not(:has-text("Cancel"))');

      // Verify only Beta is removed
      await expect(page.locator('text=Token Alpha')).toBeVisible();
      await expect(page.locator('text=Token Beta')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Token Gamma')).toBeVisible();
    });
  });
});
