import * as THREE from 'three';
import { sampleTerrain } from './world';
import type { DrawnFeature, Vec3, WorldProject } from './world';

export type FeatureGeometryPart = {
  geometry: THREE.BufferGeometry;
  semantic: 'water' | 'foam' | 'path' | 'bridge' | 'shape';
  color: string;
};

function mesh(positions: number[], uvs: number[], indices?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (indices) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Clip a convex polygon by a signed half-plane; Y interpolates the terrain surface. */
function clip(input: Vec3[], distance: (point: Vec3) => number): Vec3[] {
  const output: Vec3[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i]!, b = input[(i + 1) % input.length]!;
    const da = distance(a), db = distance(b);
    if (da >= -1e-7) output.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return output;
}

function lakeGeometry(feature: DrawnFeature, project: WorldProject): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [];
  const level = feature.elevation ?? 0, terrain = project.terrain;
  const { resolution, width, depth, heights } = terrain;
  const triangles = THREE.ShapeUtils.triangulateShape(feature.points.map((p) => new THREE.Vector2(p[0], p[2])), []);
  const vertex = (x: number, z: number): Vec3 => [x * width / (resolution - 1) - width / 2, heights[z * resolution + x] ?? 0, z * depth / (resolution - 1) - depth / 2];
  for (const triangle of triangles) {
    const outline = triangle.map((i) => feature.points[i]!);
    const area = (outline[1]![0] - outline[0]![0]) * (outline[2]![2] - outline[0]![2]) - (outline[1]![2] - outline[0]![2]) * (outline[2]![0] - outline[0]![0]);
    const sign = area >= 0 ? 1 : -1;
    const minX = Math.max(0, Math.floor((Math.min(...outline.map((p) => p[0])) / width + 0.5) * (resolution - 1)));
    const maxX = Math.min(resolution - 2, Math.ceil((Math.max(...outline.map((p) => p[0])) / width + 0.5) * (resolution - 1)));
    const minZ = Math.max(0, Math.floor((Math.min(...outline.map((p) => p[2])) / depth + 0.5) * (resolution - 1)));
    const maxZ = Math.min(resolution - 2, Math.ceil((Math.max(...outline.map((p) => p[2])) / depth + 0.5) * (resolution - 1)));
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
      const a = vertex(x, z), b = vertex(x + 1, z), c = vertex(x, z + 1), d = vertex(x + 1, z + 1);
      for (const cell of [[a, c, b], [b, c, d]]) {
        let polygon = cell;
        for (let edge = 0; edge < 3 && polygon.length; edge++) {
          const p = outline[edge]!, q = outline[(edge + 1) % 3]!;
          polygon = clip(polygon, (r) => sign * ((q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0])));
        }
        polygon = clip(polygon, (p) => level - p[1]);
        for (let i = 1; i + 1 < polygon.length; i++) {
          for (const p of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) { positions.push(p[0], level + 0.035, p[2]); uvs.push(p[0] / 4, p[2] / 4); }
        }
      }
    }
  }
  return mesh(positions, uvs);
}

