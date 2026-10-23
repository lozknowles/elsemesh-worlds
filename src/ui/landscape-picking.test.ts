import * as T from 'three';
import { describe, it, expect, vi } from 'vitest';
import { freezeLandscapeTerrainPicking } from './landscape-picking';
import { createWorld, createTerrain } from '../domain/world';
import type { WorldProject } from '../domain/world';
import { createLandscapeLayer, applyLandscapePond, createLandscapePondBoundary } from '../domain/landscape';

function geometry(project: WorldProject) {
  const t = project.terrain,
    vertices: number[] = [],
    indices: number[] = [];
  for (let z = 0; z < t.resolution; z++)
    for (let x = 0; x < t.resolution; x++) {
      const a = z * t.resolution + x;
      vertices.push(
        (x * t.width) / (t.resolution - 1) - t.width / 2,
        t.heights[a]!,
        (z * t.depth) / (t.resolution - 1) - t.depth / 2,
      );
      if (x < t.resolution - 1 && z < t.resolution - 1)
        indices.push(a, a + t.resolution, a + 1, a + 1, a + t.resolution, a + t.resolution + 1);
    }
  return new T.BufferGeometry()
    .setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
    .setIndex(indices);
}
function fixture() {
  const p = createLandscapeLayer(createWorld(), { kind: 'water', id: 'pond' });
  p.terrain = createTerrain(128, 128, 129);
  p.terrain.heights = p.terrain.heights.map((_, i) =>
    Math.hypot((i % 129) - 64 - 4, Math.floor(i / 129) - 64 - 3) < 15 ? -1 : 5,
  );
  return p;
}
const mesh = (p: WorldProject) => {
  const m = new T.Mesh(geometry(p), new T.MeshBasicMaterial({ side: T.DoubleSide }));
  m.userData.placementSurface = 'terrain';
  return m;
};
describe('immutable pond terrain picking', () => {
  for (const view of ['top', 'oblique'] as const)
    it('keeps the same boundary with immediate or delayed raised-bank previews in ' + view, () => {
      const base = fixture(),
        scene = new T.Scene(),
        live = mesh(base);
      scene.add(live);
      const camera = new T.PerspectiveCamera(42, 1.5, 0.1, 12000);
      if (view === 'top') {
        camera.position.set(0, 95, 0.01);
        camera.up.set(0, 0, -1);
      } else camera.position.set(82, 65, 88);
      camera.lookAt(0, 2, 0);
      camera.updateMatrixWorld();
      const frozen = freezeLandscapeTerrainPicking(scene),
        ray = new T.Raycaster();
      const screen = new T.Vector3(-8, -1, 3).project(camera);
      const pick = () => {
        ray.setFromCamera(new T.Vector2(screen.x, screen.y), camera);
        return frozen.hit(ray)!;
      };
      const center = [4, -1, 3] as [number, number, number];
      const boundary = () => {
        const point = pick();
        return createLandscapePondBoundary(
          center,
          Math.hypot(point.x - center[0], point.z - center[2]),
          0.35,
        );
      };
      const immediate = boundary();
      const graded = applyLandscapePond(base, {
        layerId: 'pond',
        center,
        radius: 12,
        irregularity: 0,
        bankWidth: 6,
        bedDepth: 2,
        mode: 'replace',
      });
      expect(graded.terrain.heights.some((h, i) => h > base.terrain.heights[i]! + 1)).toBe(true);
      live.geometry.dispose();
      live.geometry = geometry(graded);
      expect(boundary()).toEqual(immediate);
      ray.setFromCamera(new T.Vector2(screen.x, screen.y), camera);
      const changed = ray.intersectObject(live)[0]!.point;
      expect(Math.hypot(changed.x + 8, changed.z - 3)).toBeGreaterThan(0.01);
      // Later preview geometry mutations also leave the CPU snapshot unchanged.
      live.geometry.getAttribute('position').setY(0, 100);
      expect(boundary()).toEqual(immediate);
      frozen.dispose();
      live.geometry.dispose();
      (live.material as T.Material).dispose();
    });
  it('freezes geometry and inherited world transforms and disposes only cloned geometry once', () => {
    const scene = new T.Scene(),
      parent = new T.Group(),
      live = mesh(fixture());
    parent.position.set(8, 2, -4);
    parent.add(live);
    scene.add(parent);
    const geometryDispose = vi.spyOn(T.BufferGeometry.prototype, 'dispose'),
      materialDispose = vi.spyOn(live.material as T.Material, 'dispose');
    const frozen = freezeLandscapeTerrainPicking(scene);
    const ray = new T.Raycaster(new T.Vector3(12, 100, -1), new T.Vector3(0, -1, 0));
    const before = frozen.hit(ray)!.toArray();
    live.geometry.getAttribute('position').array.fill(100);
    parent.position.set(-70, 60, 30);
    parent.updateMatrixWorld(true);
    expect(frozen.hit(ray)!.toArray()).toEqual(before);
    frozen.dispose();
    frozen.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(frozen.hit(ray)).toBeNull();
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    live.geometry.dispose();
    (live.material as T.Material).dispose();
  });
  it('fails closed without terrain and cleans partial snapshots after construction failure', () => {
    expect(() => freezeLandscapeTerrainPicking(new T.Scene())).toThrow(/No terrain/);
    const scene = new T.Scene(),
      a = mesh(fixture()),
      b = mesh(fixture());
    scene.add(a, b);
    const dispose = vi.spyOn(T.BufferGeometry.prototype, 'dispose');
    vi.spyOn(b.geometry, 'clone').mockImplementation(() => {
      throw Error('allocation failed');
    });
    expect(() => freezeLandscapeTerrainPicking(scene)).toThrow('allocation failed');
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
    a.geometry.dispose();
    b.geometry.dispose();
    (a.material as T.Material).dispose();
    (b.material as T.Material).dispose();
  });
  it('snapshots the maximum supported terrain grid without any renderer or draw allocation', () => {
    const p = fixture();
    p.terrain = createTerrain(256, 256, 257);
    const scene = new T.Scene(),
      live = mesh(p);
    scene.add(live);
    const started = performance.now(),
      frozen = freezeLandscapeTerrainPicking(scene);
    const elapsed = performance.now() - started;
    console.info('257-grid terrain picking snapshot CPU milliseconds:', elapsed.toFixed(3));
    expect(elapsed).toBeLessThan(1000);
    expect(scene.children).toEqual([live]);
    frozen.dispose();
    live.geometry.dispose();
    (live.material as T.Material).dispose();
  });
});
