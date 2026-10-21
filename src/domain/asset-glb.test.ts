import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { inspectGlbJson } from './asset-glb';
import { createPlayerWorldPackage, createWorld, validateWorld } from './world';
import type { EditorObject } from './world';
import { admitGlb, disposeAssetScene, inspectAndLoadAsset } from '../ui/asset-admission';

function fixture(change?: (json: Record<string, unknown>) => void, binaryOverride?: Uint8Array) {
  const binary = binaryOverride ?? new Uint8Array(44);
  if (!binaryOverride) {
    new Float32Array(binary.buffer, 0, 9).set([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
    new Uint16Array(binary.buffer, 36, 3).set([0, 1, 2]);
  }
  const json: Record<string, unknown> = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0 }, { mesh: 0, translation: [4, 3, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'Shared paint', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.25, 0.1, 1], roughnessFactor: 0.33, metallicFactor: 0.12 } }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
  };
  change?.(json);
  const source = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(source.length / 4) * 4).fill(32); padded.set(source);
  const result = new ArrayBuffer(28 + padded.length + binary.length);
  const view = new DataView(result);
  for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, result.byteLength], [12, padded.length], [16, 0x4e4f534a], [20 + padded.length, binary.length], [24 + padded.length, 0x004e4942]]) view.setUint32(offset!, value!, true);
  new Uint8Array(result, 20, padded.length).set(padded);
  new Uint8Array(result, 28 + padded.length).set(binary);
  return result;
}
function projectWithAsset(buffer = fixture()) {
  const project = createWorld('Asset regression');
  project.assets = [{ id: 'mesh', name: 'Triangle', mediaType: 'model/gltf-binary', bytes: buffer.byteLength, dataUrl: `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}` }];
  const object: EditorObject = { id: 'object', name: 'Triangle', kind: 'glb', assetId: 'mesh', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff', visible: true, collision: 'solid' };
  project.objects = [object];
  return project;
}

describe('portable static GLB admission', () => {
  it('calculates actual transformed bounds and retains stable shared glTF material slots', async () => {
    const buffer = fixture();
    const parsed = inspectGlbJson(buffer);
    expect(parsed.bounds).toEqual({ min: [-1, 0, 0], max: [5, 5, 0] });
    const loaded = await inspectAndLoadAsset(buffer);
    try {
      expect(loaded.bounds).toEqual(parsed.bounds);
      expect(loaded.materialCount).toBe(1);
      expect([...loaded.materialIndices.values()]).toEqual([0]);
      const indices: number[] = [];
      loaded.scene.traverse((node) => {
        const mesh = node as unknown as { material?: { userData: Record<string, number> } };
        if (mesh.material) indices.push(mesh.material.userData.gltfMaterialIndex!);
      });
      expect(indices).toEqual([0, 0]);
      expect(loaded.materialSlots[0]?.roughness).toBeCloseTo(0.33);
      expect(loaded.materialSlots[0]?.metalness).toBeCloseTo(0.12);
    } finally { disposeAssetScene(loaded.scene); }
  });
  it('embeds admitted bytes and metadata in a valid player package', async () => {
    const buffer = fixture();
    const project = projectWithAsset(buffer);
    project.assets[0] = await admitGlb(buffer, { id: 'mesh', name: 'Triangle', source: 'Fixture', license: 'CC0', prepared: true });
    project.objects[0]!.materialOverrides = [{ materialIndex: 0, color: '#abcdef', roughness: 0, metalness: 1 }];
    const packaged = createPlayerWorldPackage(project);
    expect(packaged.project.assets[0]?.dataUrl).toBe(project.assets[0]?.dataUrl);
    expect(packaged.project.assets[0]?.materialSlots?.[0]?.index).toBe(0);
    expect(validateWorld(JSON.parse(JSON.stringify(packaged.project))).valid).toBe(true);
  });
  it('rejects empty JSON, truncated chunks, bad versions and oversized accessor ranges', () => {
    expect(() => inspectGlbJson(fixture((json) => { for (const key of Object.keys(json)) delete json[key]; }))).toThrow();
    expect(() => inspectGlbJson(fixture((json) => { json.asset = { version: '1.0' }; }))).toThrow();
    const truncated = fixture().slice(0, -4); new DataView(truncated).setUint32(8, truncated.byteLength, true);
    expect(() => inspectGlbJson(truncated)).toThrow(/chunk/);
    expect(() => inspectGlbJson(fixture((json) => { (json.accessors as { count: number }[])[0]!.count = 600_000; }))).toThrow();
    expect(() => inspectGlbJson(fixture((json) => { json.scene = 99; }))).toThrow();
  });
  it('rejects external resources, required extensions, compression, skinning and morphs', () => {
    for (const change of [
      (json: Record<string, unknown>) => { json.buffers = [{ byteLength: 44, uri: 'https://example.test/geometry.bin' }]; },
      (json: Record<string, unknown>) => { json.images = [{ uri: 'https://example.test/image.png' }]; },
      (json: Record<string, unknown>) => { json.extensionsRequired = ['KHR_materials_unlit']; },
      (json: Record<string, unknown>) => { json.extensionsUsed = ['EXT_meshopt_compression']; },
      (json: Record<string, unknown>) => { json.skins = [{}]; },
      (json: Record<string, unknown>) => { json.animations = [{}]; },
      (json: Record<string, unknown>) => { json.meshes = [{ primitives: [{ attributes: { POSITION: 0 }, targets: [] }] }]; },
      (json: Record<string, unknown>) => { json.nodes = [{ children: [0] }]; },
    ]) expect(() => inspectGlbJson(fixture(change))).toThrow();
  });
  it('rejects NaN geometry, bad indices and collapsed meshes before GPU loading', () => {
    const bad = new Uint8Array(44); new Float32Array(bad.buffer, 0, 9).set([Number.NaN, 0, 0, 1, 0, 0, 0, 2, 0]); new Uint16Array(bad.buffer, 36, 3).set([0, 1, 2]);
    expect(() => inspectGlbJson(fixture(undefined, bad))).toThrow(/nonfinite/);
    const indices = fixture(); const offset = 28 + new DataView(indices).getUint32(12, true); new DataView(indices).setUint16(offset + 40, 300, true);
    expect(() => inspectGlbJson(indices)).toThrow(/index/);
    expect(() => inspectGlbJson(fixture(undefined, new Uint8Array(44)))).toThrow(/collapsed/);
  });
  it('rejects malformed, duplicate and missing material overrides and forged byte/bounds metadata', () => {
    for (const override of [false, null, 0, {}, [{ materialIndex: 0 }, { materialIndex: 0 }], [{ materialIndex: 1 }], [{ materialIndex: 0, roughness: -1 }]]) {
      const project = projectWithAsset(); Object.assign(project.objects[0]!, { materialOverrides: override });
      expect(validateWorld(project).valid).toBe(false);
    }
    const bytes = projectWithAsset(); bytes.assets[0]!.bytes--;
    expect(validateWorld(bytes).valid).toBe(false);
    const count = projectWithAsset(); count.assets[0]!.materialCount = 2;
    expect(validateWorld(count).valid).toBe(false);
    const bounds = projectWithAsset(); bounds.assets[0]!.bounds = { min: [0, 0, 0], max: [10, 10, 10] };
    expect(validateWorld(bounds).valid).toBe(false);
  });
  it('rejects oversized embedded images and invalid material texture references before decode', () => {
    const bytes = new Uint8Array(68);
    new Float32Array(bytes.buffer, 0, 9).set([-1, 0, 0, 1, 0, 0, 0, 2, 0]);
    new Uint16Array(bytes.buffer, 36, 3).set([0, 1, 2]);
    const header = new DataView(bytes.buffer, 44, 24);
    header.setUint32(0, 0x89504e47); header.setUint32(4, 0x0d0a1a0a); header.setUint32(8, 13); header.setUint32(12, 0x49484452); header.setUint32(16, 32768); header.setUint32(20, 32768);
    expect(() => inspectGlbJson(fixture((json) => {
      (json.bufferViews as unknown[]).push({ buffer: 0, byteOffset: 44, byteLength: 24 });
      json.images = [{ bufferView: 2, mimeType: 'image/png' }];
    }, bytes))).toThrow(/dimensions/);
    expect(() => inspectGlbJson(fixture((json) => { json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 99 } } }]; }))).toThrow(/missing texture/);
    expect(() => inspectGlbJson(fixture((json) => { json.materials = [{ pbrMetallicRoughness: { roughnessFactor: -2 } }]; }))).toThrow(/factor/);
  });
  it('admits all four shipped catalogue derivatives under the same policy', () => {
    const root = new URL('../../public/assets/elsemesh/debris/', import.meta.url);
    const files = readdirSync(root).filter((name) => name.endsWith('.glb'));
    expect(files).toHaveLength(4);
    for (const file of files) {
      const bytes = readFileSync(new URL(file, root));
      const result = inspectGlbJson(Uint8Array.from(bytes).buffer);
      expect(result.triangleCount).toBeGreaterThan(100);
      expect(result.materialCount).toBeGreaterThan(0);
      expect(result.bounds.min[1]).toBeLessThan(0);
    }
  });
});
