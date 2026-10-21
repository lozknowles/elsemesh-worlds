import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import type { WorldProject } from '../src/domain/world';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } } };
async function save(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save project', exact: true }).click()]);
  const file = (await download.path())!;
  return { file, project: JSON.parse(readFileSync(file, 'utf8')) as WorldProject };
}
test('geographic UI crops actual ASCII samples, preserves objects, drapes bounded imagery, undoes and reopens', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await page.getByTitle('Assets', { exact: true }).click(); await page.locator('.asset-card').filter({ hasText: 'Cube' }).click();
  const baseline = await save(page);
  await page.getByTitle('Geographic terrain', { exact: true }).click();
  const ascii = `ncols 129\nnrows 129\nxllcenter 482872\nyllcenter 364872\ncellsize 2\nNODATA_value -9999\n${Array(129).fill(Array(129).fill(100).join(' ')).join('\n')}`;
  await page.getByLabel('Elevation ASCII grid', { exact: true }).setInputFiles({ name: 'synthetic-bng.asc', mimeType: 'text/plain', buffer: Buffer.from(ascii) });
  await expect(page.getByText('Source loaded.', { exact: false })).toBeVisible();
  const map = page.getByRole('img', { name: 'Loaded elevation source and selected crop', exact: true });
  await map.click({ position: { x: 80, y: 80 } });
  await expect(page.getByLabel('Centre easting', { exact: true })).not.toHaveValue('483000');
  for (const [label, value] of [['Centre easting', '483000'], ['Centre northing', '365000'], ['Area radius (m)', '64'], ['Elevation source name', 'Synthetic BNG test grid'], ['Elevation licence', 'Authored test fixture'], ['Elevation attribution', 'Synthetic data, not OS survey'], ['Vertical datum', 'Synthetic metres']]) await page.getByLabel(label!, { exact: true }).fill(value!);
  await expect(page.locator('.geo-resolution')).toContainText('Source spacing: 2 m');
  await expect(page.locator('.geo-resolution')).toContainText('Output spacing: 2.00 m');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; const context = canvas.getContext('2d')!;
    for (const [color, x, y] of [['#f02020', 0, 0], ['#20e020', 32, 0], ['#2020f0', 0, 32], ['#e0e020', 32, 32]] as const) { context.fillStyle = color; context.fillRect(x, y, 32, 32); }
    return canvas.toDataURL('image/png');
  });
  await page.getByLabel('Licensed terrain imagery', { exact: true }).setInputFiles({ name: 'synthetic-quadrants.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1]!, 'base64') });
  await expect(page.getByAltText('Loaded imagery: synthetic-quadrants.png', { exact: true })).toBeVisible();
  for (const [label, value] of [['Image west', '482968'], ['Image east', '483032'], ['Image south', '364968'], ['Image north', '365032'], ['Image licence', 'Authored test fixture'], ['Image attribution', 'Synthetic NW red, NE green, SW blue, SE yellow']]) await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByLabel('I may use this image under the licence above.').check();
  await page.getByRole('button', { name: 'Apply geographic terrain', exact: true }).click();
  await expect(page.locator('.geo-status')).toHaveText('Geographic terrain applied as one Undo step.');
  const final = await save(page);
  expect(final.project.terrain.width).toBe(128); expect(final.project.terrain.resolution).toBe(65); expect(new Set(final.project.terrain.heights)).toEqual(new Set([100]));
  expect(final.project.objects).toEqual(baseline.project.objects); expect(final.project.spawn.position[1]).toBe(100);
  expect(final.project.geography?.center).toEqual({ easting: 483000, northing: 365000 }); expect(final.project.terrainImagery?.bounds.west).toBe(482968);
  await page.getByTitle('Top view', { exact: true }).click(); await page.waitForTimeout(1000);
  const canvas = page.locator('.viewport canvas'), box = await canvas.boundingBox(); if (!box) throw new Error('Editor canvas missing');
  const png = PNG.sync.read(await canvas.screenshot());
  const camera = new THREE.PerspectiveCamera(42, box.width / box.height, 0.1, 12000); camera.position.set(0, 100 + 128 * 1.4, .01); camera.up.set(0, 0, -1); camera.lookAt(0, 100, 0); camera.updateMatrixWorld();
  const sample = (x: number, z: number) => { const point = new THREE.Vector3(x, 100, z).project(camera), px = Math.round((point.x * .5 + .5) * png.width), py = Math.round((.5 - point.y * .5) * png.height), index = (py * png.width + px) * 4; return [...png.data.subarray(index, index + 3)]; };
  const samples = { NW: sample(-16, -16), NE: sample(16, -16), SW: sample(-16, 16), SE: sample(16, 16), uncovered: sample(48, 0) };
  expect(samples.NW[0]!).toBeGreaterThan(samples.NW[1]! * 1.3); expect(samples.NE[1]!).toBeGreaterThan(samples.NE[0]! * 1.3); expect(samples.SW[2]!).toBeGreaterThan(samples.SW[0]! * 1.3); expect(samples.SE[0]!).toBeGreaterThan(samples.SE[2]! * 1.3);
  expect(Math.abs(samples.uncovered[0]! - samples.uncovered[1]!)).toBeLessThan(45);
  const out = path.resolve('../../outputs'); mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, 'geographic-terrain-editor.png') }); writeFileSync(path.join(out, 'geographic-terrain-editor-evidence.json'), JSON.stringify({ samples, errors, qualification: 'Synthetic fixture only; no OS dataset supplied.' }, null, 2));
  await page.getByTitle('Undo (Ctrl+Z)', { exact: true }).click(); expect((await save(page)).project.geography).toBeUndefined();
  await page.getByTitle('Redo (Ctrl+Y)', { exact: true }).click(); expect((await save(page)).project.geography?.sourceSpacing).toBe(2);
  await page.locator('label.button.subdued input[type=file]').first().setInputFiles(baseline.file); await expect(page.getByText('Project opened', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply geographic terrain', exact: true }).click(); await expect(page.locator('.geo-status')).toContainText('The world changed.');
  await page.locator('label.button.subdued input[type=file]').first().setInputFiles(final.file); await expect(page.getByText('Project opened', { exact: true })).toBeVisible();
  await page.waitForTimeout(700); await page.reload(); await expect(page.getByTitle('Geographic terrain', { exact: true })).toBeVisible();
  const reopened = (await save(page)).project; expect(reopened.geography).toEqual(final.project.geography); expect(reopened.terrainImagery).toEqual(final.project.terrainImagery); expect(errors).toEqual([]);
});
