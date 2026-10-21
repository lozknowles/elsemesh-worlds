import { describe, expect, it } from 'vitest';
import { createTreeGeometry, TREE_SPECIES, treeWindOffset } from './trees';

describe('shared editor and native tree geometry', () => {
  for (const { id } of TREE_SPECIES) {
    it(`${id} has finite, nondegenerate, indexed bark and individual foliage`, () => {
      const geometry = createTreeGeometry(id, 7319);
      expect(geometry.height).toBeGreaterThan(4);
      expect(geometry.height).toBeLessThan(9);
      for (const mesh of [geometry.bark, geometry.foliage]) {
        expect(mesh.positions.length % 3).toBe(0);
        expect(mesh.indices.length % 3).toBe(0);
        expect(mesh.positions.every(Number.isFinite)).toBe(true);
        expect(mesh.indices.every((n) => Number.isInteger(n) && n >= 0 && n < mesh.positions.length / 3)).toBe(true);
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const a = mesh.indices[i]! * 3, b = mesh.indices[i + 1]! * 3, c = mesh.indices[i + 2]! * 3;
          const ux = mesh.positions[b]! - mesh.positions[a]!, uy = mesh.positions[b + 1]! - mesh.positions[a + 1]!, uz = mesh.positions[b + 2]! - mesh.positions[a + 2]!;
          const vx = mesh.positions[c]! - mesh.positions[a]!, vy = mesh.positions[c + 1]! - mesh.positions[a + 1]!, vz = mesh.positions[c + 2]! - mesh.positions[a + 2]!;
          expect(Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)).toBeGreaterThan(1e-10);
        }
      }
      expect(geometry.foliage.indices.length / 3).toBeGreaterThan(1000);
      expect(createTreeGeometry(id, 7319)).toEqual(geometry);
      expect(createTreeGeometry(id, 7320).foliage.positions).not.toEqual(geometry.foliage.positions);
    });
  }
  it('pins roots and gives reproducible, bounded moving crowns', () => {
    for (const { id } of TREE_SPECIES) {
      expect(treeWindOffset(0, 0, 0, 12, 7319, id)).toEqual([0, 0, 0]);
      const first = treeWindOffset(2, 6, 1, 0, 7319, id);
      expect(first).not.toEqual(treeWindOffset(2, 6, 1, 2, 7319, id));
      expect(first).toEqual(treeWindOffset(2, 6, 1, 0, 7319, id));
      for (let time = 0; time < 30; time += 0.1) expect(Math.hypot(...treeWindOffset(2, 8, 1, time, 7319, id))).toBeLessThan(0.4);
    }
  });
});
