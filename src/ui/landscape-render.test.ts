import * as T from 'three';
import { createTreeGeometry } from '../domain/trees';
import { promoteLandscapeInstance, renderedLandscapeTreeSeed } from '../domain/landscape';
import { landscapePartTint } from './landscape-render';
import { describe, it, expect } from 'vitest';
import { createWorld, createTerrain } from '../domain/world';
import {
  createLandscapeLayer,
  applyLandscapeArea,
  applyLandscapeBrush,
  updateLandscapeLayer,
  sampleLandscapeWater,
} from '../domain/landscape';
import {
  bakeLandscapeAtlas,
  landscapeChunks,
  sceneryParts,
  landscapeWaterGeometry,
  updateLandscapeWater,
  preflightLandscape,
} from './landscape-render';
const base = () => {
  const p = createWorld('Render fixture');
  p.terrain = createTerrain(32, 32, 9);
  p.terrain.heights.fill(0);
  return p;
};
const fill = (kind: 'ground' | 'vegetation' | 'water') => {
  let p = createLandscapeLayer(base(), { kind, id: 'layer' });
  p = applyLandscapeArea(p, {
    layerId: 'layer',
    mode: 'paint',
    boundary: [
      [-12, 0, -12],
      [12, 0, -12],
      [12, 0, 12],
      [-12, 0, 12],
    ],
  });
  return p;
};
describe('landscape shared renderer', () => {
  it('packs sparse one-metre ground coverage into a bounded detailed atlas', async () => {
    const atlas = await bakeLandscapeAtlas(fill('ground'));
    expect(atlas!.tiles).toBe(4);
    expect(atlas!.size).toBe(132);
    expect(atlas!.index.filter((_, i) => i % 4 === 2 && atlas!.index[i]! > 0)).toHaveLength(4);
    expect(atlas!.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    expect(atlas!.rough.some((v, i) => i % 4 === 0 && v > 220)).toBe(true);
  });
  it('keeps all five scenery classes finite with bounded shared parts', () => {
    for (const kind of ['tree', 'shrub', 'grass', 'flower', 'rock'])
      for (let variant = 0; variant < 4; variant++) {
        for (const part of sceneryParts(kind, 'broadleaf', variant)) {
          expect(part.geometry.getAttribute('position').count).toBeLessThan(10000);
          expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
          part.geometry.dispose();
        }
      }
  });
  it('keeps deterministic instance membership and stable cached preparation', () => {
    const p = fill('vegetation');
    expect(preflightLandscape(p)).toBe(preflightLandscape(p));
    expect([...landscapeChunks(p).values()].flat()).toHaveLength(preflightLandscape(p).length);
    expect(
      [...landscapeChunks(p).values()].every((items) =>
        items.every((i) => Math.floor(i.position[0] / 64) === Math.floor(items[0]!.position[0] / 64)),
      ),
    ).toBe(true);
  });
  it('clips a pond against terrain, its exact boundary and erased mask cells', () => {
    let p = fill('water');
    p = updateLandscapeLayer(p, 'layer', {
      water: { level: 2, waveAmplitude: 0.5, waveSpeed: 1, shoreFade: 2 },
    });
    p = applyLandscapeBrush(p, {
      layerId: 'layer',
      points: [[0, 0, 0]],
      radius: 3,
      strength: 1,
      falloff: 0,
      mode: 'erase',
    });
    const g = landscapeWaterGeometry(p),
      a = g.getAttribute('position');
    expect(a.count).toBeGreaterThan(0);
    for (let i = 0; i < a.count; i += 3) {
      const x = (a.getX(i) + a.getX(i + 1) + a.getX(i + 2)) / 3,
        z = (a.getZ(i) + a.getZ(i + 1) + a.getZ(i + 2)) / 3;
      expect(Math.abs(x)).toBeLessThanOrEqual(12);
      expect(Math.abs(z)).toBeLessThanOrEqual(12);
      expect(sampleLandscapeWater(p, x, z, 0)).not.toBeNull();
    }
    updateLandscapeWater(p, g, 1.23);
    for (let i = 0; i < a.count; i++) {
      const s = sampleLandscapeWater(p, a.getX(i), a.getZ(i), 1.23);
      expect(a.getY(i)).toBeCloseTo(s?.height ?? 2, 5);
    }
    g.dispose();
  });
  it('does not render water over terrain above its level', () => {
    const p = fill('water');
    p.terrain.heights.fill(100);
    const g = landscapeWaterGeometry(p);
    expect(g.getAttribute('position').count).toBe(0);
    g.dispose();
  });
});

it('preserves full original geometry and colors when a generated tree is promoted', () => {
  const p = fill('vegetation'),
    instance = preflightLandscape(p)[0]!,
    next = promoteLandscapeInstance(p, instance.id),
    object = next.objects.find((o) => o.landscapeOrigin?.generatedId === instance.id)!;
  expect(object.treeSeed).toBe(renderedLandscapeTreeSeed(instance));
  const original = createTreeGeometry(instance.treeSpecies, object.treeSeed),
    parts = sceneryParts('tree', instance.treeSpecies, instance.seed % 4);
  expect(Array.from(parts[0]!.geometry.getAttribute('position').array)).toEqual(
    original.bark.positions.map(Math.fround),
  );
  expect(Array.from(parts[0]!.geometry.index!.array)).toEqual(original.bark.indices);
  expect(Array.from(parts[1]!.geometry.getAttribute('position').array)).toEqual(
    original.foliage.positions.map(Math.fround),
  );
  expect(Array.from(parts[1]!.geometry.index!.array)).toEqual(original.foliage.indices);
  expect(new T.Color(parts[0]!.color).multiply(landscapePartTint(instance, 'bark')).getHexString()).toBe(
    instance.treeSpecies === 'palm' ? '897156' : '66503a',
  );
  expect(new T.Color(parts[1]!.color).multiply(landscapePartTint(instance, 'foliage')).getHexString()).toBe(
    instance.color.slice(1),
  );
  parts.forEach((part) => part.geometry.dispose());
});

it('admits collider-bin budgets before caching or publishing a generated population',()=>{
 const binary=new Uint8Array(44);new Float32Array(binary.buffer,0,9).set([-30,0,-30,30,0,-30,0,30,30]);new Uint16Array(binary.buffer,36,3).set([0,1,2]);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:44}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-30,0,-30],max:[30,30,30]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
 const source=new TextEncoder().encode(JSON.stringify(json)),padded=new Uint8Array(Math.ceil(source.length/4)*4).fill(32);padded.set(source);const glb=new Uint8Array(28+padded.length+binary.length),view=new DataView(glb.buffer);for(const [offset,value]of [[0,0x46546c67],[4,2],[8,glb.length],[12,padded.length],[16,0x4e4f534a],[20+padded.length,binary.length],[24+padded.length,0x004e4942]])view.setUint32(offset!,value!,true);glb.set(padded,20);glb.set(binary,28+padded.length);
 const candidate=createLandscapeLayer(base(),{kind:'vegetation',id:'crowded'});candidate.terrain=createTerrain(256,128,9);candidate.terrain.heights.fill(0);candidate.objects=[];candidate.features=[];candidate.assets=[{id:'wide',name:'Wide portable tree',mediaType:'model/gltf-binary',bytes:glb.length,dataUrl:'data:application/octet-stream;base64,'+Buffer.from(glb).toString('base64'),bounds:{min:[-30,0,-30],max:[30,30,30]}}];const scatter=candidate.landscape!.layers[0]!.scatter!;Object.assign(scatter,{assetRef:'wide',spacing:1,density:1,scaleMin:1,scaleMax:1});candidate.landscape!.layers[0]!.mask.tiles=Object.fromEntries(Array.from({length:80},(_,i)=>[(i%10)+':'+Math.floor(i/10),Array(256).fill(255)]));
 let current=fill('ground');const original=current,before=structuredClone(current),candidateBefore=structuredClone(candidate);expect(()=>{preflightLandscape(candidate);current=candidate;}).toThrow(/collision index bin limit/);expect(current).toBe(original);expect(current).toEqual(before);expect(candidate).toEqual(candidateBefore);expect(()=>preflightLandscape(candidate)).toThrow(/collision index bin limit/);
 scatter.density=.001;const safe=preflightLandscape(candidate);expect(safe.length).toBeGreaterThan(0);expect(preflightLandscape(candidate)).toBe(safe);
});
