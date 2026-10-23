import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as T from 'three';
import { createWorld, createTerrain, validateWorld, sampleTerrain } from '../src/domain/world';
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
  await panel.getByLabel('Grade sloping banks', { exact: true }).uncheck();
  await panel.getByLabel('Water level', { exact: true }).fill('16');
  await expect(panel.getByLabel('Gesture', { exact: true })).toHaveValue('pond');
  await panel.getByLabel('Shoreline irregularity', { exact: true }).fill('0.7');
  const waterBefore = await saveBlob(page);
  await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const pond = await saveBlob(page);
  expect(pond.landscape!.layers.at(-1)!.boundary!.length).toBeGreaterThanOrEqual(16);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  expect(await saveBlob(page)).toEqual(waterBefore);
  await page.getByTitle('Redo (Ctrl+Y)').click();
  expect(await saveBlob(page)).toEqual(pond);
  await panel.getByRole('button', { name: 'Stop painting', exact: true }).click();
  const final = await saveBlob(page);
  expect(validateWorld(final).errors).toEqual([]);
  expect(final.landscape!.layers.at(-1)!.boundary!.length).toBeGreaterThanOrEqual(16);
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

test('organic pond cancellation and circular setting preserve reliable save and reopen', async ({ page }) => {
  test.setTimeout(90000);
  const p = createWorld('Round pond fixture');
  p.terrain = createTerrain(64, 64, 17);
  p.terrain.heights.fill(0);
  await page.goto('/');
  await openProject(page, p);
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByTitle('Top view').click();
  await page.getByRole('button', { name: '+ water', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Landscape painting' });
  await panel.getByLabel('Grade sloping banks', { exact: true }).uncheck();
  await panel.getByLabel('Water level', { exact: true }).fill('2');
  await panel.getByLabel('Shoreline irregularity', { exact: true }).fill('0');
  const before = await saveBlob(page),
    box = (await page.locator('.viewport canvas').first().boundingBox())!;
  const centre = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + box.width * 0.08, centre.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await saveBlob(page)).toEqual(before);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + box.width * 0.08, centre.y, { steps: 8 });
  await page.mouse.up();
  const final = await saveBlob(page),
    boundary = final.landscape!.layers.at(-1)!.boundary!;
  expect(boundary.length).toBeGreaterThanOrEqual(16);
  const cx = boundary.reduce((sum, point) => sum + point[0], 0) / boundary.length;
  const cz = boundary.reduce((sum, point) => sum + point[2], 0) / boundary.length;
  const radii = boundary.map((point) => Math.hypot(point[0] - cx, point[2] - cz));
  expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
  expect(validateWorld(final).errors).toEqual([]);
  await openProject(page, final);
  expect(await saveBlob(page)).toEqual(final);
});

