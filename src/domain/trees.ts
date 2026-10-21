/**
 * Shared builder tree meshes, in metres with the root at the origin and +Y up.
 * Folded broadleaf topology adapts ElseMesh FruitTreeCrown.js (MIT, copyright
 * 2026 DRG Software Solutions LLC); see docs/tree-geometry-provenance.md.
 * Palm and pine are builder approximations, not the game's vegetation shader.
 */
export type TreeSpecies = 'broadleaf' | 'palm' | 'pine';
export const TREE_SPECIES: { id: TreeSpecies; label: string }[] = [
  { id: 'broadleaf', label: 'Broadleaf / mango' },
  { id: 'palm', label: 'Coconut palm' },
  { id: 'pine', label: 'Coastal pine' },
];
type Point = [number, number, number];
export type TreeMeshData = { positions: number[]; indices: number[] };
export type TreeGeometryData = { bark: TreeMeshData; foliage: TreeMeshData; height: number };
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n];
const sub = (a: Point, b: Point): Point => add(a, mul(b, -1));
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Point): Point => mul(a, 1 / (Math.hypot(...a) || 1));
function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function vertex(mesh: TreeMeshData, p: Point) {
  const index = mesh.positions.length / 3;
  mesh.positions.push(...p);
  return index;
}
function tube(mesh: TreeMeshData, points: Point[], baseRadius: number, tipRadius: number, sides = 7) {
  const start = mesh.positions.length / 3;
  points.forEach((p, row) => {
    const tangent = unit(sub(points[Math.min(points.length - 1, row + 1)]!, points[Math.max(0, row - 1)]!));
    const side = unit(cross(tangent, Math.abs(tangent[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
    const normal = unit(cross(tangent, side));
    const radius = baseRadius + (tipRadius - baseRadius) * row / (points.length - 1);
    for (let k = 0; k < sides; k++) {
      const angle = k / sides * Math.PI * 2;
      vertex(mesh, add(p, add(mul(side, Math.cos(angle) * radius), mul(normal, Math.sin(angle) * radius))));
      if (row > 0) {
        const a = start + (row - 1) * sides + k;
        const b = start + (row - 1) * sides + (k + 1) % sides;
        mesh.indices.push(a, b, b + sides, a, b + sides, a + sides);
      }
    }
  });
  const top = vertex(mesh, points[points.length - 1]!);
  const bottom = vertex(mesh, points[0]!);
  for (let k = 0; k < sides; k++) {
    mesh.indices.push(top, start + (points.length - 1) * sides + k, start + (points.length - 1) * sides + (k + 1) % sides);
    mesh.indices.push(bottom, start + (k + 1) % sides, start + k);
  }
}
/** A five vertex folded lance leaf: four triangles, never a solid canopy ball. */
function leaf(mesh: TreeMeshData, center: Point, along: Point, across: Point, length: number, width: number) {
  const base = mesh.positions.length / 3;
  for (const [s, t, lift] of [[0, 0, 0], [-1, 0.48, -0.035], [0, 0.5, 0.025], [1, 0.48, -0.035], [0, 1, -0.08]]) {
    const p = add(center, add(mul(along, (t! - 0.5) * length), mul(across, s! * width)));
    p[1] += lift! * length;
    vertex(mesh, p);
  }
  for (const triangle of [[0, 1, 2], [0, 2, 3], [1, 4, 2], [2, 4, 3]]) mesh.indices.push(...triangle.map((n) => base + n));
}
export function createTreeGeometry(species: TreeSpecies = 'broadleaf', seed = 7319): TreeGeometryData {
  const random = randomFrom(seed);
  const bark: TreeMeshData = { positions: [], indices: [] };
  const foliage: TreeMeshData = { positions: [], indices: [] };
  if (species === 'palm') {
    const lean = 0.22 + random() * 0.5;
    const height = 5.7 + random() * 1.1;
    const trunk: Point[] = Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      return [lean * t * t, height * t, Math.sin(t * 2) * 0.15];
    });
    tube(bark, trunk, 0.23, 0.115, 10);
    const crown = trunk[13]!;
    for (let frond = 0; frond < 11; frond++) {
      const az = frond * Math.PI * 2 / 11 + random() * 0.25;
      const length = 2.4 + random() * 1.0;
      const elevation = 0.35 + random() * 0.7;
      const direction: Point = [Math.cos(az), 0, Math.sin(az)];
      const across: Point = [-Math.sin(az), 0, Math.cos(az)];
      const curve = (t: number): Point => add(crown, [direction[0] * length * t, length * (elevation * t - 0.85 * t * t), direction[2] * length * t]);
      tube(bark, Array.from({ length: 10 }, (_, k) => curve(k / 9)), 0.035, 0.008, 5);
      for (let row = 1; row < 16; row++) {
        const t = row / 16;
        const width = Math.sin(Math.PI * t) * (0.65 + random() * 0.2);
        for (const sign of [-1, 1]) {
          const along = unit(add(mul(across, sign), [direction[0] * 0.32, -0.35 - t * 0.3, direction[2] * 0.32]));
          const root = curve(t);
          leaf(foliage, add(root, mul(along, width * 0.5)), along, direction, width, 0.055 + width * 0.06);
        }
      }
    }
  } else if (species === 'pine') {
    const height = 6.2 + random() * 0.8;
    tube(bark, [[0, 0, 0], [0.06, height * 0.5, 0], [-0.08, height, 0.06]], 0.25, 0.025, 9);
    for (let tier = 0; tier < 9; tier++) {
      const y = 1.4 + tier * 0.57;
      const reach = (height - y) * 0.43;
      for (let branch = 0; branch < 5; branch++) {
        const az = branch * Math.PI * 2 / 5 + tier * 2.4 + random() * 0.3;
        const along: Point = [Math.cos(az), 0.12, Math.sin(az)];
        const across: Point = [-Math.sin(az), 0, Math.cos(az)];
        const origin: Point = [0, y, 0];
        const end = add(origin, mul(along, reach));
        tube(bark, [origin, add(origin, mul(along, reach * 0.55)), end], 0.045, 0.009, 5);
        for (let spray = 0; spray < 7; spray++) {
          const t = (spray + 1) / 8;
          const center = add(origin, mul(along, reach * t));
          for (let needle = 0; needle < 7; needle++) {
            const angle = needle / 7 * Math.PI * 2 + random() * 0.3;
            const direction = unit(add(mul(along, 0.8), add(mul(across, Math.cos(angle)), [0, Math.sin(angle) * 0.7 + 0.2, 0])));
            leaf(foliage, add(center, mul(direction, 0.18)), direction, across, 0.45 + random() * 0.3, 0.035);
          }
        }
      }
    }
  } else {
    const lean = (random() - 0.5) * 0.35;
    tube(bark, [[0, 0, 0], [0.05, 1.3, 0], [lean, 2.7, 0.12], [lean + 0.15, 4.1, 0]], 0.28, 0.07, 10);
    for (let branch = 0; branch < 12; branch++) {
      const az = branch * 2.39996 + random() * 0.35;
      const y = 2.0 + random() * 1.4;
      const reach = 1.2 + random() * 0.85;
      const end: Point = [Math.cos(az) * reach + lean, y + 0.7 + random() * 0.9, Math.sin(az) * reach];
      tube(bark, [[lean, y, 0], [end[0] * 0.6, end[1] - 0.35, end[2] * 0.6], end], 0.1, 0.025, 6);
      for (let i = 0; i < 72; i++) {
        const angle = random() * Math.PI * 2;
        const elevation = (random() - 0.5) * 1.8;
        const r = 0.2 + random() * 0.75;
        const center = add(end, [Math.cos(angle) * r, Math.sin(elevation) * r * 0.8, Math.sin(angle) * r]);
        const along = unit([Math.cos(angle), -0.3 - random() * 0.8, Math.sin(angle)]);
        leaf(foliage, center, along, [-Math.sin(angle), 0, Math.cos(angle)], 0.48 + random() * 0.28, 0.11 + random() * 0.045);
      }
    }
  }
  let height = 0;
  for (const mesh of [bark, foliage]) for (let i = 1; i < mesh.positions.length; i += 3) height = Math.max(height, mesh.positions[i]!);
  return { bark, foliage, height };
}
/** Shared per-vertex wind, additive to the rest mesh; root vertices stay fixed. */
export function treeWindOffset(x: number, y: number, z: number, time: number, seed = 7319, species: TreeSpecies = 'broadleaf'): Point {
  if (y <= 0) return [0, 0, 0];
  const bend = Math.max(0, y / 7) ** 2;
  const phase = (seed >>> 0) * 0.013;
  const gust = Math.sin(time * 0.85 + phase) * 0.11 + Math.sin(time * 1.67 + phase) * 0.035;
  const flutter = Math.sin(time * 2.3 + x * 2.1 + z * 1.7 + phase) * 0.018 * bend;
  const factor = species === 'palm' ? 1.4 : species === 'pine' ? 0.65 : 1;
  return [(gust * bend + flutter) * factor, 0, (Math.cos(time * 0.69 + phase) * 0.045 * bend + flutter * 0.5) * factor];
}
