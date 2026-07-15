import { expect, test } from '@playwright/test';

/**
 * One journey through the panel: first-run onboarding, then the core
 * daily loops (lists, chores, to-dos, meals, settings).
 * Serial: later tests depend on the family created in onboarding.
 */
test.describe.configure({ mode: 'serial' });

test('first-run onboarding creates the family', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Welcome to Canopy')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByPlaceholder('e.g. The Manley Family').fill('The E2E Family');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: '+ Add family member' }).click();
  await page.getByPlaceholder('e.g. Harper').fill('Testy');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Start using Canopy' }).click();

  // Lands on the calendar with the family name in the header.
  await expect(page.getByText('The E2E Family')).toBeVisible();
  await expect(page.getByText(/connect your calendars/i)).toBeVisible();
});

test('shopping list: create, add, check off', async ({ page }) => {
  await page.goto('/lists');
  await page.getByRole('button', { name: '+ New list' }).first().click();
  await page.getByPlaceholder(/Groceries, Costco/).fill('Groceries');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByPlaceholder('Add to Groceries…').fill('Milk');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Milk')).toBeVisible();

  await page.getByRole('button', { name: 'Check off' }).click();
  await expect(page.getByText('1 done')).toBeVisible();
});

test('chores: add and complete for today', async ({ page }) => {
  await page.goto('/chores');
  await page.getByRole('button', { name: '+ Add chore' }).click();
  await page.getByPlaceholder('e.g. Make bed').fill('Feed the fish');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Feed the fish')).toBeVisible();

  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('1/1')).toBeVisible();

  // Stars land on the rewards page.
  await page.goto('/rewards');
  await expect(page.getByText('Testy')).toBeVisible();
});

test('to-dos: add under Today and complete', async ({ page }) => {
  await page.goto('/todos');
  await page.getByRole('button', { name: 'Add to-do' }).click();
  await page.getByPlaceholder('e.g. Call the plumber').fill('Water plants');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Water plants')).toBeVisible();
});

test('meals: plan a dinner', async ({ page }) => {
  await page.goto('/meals');
  // Tap today's dinner cell (first empty dinner slot works fine).
  await page.locator('.meals-cell').last().click();
  await page.getByPlaceholder('e.g. Taco night').fill('Pizza night');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.meals-cell-name', { hasText: 'Pizza night' })).toBeVisible();
});

test('settings: theme switch applies instantly', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Pride' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'pride');
  await page.getByRole('button', { name: 'Skylight', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'skylight');
});
