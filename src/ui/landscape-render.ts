import { createTreeGeometry } from '../domain/trees';
import type { TreeSpecies, TreeMeshData } from '../domain/trees';
import { buildFeatureGeometry } from '../domain/features';
import type { Vec3 } from '../domain/world';
import * as T from 'three';
import type { WorldProject } from '../domain/world';
import {
  assertLandscapeDerivedBudget,
  landscapeWaterHasCompleteCoverage,
  renderedLandscapeTreeSeed,
  createLandscapeSampler,
  admitLandscapeProject,
  sampleLandscapeWater,
} from '../domain/landscape';
import type { LandscapeInstance } from '../domain/landscape-types';
export const TILE = 16,
  PIXELS = 64,
  STRIDE = 66,
  HASH_SIZE = 4096;
const mod = (a: number, n: number) => ((a % n) + n) % n;
export async function bakeLandscapeAtlas(p: WorldProject) {
  const layers = p.landscape?.layers.filter((l) => l.visible && l.kind === 'ground') ?? [];
  const keys = [...new Set(layers.flatMap((l) => Object.keys(l.mask.tiles)))].sort();
  if (!keys.length) return null;
  const side = Math.ceil(Math.sqrt(keys.length)),
    size = side * STRIDE,
    data = new Uint8Array(size * size * 4),
    rough = new Uint8Array(size * size * 4),
    index = new Float32Array(HASH_SIZE * 4);
  const sampler = createLandscapeSampler(p),
    images = new Map<string, { data: Uint8ClampedArray; width: number; height: number }>();
  for (const image of p.landscape?.images ?? []) {
    const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
    try {
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      images.set(image.id, {
        data: ctx.getImageData(0, 0, c.width, c.height).data,
        width: c.width,
        height: c.height,
      });
    } finally {
      bitmap.close();
    }
  }
  keys.forEach((key, i) => {
    const [tx, tz] = key.split(':').map(Number) as [number, number];
    let h = mod(tx * 17 + tz * 31, HASH_SIZE);
    while (index[h * 4 + 2]) h = (h + 1) % HASH_SIZE;
    index.set([tx, tz, i + 1, 1], h * 4);
    const ax = (i % side) * STRIDE,
      az = Math.floor(i / side) * STRIDE;
    for (let z = 0; z < STRIDE; z++)
      for (let x = 0; x < STRIDE; x++) {
        const wx =
            tx * TILE + ((Math.max(1, Math.min(PIXELS, x)) - 0.5) * TILE) / PIXELS - p.terrain.width / 2,
          wz = tz * TILE + ((Math.max(1, Math.min(PIXELS, z)) - 0.5) * TILE) / PIXELS - p.terrain.depth / 2;
        const sample = sampler.groundAt(wx, wz);
        let r = 0,
          g = 0,
          b = 0,
          a = 0,
          rs = 0;
        for (const { material, weight } of sample.contributions) {
          const c = new T.Color(material.color);
          let tint: number[] = [c.r, c.g, c.b];
          const image = material.imageRef && images.get(material.imageRef);
          if (image) {
            const ix = Math.floor(mod(wx / material.tiling, 1) * image.width),
              iz = Math.floor(mod(wz / material.tiling, 1) * image.height),
              o = (iz * image.width + ix) * 4;
            tint = tint.map(
              (v, k) =>
                v *
                ((v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))(
                  (image.data[o + k] ?? 0) / 255,
                ),
            );
          } else {
            const grain =
              0.94 + 0.06 * Math.sin(wx * material.tiling * 2.7) * Math.sin(wz * material.tiling * 3.1);
            tint = tint.map((v) => v * grain);
          }
          r = r * (1 - weight) + tint[0]! * weight;
          g = g * (1 - weight) + tint[1]! * weight;
          b = b * (1 - weight) + tint[2]! * weight;
          rs = rs * (1 - weight) + material.roughness * weight;
          a = a + (1 - a) * weight;
        }
        const o = ((az + z) * size + ax + x) * 4;
        data.set([(r / (a || 1)) * 255, (g / (a || 1)) * 255, (b / (a || 1)) * 255, a * 255], o);
        rough.set([(rs / (a || 1)) * 255, 0, 0, a * 255], o);
      }
  });
  return { data, rough, index, size, side, tiles: keys.length };
}
export type Atlas = NonNullable<Awaited<ReturnType<typeof bakeLandscapeAtlas>>>;
export function threeAtlas(atlas: Atlas) {
  const color = new T.DataTexture(atlas.data, atlas.size, atlas.size);
  color.minFilter = color.magFilter = T.LinearFilter;
  color.needsUpdate = true;
  const rough = new T.DataTexture(atlas.rough, atlas.size, atlas.size);
  rough.minFilter = rough.magFilter = T.LinearFilter;
  rough.needsUpdate = true;
  const index = new T.DataTexture(atlas.index, HASH_SIZE, 1, T.RGBAFormat, T.FloatType);
  index.needsUpdate = true;
  return {
    color,
    rough,
    index,
    dispose() {
      color.dispose();
      rough.dispose();
      index.dispose();
    },
  };
}
export const atlasGLSL = `uniform sampler2D landscapeColor;uniform sampler2D landscapeRough;uniform sampler2D landscapeIndex;uniform vec4 landscapeSize;varying vec2 landscapeWorld;
vec4 landscapeSample(sampler2D tex){vec2 cell=(landscapeWorld+landscapeSize.zw*.5)/16.;vec2 tile=floor(cell);float h=mod(mod(tile.x*17.+tile.y*31.,4096.)+4096.,4096.);float id=0.;for(int i=0;i<256;i++){vec4 entry=texture2D(landscapeIndex,vec2((h+.5)/4096.,.5));if(entry.z<.5)break;if(all(lessThan(abs(entry.xy-tile),vec2(.1)))){id=entry.z;break;}h=mod(h+1.,4096.);}if(id<.5)return vec4(0.);float n=id-1.;vec2 slot=vec2(mod(n,landscapeSize.y),floor(n/landscapeSize.y));vec2 uv=(slot*66.+1.+fract(cell)*64.)/landscapeSize.x;return texture2D(tex,uv);}`;
export function installLandscapeShader(
  shader: Parameters<T.MeshStandardMaterial['onBeforeCompile']>[0],
  textures: ReturnType<typeof threeAtlas>,
  atlas: Atlas,
  p: WorldProject,
) {
  shader.uniforms.landscapeColor = { value: textures.color };
  shader.uniforms.landscapeRough = { value: textures.rough };
  shader.uniforms.landscapeIndex = { value: textures.index };
  shader.uniforms.landscapeSize = {
    value: new T.Vector4(atlas.size, atlas.side, p.terrain.width, p.terrain.depth),
  };
  shader.vertexShader = 'varying vec2 landscapeWorld;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    '#include <worldpos_vertex>\nlandscapeWorld=(modelMatrix*vec4(transformed,1.)).xz;',
  );
  shader.fragmentShader = atlasGLSL + '\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nvec4 landR=landscapeSample(landscapeRough);roughnessFactor=mix(roughnessFactor,landR.r,landR.a);',
    )
    .replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nvec4 land=landscapeSample(landscapeColor);diffuseColor.rgb=mix(diffuseColor.rgb,land.rgb,land.a);',
    );
}
export function sceneryParts(
  kind: string,
  species: string,
  variant: number,
): { geometry: T.BufferGeometry; color: string; semantic?: string }[] {
  const lift = (g: T.BufferGeometry, y: number) => {
    g.translate(0, y, 0);
    return g;
  };
  if (kind === 'tree') {
    const tree = createTreeGeometry(species as TreeSpecies, renderedLandscapeTreeSeed({ seed: variant }));
    const buffer = (data: TreeMeshData) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3));
      g.setIndex(data.indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    return [
      { geometry: buffer(tree.bark), color: species === 'palm' ? '#897156' : '#66503a', semantic: 'bark' },
      { geometry: buffer(tree.foliage), color: '#ffffff', semantic: 'foliage' },
    ];
  }
  if (kind === 'rock') {
    const g = lift(new T.IcosahedronGeometry(0.65, 1), 0.4);
    g.scale(1, 0.7, 1);
    return [{ geometry: g, color: '#848680' }];
  }
  if (kind === 'shrub')
    return [{ geometry: lift(new T.IcosahedronGeometry(0.65, 1), 0.5), color: '#648e49' }];
  if (kind === 'flower')
    return [
      { geometry: lift(new T.CylinderGeometry(0.025, 0.035, 0.65, 4), 0.325), color: '#568648' },
      {
        geometry: lift(new T.IcosahedronGeometry(0.16, 0), 0.69),
        color: ['#e9c76d', '#b287b9', '#d8e7b8', '#e29eac'][variant % 4]!,
      },
    ];
  const g = new T.BufferGeometry(),
    pos: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3,
      dx = Math.cos(a) * 0.22,
      dz = Math.sin(a) * 0.22;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx * 0.2, 0.65, dz * 0.2);
  }
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return [{ geometry: g, color: '#719952' }];
}
export function landscapeChunks(p: WorldProject) {
  const groups = new Map<string, LandscapeInstance[]>();
  for (const item of preflightLandscape(p)) {
    const key = [
      Math.floor(item.position[0] / 64),
      Math.floor(item.position[2] / 64),
      item.kind,
      item.treeSpecies,
      item.seed % 4,
      item.assetRef ?? '',
    ].join('/');
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}
/** Reuse exact lake/terrain clipping, then clip triangles at one-metre mask boundaries. */
export function landscapeWaterGeometry(p: WorldProject) {
  assertLandscapeDerivedBudget(p);
  const positions: number[] = [],
    levels: number[] = [],
    sampler = createLandscapeSampler(p);
  const clip = (input: Vec3[], axis: 0 | 2, value: number, sign: number) => {
    const output: Vec3[] = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i]!,
        b = input[(i + 1) % input.length]!,
        da = (a[axis] - value) * sign,
        db = (b[axis] - value) * sign;
      if (da >= -1e-7) output.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return output;
  };
  for (const layer of p.landscape?.layers ?? []) {
    if (!layer.visible || layer.kind !== 'water' || !layer.boundary || !layer.water) continue;
    const completeCoverage = landscapeWaterHasCompleteCoverage(p, layer);
    const parts = buildFeatureGeometry(
      {
        id: layer.id,
        name: layer.name,
        kind: 'lake',
        points: layer.boundary,
        elevation: layer.water.level,
        width: 1,
      },
      p,
    );
    for (const part of parts) {
      const a = part.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i += 3) {
        const triangle: Vec3[] = [0, 1, 2].map((n) => [a.getX(i + n), a.getY(i + n), a.getZ(i + n)] as Vec3);
        if (completeCoverage) {
          for (const vertex of triangle) {
            positions.push(vertex[0], layer.water.level, vertex[2]);
            levels.push(layer.water.level);
          }
          continue;
        }
        const minX = Math.floor(Math.min(...triangle.map((v) => v[0])) + p.terrain.width / 2),
          maxX = Math.floor(Math.max(...triangle.map((v) => v[0])) + p.terrain.width / 2),
          minZ = Math.floor(Math.min(...triangle.map((v) => v[2])) + p.terrain.depth / 2),
          maxZ = Math.floor(Math.max(...triangle.map((v) => v[2])) + p.terrain.depth / 2);
        for (let cz = minZ; cz <= maxZ; cz++)
          for (let cx = minX; cx <= maxX; cx++) {
            const x = cx - p.terrain.width / 2,
              z = cz - p.terrain.depth / 2;
            if (sampler.maskAt(layer.id, x + 0.5, z + 0.5) <= 0) continue;
            let polygon = clip(triangle, 0, x, 1);
            polygon = clip(polygon, 0, x + 1, -1);
            polygon = clip(polygon, 2, z, 1);
            polygon = clip(polygon, 2, z + 1, -1);
            if (polygon.length < 3) continue;
            const center = polygon.reduce(
                (v, q) => [v[0] + q[0] / polygon.length, 0, v[2] + q[2] / polygon.length] as Vec3,
                [0, 0, 0] as Vec3,
              ),
              winning = sampleLandscapeWater(p, center[0], center[2], 0);
            if (winning?.layerId !== layer.id) continue;
            for (let k = 1; k + 1 < polygon.length; k++)
              for (const vertex of [polygon[0]!, polygon[k]!, polygon[k + 1]!]) {
                positions.push(vertex[0], layer.water.level, vertex[2]);
                levels.push(layer.water.level);
              }
          }
      }
      part.geometry.dispose();
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('waterLevel', new T.Float32BufferAttribute(levels, 1));
  const amplitude = new Float32Array(levels.length),
    speed = new Float32Array(levels.length);
  const position = g.getAttribute('position');
  for (let i = 0; i < levels.length; i++) {
    const sample = sampleLandscapeWater(p, position.getX(i), position.getZ(i), 0);
    amplitude[i] = sample?.amplitude ?? 0;
    speed[i] = p.landscape?.layers.find((layer) => layer.id === sample?.layerId)?.water?.waveSpeed ?? 0;
  }
  g.setAttribute('waterAmplitude', new T.BufferAttribute(amplitude, 1));
  g.setAttribute('waterSpeed', new T.BufferAttribute(speed, 1));
  g.computeVertexNormals();
  return g;
}
export function updateLandscapeWater(_p: WorldProject, g: T.BufferGeometry, time: number) {
  const a = g.getAttribute('position'),
    level = g.getAttribute('waterLevel'),
    amplitude = g.getAttribute('waterAmplitude'),
    speed = g.getAttribute('waterSpeed');
  for (let i = 0; i < a.count; i++)
    a.setY(
      i,
      level.getX(i) +
        Math.sin(a.getX(i) * 0.04 + a.getZ(i) * 0.03 + time * speed.getX(i)) * amplitude.getX(i),
    );
  a.needsUpdate = true;
}

const generatedCache = new WeakMap<WorldProject, LandscapeInstance[]>();
export function preflightLandscape(project: WorldProject) {
  let list = generatedCache.get(project);
  if (!list) {
    const admitted = admitLandscapeProject(project);
    if (!admitted.valid || !admitted.instances) throw new Error(admitted.errors[0] ?? 'Landscape admission failed.');
    list = admitted.instances;
    generatedCache.set(project, list);
  }
  return list;
}

/** Neutral per-instance brightness keeps each original part's material hue. */
export function landscapeInstanceTint(item: LandscapeInstance) {
  const base = { tree: '#497b39', shrub: '#57813f', grass: '#6b9345', flower: '#b78dcb', rock: '#82877e' }[
    item.kind
  ];
  let ratio = 0;
  for (const offset of [1, 3, 5])
    ratio +=
      parseInt(item.color.slice(offset, offset + 2), 16) /
      Math.max(1, parseInt(base.slice(offset, offset + 2), 16)) /
      3;
  const linear = Math.pow(Math.max(0.5, Math.min(1.5, ratio)), 2.2);
  return new T.Color().setRGB(linear, linear, linear);
}

export function landscapePartTint(item: LandscapeInstance, semantic?: string) {
  if (item.kind === 'tree' && !item.assetRef) {
    if (semantic === 'foliage') return new T.Color(item.color);
    if (semantic === 'bark') return new T.Color(1, 1, 1);
  }
  return landscapeInstanceTint(item);
}