test('pond preview rejects invalid radii and off-terrain release without stale water', async ({ page }) => {
  test.setTimeout(120000);
  const p = createWorld('Pond draft safety');
  p.terrain = createTerrain(64, 64, 17);
  p.terrain.heights.fill(0);
  await page.goto('/');
  await openProject(page, p);
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByTitle('Top view').click();
  await page.getByRole('button', { name: '+ water', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Landscape painting' });
  await panel.getByLabel('Grade sloping banks', { exact: true }).uncheck();
  await panel.getByLabel('Water level', { exact: true }).fill('2');
  await panel.getByLabel('Shoreline irregularity', { exact: true }).fill('.8');
  const box = (await page.locator('.viewport canvas').first().boundingBox())!;
  const camera = new T.PerspectiveCamera(42, box.width / box.height, 0.1, 12000);
  camera.position.set(0, 95, 0.01);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const screen = (x: number, z: number) => {
    const v = new T.Vector3(x, 0, z).project(camera);
    return { x: box.x + (v.x * 0.5 + 0.5) * box.width, y: box.y + (0.5 - v.y * 0.5) * box.height };
  };
  const waterVertices = () =>
    page.evaluate(async () => {
      const fiber = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      let count = 0;
      fiber._roots
        .get(document.querySelector('.viewport canvas'))
        .store.getState()
        .scene.traverse(
          (node: { geometry?: { getAttribute: (name: string) => { count: number } | undefined } }) => {
            if (node.geometry?.getAttribute('waterLevel'))
              count += node.geometry.getAttribute('position')!.count;
          },
        );
      return count;
    });
  const centre = screen(0, 0),
    outsideOutline = screen(30, 0),
    valid = screen(8, 0);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await expect.poll(waterVertices, { timeout: 15000 }).toBeGreaterThan(0);
  await page.mouse.move(outsideOutline.x, outsideOutline.y, { steps: 5 });
  await expect(panel.getByRole('alert')).toContainText('beyond the terrain');
  await expect.poll(waterVertices, { timeout: 15000 }).toBe(0);
  await page.mouse.move(valid.x, valid.y, { steps: 5 });
  await expect.poll(waterVertices, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await page.mouse.up();
  const accepted = await saveBlob(page);
  expect(accepted.landscape!.layers.at(-1)!.boundary!.length).toBeGreaterThanOrEqual(16);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 30, box.y + box.height * 0.5, { steps: 5 });
  await expect(panel.getByRole('alert')).toContainText('back onto terrain');
  await page.mouse.up();
  expect(await saveBlob(page)).toEqual(accepted);
});

test('graded pond saves a sloping bank and shallow bed in one undo step', async ({ page }) => {
  test.setTimeout(120000);
  const p = createWorld('Sloping pond banks');
  p.terrain = createTerrain(64, 64, 33);
  p.terrain.heights.fill(0);
  await page.goto('/');
  await openProject(page, p);
  await page.getByTitle('Terrain', { exact: true }).click();
  await page.getByTitle('Top view').click();
  await page.getByRole('button', { name: '+ water', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Landscape painting' });
  await expect(panel.getByLabel('Grade sloping banks', { exact: true })).toBeChecked();
  await panel.getByLabel('Water level', { exact: true }).fill('-1');
  await panel.getByLabel('Shoreline irregularity', { exact: true }).fill('0');
  await panel.getByLabel('Bank width', { exact: true }).fill('6');
  await panel.getByLabel('Bed depth', { exact: true }).fill('2');
  const before = await saveBlob(page),
    box = (await page.locator('.viewport canvas').first().boundingBox())!;
  const camera = new T.PerspectiveCamera(42, box.width / box.height, 0.1, 12000);
  camera.position.set(0, 95, 0.01);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const screen = (x: number, z: number) => {
    const v = new T.Vector3(x, 0, z).project(camera);
    return [box.x + (v.x * 0.5 + 0.5) * box.width, box.y + (0.5 - v.y * 0.5) * box.height] as const;
  };
  await page.mouse.move(...screen(0, 0));
  await page.mouse.down();
  await page.mouse.move(...screen(12, 0), { steps: 8 });
  await page.mouse.up();
  const final = await saveBlob(page);
  expect(final.terrain.heights).not.toEqual(before.terrain.heights);
  const profile = [20, 15, 12, 10, 8, 0].map((x) => sampleTerrain(final.terrain, x, 0));
  expect(profile[0]).toBeCloseTo(0, 5);
  for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeLessThan(profile[i - 1]!);
  expect(profile[2]).toBeGreaterThan(-1);
  expect(profile[3]).toBeLessThan(-1);
  expect(profile.at(-1)).toBeCloseTo(-3, 4);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  expect(await saveBlob(page)).toEqual(before);
  await page.getByTitle('Redo (Ctrl+Y)').click();
  expect(await saveBlob(page)).toEqual(final);
  await openProject(page, final);
  expect(await saveBlob(page)).toEqual(final);
});

for (const view of ['top', 'oblique'] as const) {
  test('pond radius ignores graded preview timing in ' + view, async ({ page }) => {
    test.setTimeout(120000);
    const p = createWorld('Immutable pond picks');
    p.terrain = createTerrain(128, 128, 129);
    p.terrain.heights = p.terrain.heights.map((_, i) =>
      Math.hypot((i % 129) - 64 - 4, Math.floor(i / 129) - 64 - 3) < 11 ? -1 : 5,
    );
    await page.goto('/');
    // Install before painting registers its capture handlers, so we observe delivered coordinates.
    await page.evaluate(() => {
      const state = window as unknown as { pondDelivered: Record<string, { x: number; y: number }> };
      state.pondDelivered = {};
      const record = (event: PointerEvent) => {
        if (event.pointerId === 1) state.pondDelivered[event.type] = { x: event.clientX, y: event.clientY };
      };
      window.addEventListener('pointerdown', record, true);
      window.addEventListener('pointermove', record, true);
    });
    await openProject(page, p);
    await page.getByTitle('Terrain', { exact: true }).click();
    if (view === 'top') await page.getByTitle('Top view').click();
    await page.getByRole('button', { name: '+ water', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Landscape painting' });
    await panel.getByLabel('Water level', { exact: true }).fill('0');
    await panel.getByLabel('Shoreline irregularity', { exact: true }).fill('0');
    await panel.getByLabel('Bank width', { exact: true }).fill('6');
    await panel.getByLabel('Bed depth', { exact: true }).fill('2');
    const before = await saveBlob(page);
    const box = (await page.locator('.viewport canvas').first().boundingBox())!;
    const camera = new T.PerspectiveCamera(42, box.width / box.height, 0.1, 12000);
    if (view === 'top') {
      camera.position.set(0, 95, 0.01);
      camera.up.set(0, 0, -1);
    } else camera.position.set(82, 65, 88);
    camera.lookAt(0, 2, 0);
    camera.updateMatrixWorld();
    const screen = (x: number, y: number, z: number) => {
      const v = new T.Vector3(x, y, z).project(camera);
      return {
        x: Math.round(box.x + (v.x * 0.5 + 0.5) * box.width),
        y: Math.round(box.y + (0.5 - v.y * 0.5) * box.height),
      };
    };
    const positions = [screen(4, -1, 3), screen(-4, -1, 3), screen(-6, -1, 3), screen(-8, 5, 3)];
    await page.mouse.move(positions[0]!.x, positions[0]!.y);
    await page.mouse.down();
    // All moves in one JS task: no preview frame can occur between them.
    await page.evaluate((positions) => {
      for (let i = 1; i < positions.length; i++) {
        const at = positions[i]!;
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: at.x,
            clientY: at.y,
            pointerId: 1,
            button: 0,
            buttons: 1,
            bubbles: true,
          }),
        );
      }
      const at = positions.at(-1)!;
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: at.x,
          clientY: at.y,
          pointerId: 1,
          button: 0,
          bubbles: true,
        }),
      );
    }, positions);
    await page.mouse.up();
    const received = () =>
      page.evaluate(
        () =>
          (window as unknown as { pondDelivered: Record<string, { x: number; y: number }> }).pondDelivered,
      );
    const immediateDelivered = await received();
    expect(immediateDelivered.pointerdown).toEqual(positions[0]);
    expect(immediateDelivered.pointermove).toEqual(positions.at(-1));
    const immediate = await saveBlob(page);
    expect(immediate.terrain.heights).not.toEqual(before.terrain.heights);
    expect(immediate.terrain.heights.some((h, i) => h > before.terrain.heights[i]! + 0.1)).toBe(true);
    await page.getByTitle('Undo (Ctrl+Z)').click();
    expect(await saveBlob(page)).toEqual(before);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const renderedTerrainSignature = () =>
      page.evaluate(async () => {
        const fiber = await import('/node_modules/.vite/deps/@react-three_fiber.js');
        let sum = 0;
        fiber._roots
          .get(document.querySelector('.viewport canvas'))
          .store.getState()
          .scene.traverse(
            (node: {
              userData: { placementSurface?: string };
              geometry?: { getAttribute: (name: string) => { count: number; getY: (i: number) => number } };
            }) => {
              if (node.userData.placementSurface !== 'terrain') return;
              const positions = node.geometry!.getAttribute('position');
              for (let i = 0; i < positions.count; i++) sum += positions.getY(i);
            },
          );
        return sum;
      });
    await page.mouse.move(positions[0]!.x, positions[0]!.y);
    await page.mouse.down();
    await page.evaluate((at) => {
      const canvas = document.querySelector('.viewport canvas')!;
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: at.x,
          clientY: at.y,
          pointerId: 99,
          button: 0,
          buttons: 1,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: at.x,
          clientY: at.y,
          pointerId: 99,
          button: 0,
          bubbles: true,
        }),
      );
    }, positions[1]!);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    for (const at of positions.slice(1)) {
      const previousGeometry = await renderedTerrainSignature();
      await page.mouse.move(at.x, at.y);
      await expect.poll(renderedTerrainSignature, { timeout: 15000 }).not.toBe(previousGeometry);
      await expect(panel.getByRole('alert')).toHaveCount(0);
    }
    await page.mouse.up();
    const delayedDelivered = await received();
    expect(delayedDelivered).toEqual(immediateDelivered);
    const delayed = await saveBlob(page);
    expect(delayed.landscape!.layers.at(-1)!.boundary).toEqual(immediate.landscape!.layers.at(-1)!.boundary);
    expect(delayed.terrain.heights).toEqual(immediate.terrain.heights);
    // Replacing the committed project during a drag must never resurrect its old base.
    await page.mouse.move(positions[0]!.x, positions[0]!.y);
    await page.mouse.down();
    await page.mouse.move(positions[1]!.x, positions[1]!.y);
    await openProject(page, before);
    await page.mouse.up();
    expect(await saveBlob(page)).toEqual(before);
  });
}
