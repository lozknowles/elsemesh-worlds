import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as T from 'three';
import { createWorld, createTerrain, validateWorld } from '../src/domain/world';
import type { WorldProject } from '../src/domain/world';
import {
  createLandscapeLayer,
  applyLandscapeArea,
  generateLandscapeInstances,
} from '../src/domain/landscape';
async function saveBlob(page: Page): Promise<WorldProject> {
  await page.evaluate(() => {
    const state = window as unknown as { landscapeBlob: Promise<string> };
    state.landscapeBlob = new Promise((resolve) => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob | MediaSource) {
        URL.createObjectURL = original;
        if (blob instanceof Blob) void blob.text().then(resolve);
        return original.call(URL, blob);
      };
    });
  });
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const json = await page.evaluate(
    () => (window as unknown as { landscapeBlob: Promise<string> }).landscapeBlob,
  );
  return JSON.parse(json) as WorldProject;
}
async function openProject(page: Page, p: WorldProject) {
  await page.locator('input[type=file][accept*=".emw"]').setInputFiles({
    name: 'landscape.emw',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.getByText('Project opened', { exact: true })).toBeVisible();
}
test('landscape gestures preserve one stroke undo, closed fill, clearing and portable pond', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByTitle('Top view').click();
  const canvas = page.locator('.viewport canvas').first(),
    box = (await canvas.boundingBox())!,
    panel = page.getByRole('region', { name: 'Landscape painting' }),
    click = async (x: number, y: number) => page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.getByRole('button', { name: '+ ground', exact: true }).click();
  await panel.getByLabel('Brush radius', { exact: true }).fill('14');
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.6, { steps: 12 });
  await page.mouse.up();
  const painted = await saveBlob(page);
  expect(Object.keys(painted.landscape!.layers[0]!.mask.tiles).length).toBeGreaterThan(0);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  expect(Object.keys((await saveBlob(page)).landscape!.layers[0]!.mask.tiles)).toEqual([]);
  await page.getByTitle('Redo (Ctrl+Y)').click();
  await page.getByRole('button', { name: '+ vegetation', exact: true }).click();
  await panel.getByLabel('Gesture', { exact: true }).selectOption('area');
  for (const p of [
    [0.3, 0.32],
    [0.68, 0.32],
    [0.68, 0.68],
    [0.3, 0.68],
  ])
    await click(p[0]!, p[1]!);
  await panel.getByRole('button', { name: 'Finish boundary', exact: true }).click();
  const filled = await saveBlob(page),
    before = generateLandscapeInstances(filled).length;
  expect(before).toBeGreaterThan(0);
  await panel.getByLabel('Gesture', { exact: true }).selectOption('brush');
  await panel.getByLabel('Operation', { exact: true }).selectOption('erase');
  await panel.getByLabel('Brush radius', { exact: true }).fill('6');
  await click(0.46, 0.5);
  const clearing = await saveBlob(page);
  expect(generateLandscapeInstances(clearing).length).toBeLessThanOrEqual(before);
  const coverage = (project: WorldProject) =>
    Object.values(project.landscape!.layers.find((l) => l.kind === 'vegetation')!.mask.tiles)
      .flat()
      .reduce((n, v) => n + v, 0);
  expect(coverage(clearing)).toBeLessThan(coverage(filled));
  await page.getByRole('button', { name: '+ water', exact: true }).click();
  await expect(panel.getByLabel('Operation', { exact: true })).toHaveValue('paint');
  await panel.getByLabel('Water level', { exact: true }).fill('16');
  for (const p of [
    [0.6, 0.46],
    [0.7, 0.46],
    [0.7, 0.59],
    [0.6, 0.59],
  ])
    await click(p[0]!, p[1]!);
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: 'Stop painting', exact: true }).click();
  const final = await saveBlob(page);
  expect(validateWorld(final).errors).toEqual([]);
  expect(final.landscape!.layers.at(-1)!.boundary).toHaveLength(4);
  await openProject(page, final);
  expect(await saveBlob(page)).toEqual(final);
  await page.screenshot({ path: info.outputPath('landscape-painting.png') });
  expect(errors).toEqual([]);
});
test('actual generated tree click promotes, transforms and survives seed changes', async ({ page }, info) => {
  test.setTimeout(90000);
  let p = createWorld('Promotion fixture');
  p.terrain = createTerrain(32, 32, 17);
  p.terrain.heights.fill(0);
  p = createLandscapeLayer(p, { kind: 'vegetation', id: 'trees' });
  p = applyLandscapeArea(p, {
    layerId: 'trees',
    mode: 'paint',
    boundary: [
      [-12, 0, -12],
      [12, 0, -12],
      [12, 0, 12],
      [-12, 0, 12],
    ],
  });
  await page.goto('/');
  await openProject(page, p);
  await page.getByTitle('Top view').click();
  const box = (await page.locator('.viewport canvas').boundingBox())!,
    camera = new T.PerspectiveCamera(42, box.width / box.height, 0.1, 12000);
  camera.position.set(0, 95, 0.01);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  let next = p;
  for (const instance of generateLandscapeInstances(p).slice(0, 12)) {
    const v = new T.Vector3(
      instance.position[0],
      instance.position[1] + 4.2 * instance.scale[1],
      instance.position[2],
    ).project(camera);
    await page.mouse.click(box.x + (v.x * 0.5 + 0.5) * box.width, box.y + (0.5 - v.y * 0.5) * box.height);
    next = await saveBlob(page);
    if (next.objects.some((o) => o.landscapeOrigin)) break;
  }
  const promoted = next.objects.find((o) => o.landscapeOrigin)!;
  expect(promoted).toBeTruthy();
  expect(next.landscape!.tombstones).toContain(promoted.landscapeOrigin!.generatedId);
  await page
    .locator('.vector-editor')
    .first()
    .locator('input')
    .first()
    .fill(String(promoted.position[0] + 2));
  const moved = await saveBlob(page);
  expect(
    Math.abs(moved.objects.find((o) => o.id === promoted.id)!.position[0] - promoted.position[0]),
  ).toBeGreaterThan(1);
  await page.getByTitle('Terrain', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Landscape painting' });
  await panel.getByRole('button', { name: 'Vegetation', exact: true }).click();
  await panel.getByLabel('Seed', { exact: true }).fill('45017');
  await panel.getByRole('button', { name: 'Stop painting', exact: true }).click();
  const regenerated = await saveBlob(page);
  expect(regenerated.objects).toEqual(moved.objects);
  await page.keyboard.press('Delete');
  const deleted = await saveBlob(page);
  expect(deleted.objects).toEqual([]);
  expect(deleted.landscape!.tombstones).toContain(promoted.landscapeOrigin!.generatedId);
  await page.screenshot({ path: info.outputPath('landscape-promoted.png') });
});

test('delayed embedded texture cannot affect a newly opened world', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = window.createImageBitmap,
      state = window as unknown as { holdLandscapeImage: boolean; releaseLandscapeImage?: () => void };
    window.createImageBitmap = ((...args: unknown[]) => {
      if (!state.holdLandscapeImage) return Reflect.apply(original, window, args) as Promise<ImageBitmap>;
      state.holdLandscapeImage = false;
      return new Promise<ImageBitmap>((resolve) => {
        state.releaseLandscapeImage = () =>
          void (Reflect.apply(original, window, args) as Promise<ImageBitmap>).then(resolve);
      });
    }) as typeof createImageBitmap;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByRole('button', { name: '+ ground', exact: true }).click();
  await page.getByText('Edit ground definition', { exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { holdLandscapeImage: boolean }).holdLandscapeImage = true;
  });
  const ownedPNG = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const context = c.getContext('2d')!;
    context.fillStyle = '#ff00ff';
    context.fillRect(0, 0, 2, 2);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Embedded PNG/JPEG').setInputFiles({
    name: 'owned.png',
    mimeType: 'image/png',
    buffer: Buffer.from(ownedPNG, 'base64'),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as unknown as { releaseLandscapeImage?: () => void }).releaseLandscapeImage,
      ),
    )
    .toBe('function');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByRole('button', { name: '+ ground', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { releaseLandscapeImage: () => void }).releaseLandscapeImage(),
  );
  await page.waitForTimeout(200);
  const result = await saveBlob(page);
  expect(result.landscape!.images).toEqual([]);
  expect(result.landscape!.materials.every((m) => !m.imageRef)).toBe(true);
});
