import { expect, test } from '@playwright/test';

test('loads an empty canvas without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // three.js sets this once the WebGL renderer has initialised.
  await expect(canvas).toHaveAttribute('data-engine', /three\.js/);
  expect(errors).toEqual([]);
});