/** Both renderers use the same world-space geometry. Callers own/dispose every returned geometry. */
export function buildFeatureGeometry(feature: DrawnFeature, project: WorldProject): FeatureGeometryPart[] {
  if (!feature.points.length) return [];
  if (feature.kind === 'lake') return [{ geometry: lakeGeometry(feature, project), semantic: 'water', color: '#3b8e9d' }];
  if (feature.kind === 'shape') {
    const positions = feature.points.flatMap((p) => [p[0], p[1] + 0.12, p[2]]);
    const indices = THREE.ShapeUtils.triangulateShape(feature.points.map((p) => new THREE.Vector2(p[0], p[2])), []).flat();
    return [{ geometry: mesh(positions, feature.points.flatMap((p) => [p[0] / 4, p[2] / 4]), indices), semantic: 'shape', color: '#bdad80' }];
  }
  if (feature.kind === 'waterfall') {
    const [x, y, z] = feature.points[0]!, half = feature.width / 2, drop = feature.drop ?? 8;
    return [
      { geometry: mesh([x - half, y, z, x + half, y, z, x - half, y - drop, z, x + half, y - drop, z], [0, 0, 1, 0, 0, drop / 2, 1, drop / 2], [0, 2, 1, 1, 2, 3]), semantic: 'water', color: '#73c8d3' },
      { geometry: mesh([x - half * 1.2, y - drop + 0.08, z - 0.7, x + half * 1.2, y - drop + 0.08, z - 0.7, x - half * 1.2, y - drop + 0.08, z + 1.3, x + half * 1.2, y - drop + 0.08, z + 1.3], [0, 0, 1, 0, 0, 1, 1, 1], [0, 2, 1, 1, 2, 3]), semantic: 'foam', color: '#d8f4ed' },
    ];
  }
  const samples: Vec3[] = [];
  const budget = Math.max(1, Math.floor(2047 / Math.max(1, feature.points.length - 1)));
  for (let i = 0; i + 1 < feature.points.length; i++) {
    const a = feature.points[i]!, b = feature.points[i + 1]!;
    const steps = Math.min(budget, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]))));
    for (let step = 0; step < steps; step++) { const t = step / steps; samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  samples.push(feature.points.at(-1)!);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  let length = 0;
  samples.forEach((point, i) => {
    const previous = samples[Math.max(0, i - 1)]!, next = samples[Math.min(samples.length - 1, i + 1)]!;
    const dx = next[0] - previous[0], dz = next[2] - previous[2], magnitude = Math.hypot(dx, dz) || 1;
    if (i > 0) length += Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    for (const side of [-1, 1]) {
      const x = point[0] - dz / magnitude * feature.width / 2 * side, z = point[2] + dx / magnitude * feature.width / 2 * side;
      const y = feature.kind === 'path' ? sampleTerrain(project.terrain, x, z) + 0.1 : feature.kind === 'bridge' ? feature.elevation ?? point[1] : point[1];
      positions.push(x, y, z); uvs.push(side < 0 ? 0 : 1, length / 3);
    }
    if (i + 1 < samples.length) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const semantic = feature.kind === 'river' ? 'water' : feature.kind === 'bridge' ? 'bridge' : 'path';
  const parts: FeatureGeometryPart[] = [{ geometry: mesh(positions, uvs, indices), semantic, color: semantic === 'water' ? '#3b8e9d' : semantic === 'bridge' ? '#a4875b' : '#a8946a' }];
  if (feature.kind === 'bridge') {
    for (const point of [samples[0]!, samples.at(-1)!]) {
      const base = sampleTerrain(project.terrain, point[0], point[2]), top = feature.elevation ?? point[1];
      if (top > base) { const support = new THREE.BoxGeometry(Math.min(feature.width, 0.5), top - base, 0.5); support.translate(point[0], (top + base) / 2, point[2]); parts.push({ geometry: support, semantic: 'bridge', color: '#665339' }); }
    }
  }
  return parts;
}

export function featureFlowWarnings(feature: DrawnFeature, project: WorldProject): string[] {
  if (feature.kind !== 'river') return [];
  const warnings: string[] = [];
  for (let i = 1; i < feature.points.length; i++) if (feature.points[i]![1] > feature.points[i - 1]![1] + 0.05) { warnings.push('River rises downstream. Lower the later vertices for downhill flow.'); break; }
  for (const [id, point, label] of [[feature.startLakeId, feature.points[0], 'Start'], [feature.endLakeId, feature.points.at(-1), 'End']] as const) {
    const lake = project.features?.find((f) => f.id === id);
    if (lake && point && Math.abs(point[1] - (lake.elevation ?? 0)) > 0.15) warnings.push(`${label} vertex differs from its connected lake level. Reconnect to match the level.`);
    if (lake && point) {
      let inside = false, nearest = Infinity;
      for (let i = 0, j = lake.points.length - 1; i < lake.points.length; j = i++) {
        const a = lake.points[j]!, b = lake.points[i]!;
        if ((a[2] > point[2]) !== (b[2] > point[2]) && point[0] < (b[0] - a[0]) * (point[2] - a[2]) / (b[2] - a[2]) + a[0]) inside = !inside;
        const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / (dx * dx + dz * dz || 1)));
        nearest = Math.min(nearest, Math.hypot(point[0] - a[0] - t * dx, point[2] - a[2] - t * dz));
      }
      if ((!inside && nearest > 0.1) || sampleTerrain(project.terrain, point[0], point[2]) > (lake.elevation ?? 0) + 0.15) warnings.push(`${label} vertex is away from the connected lake water. Reconnect to its shoreline.`);
    }
  }
  return warnings;
}
