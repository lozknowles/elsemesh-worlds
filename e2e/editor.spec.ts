import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

import path from 'node:path';

test('editor renders and supports a persistent create/edit/export workflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Scene' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const screenshotDir = path.resolve(process.cwd(), '../../outputs');
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, 'elsemesh-worlds-editor.png') });
  await page.getByTitle('Assets').click();
  await page.getByRole('button', { name: /Cube/ }).click();
  await expect(page.getByText('Cube', { exact: true }).first()).toBeVisible();
  await page.getByTitle('World settings').click();
  await page.getByRole('textbox').first().fill('Browser test world');
  await expect(page.getByText('Browser test world').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.topbar .save-state')).toContainText(/^Saved /);
  await page.reload();
  await page.getByTitle('World settings').click();
  await expect(page.getByRole('textbox').first()).toHaveValue('Browser test world');
  await page.getByTitle('Scene').click();
  await expect(page.getByText('Cube', { exact: true }).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export world' }).click(),
  ]);
  await expect(page.getByText(/Player world package exported/)).toBeVisible();
  expect(download.suggestedFilename()).toContain('.emw-world.json');
  const file = await download.path();
  expect(file).not.toBeNull();
  const exported: unknown = JSON.parse(readFileSync(file!, 'utf8'));
  expect(exported).toMatchObject({
    schema: 'elsemesh.player-world/1',
    units: 'metres',
    axes: 'right-handed-y-up-minus-z-forward',
  });
});

test('terrain brush panel and first-person mode are user visible', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('Terrain').click();
  await expect(page.getByText('Click terrain to sculpt')).toBeVisible();
  await page.getByRole('button', { name: 'Enter preview' }).click();
  await expect(page.getByText('FIRST-PERSON PREVIEW')).toBeVisible();
  await page.getByRole('button', { name: /Exit preview/ }).click();
  await expect(page.getByRole('button', { name: 'Enter preview' })).toBeVisible();
});




