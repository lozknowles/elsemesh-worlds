import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorldProject } from '../src/domain/world';
import { sampleTerrain } from '../src/domain/world';

test.setTimeout(120_000);
async function downloadedProject(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save project', exact: true }).click()]);
  const file = (await download.path())!;
  return { file, project: JSON.parse(readFileSync(file, 'utf8')) as WorldProject };
}

test('all four prepared models embed, deduplicate, preserve independent materials and reopen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await page.getByTitle('Assets', { exact: true }).click();
  for (const [index, name] of ['Dead quiver trunk', 'Dead quiver branch 01', 'Dead quiver branch 02', 'Lambis shell'].entries()) {
    await page.getByLabel('Search assets', { exact: true }).fill(name);
    await page.locator('.asset-card').filter({ hasText: name }).click();
    await expect(page.locator('.inspector h2')).toHaveText(name, { timeout: 30000 });
    await expect(page.getByLabel('Material slot', { exact: true })).toBeVisible();
    await page.locator('.vector-editor').filter({ hasText: 'POSITION' }).locator('input').nth(0).fill(String((index - 1.5) * 9));
  }
  await page.getByLabel('Search assets', { exact: true }).fill('Dead quiver trunk');
  await page.locator('.asset-card').filter({ hasText: 'Dead quiver trunk' }).click();
  await expect(page.locator('.inspector h2')).toHaveText('Dead quiver trunk', { timeout: 30000 });
  await page.getByLabel('Material color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Material roughness', { exact: true }).press('End');
  const exported = await downloadedProject(page);
  expect(exported.project.assets).toHaveLength(4); expect(exported.project.objects).toHaveLength(5);
  const instances = exported.project.objects.filter((object) => object.name === 'Dead quiver trunk');
  expect(instances).toHaveLength(2); expect(instances[0]!.assetId).toBe(instances[1]!.assetId);
  expect(instances[0]!.materialOverrides ?? []).toEqual([]);
  expect(instances[1]!.materialOverrides).toContainEqual({ materialIndex: 0, color: '#ff0000', roughness: 1 });
  for (const asset of exported.project.assets) { expect(asset.dataUrl.startsWith('data:application/octet-stream;base64,')).toBe(true); expect(asset.bounds).toBeTruthy(); expect(asset.materialCount).toBeGreaterThan(0); }
  await page.getByRole('button', { name: 'Reset slot to source', exact: true }).click();
  expect((await downloadedProject(page)).project.objects.at(-1)!.materialOverrides).toEqual([]);
  await page.locator('.vector-editor').filter({ hasText: 'ROTATION' }).locator('input').nth(2).fill('45');
  await page.locator('.vector-editor').filter({ hasText: 'SCALE' }).locator('input').nth(0).fill('1.5');
  await page.getByRole('button', { name: 'Ground model on terrain', exact: true }).click();
  const final = await downloadedProject(page);
  expect(final.project.objects.at(-1)!.rotation[2]).toBeCloseTo(Math.PI / 4, 4);
  expect(final.project.objects.at(-1)!.scale[0]).toBe(1.5);
  const last = final.project.objects.at(-1)!, source = final.project.assets.find((asset) => asset.id === last.assetId)!;
  const bottom = Math.sin(Math.PI / 4) * source.bounds!.min[0] * 1.5 + Math.cos(Math.PI / 4) * source.bounds!.min[1];
  expect(last.position[1]).toBeCloseTo(sampleTerrain(final.project.terrain, 0, 0) - bottom, 4);
  await page.waitForTimeout(700); await page.reload(); await page.getByTitle('Scene', { exact: true }).click();
  await expect(page.locator('.tree-row.object-row')).toHaveCount(5);
  await page.locator('label.button.subdued input[type=file]').first().setInputFiles(final.file);
  await expect(page.getByText('Project opened', { exact: true })).toBeVisible();
  expect((await downloadedProject(page)).project.objects).toEqual(final.project.objects);
  const out = path.resolve('../../outputs'); mkdirSync(out, { recursive: true });
  await page.getByTitle('Assets', { exact: true }).click(); await page.getByLabel('Search assets', { exact: true }).fill('');
  await page.screenshot({ path: path.join(out, 'asset-library-editor.png') });
  expect(errors).toEqual([]);
});

test('pending catalog placement is cancelled on New and on Open with the same world ID', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('button', { name: 'New world', exact: true })).toBeEnabled();
  const baseline = await downloadedProject(page);
  for (const action of ['new', 'open'] as const) {
    if (action === 'open') { await page.locator('label.button.subdued input[type=file]').first().setInputFiles(baseline.file); await expect(page.getByText('Project opened', { exact: true })).toBeVisible(); }
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/assets/elsemesh/debris/dead_quiver_trunk.glb', async (route) => { await held; await route.continue(); });
    await page.getByTitle('Assets', { exact: true }).click(); await page.getByLabel('Search assets', { exact: true }).fill('Dead quiver trunk');
    const request = page.waitForRequest('**/assets/elsemesh/debris/dead_quiver_trunk.glb');
    await page.locator('.asset-card').filter({ hasText: 'Dead quiver trunk' }).click(); await request;
    if (action === 'new') await page.getByRole('button', { name: 'New world', exact: true }).click();
    else { await page.locator('label.button.subdued input[type=file]').first().setInputFiles(baseline.file); await expect(page.getByText('Project opened', { exact: true })).toBeVisible(); }
    const response = page.waitForResponse('**/assets/elsemesh/debris/dead_quiver_trunk.glb'); release(); await response;
    await page.waitForTimeout(250);
    const exported = (await downloadedProject(page)).project;
    expect(exported.objects).toEqual([]); expect(exported.assets).toEqual([]);
    await page.unroute('**/assets/elsemesh/debris/dead_quiver_trunk.glb');
  }
});
