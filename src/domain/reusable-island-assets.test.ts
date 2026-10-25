import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assetLibrary, createLibraryObject, placeLibraryObject } from './asset-library';
import { inspectGlbJson } from './asset-glb';
import { packWorldRepository, unpackWorldRepository } from './world-repository';
import { createWorld, sampleTerrain, type WorldAsset } from './world';

const entries = assetLibrary.filter(entry => entry.id.startsWith('island-') || entry.id.startsWith('wildlife-'));

describe('reusable Original Island objects', () => {
  it('ships every source-derived model as an admitted, portable library asset', () => {
    expect(entries).toHaveLength(14);
    for (const entry of entries) {
      const bytes = readFileSync('public' + entry.assetUrl!);
      const inspected = inspectGlbJson(Uint8Array.from(bytes).buffer);
      expect(inspected.triangleCount).toBeGreaterThan(0);
      expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
      expect(entry.source).toBeTruthy();
      expect(entry.license).toMatch(/MIT/);
    }
  });

  it('places a whale in deep water, huts on ground, and wildlife without collisions', () => {
    const whale = entries.find(entry => entry.id === 'wildlife-humpback-whale')!;
    const hut = entries.find(entry => entry.id === 'island-beach-hut-s1')!;
    const crab = entries.find(entry => entry.id === 'wildlife-ghost-crab')!;
    const project = createWorld('Test coast');
    project.terrain.heights.fill(-8);
    project.water = { level: 0, waveAmplitude: 0.2, waveSpeed: 1, extent: 500 };
    const whaleAsset = { bounds: inspectGlbJson(Uint8Array.from(readFileSync('public' + whale.assetUrl!)).buffer).bounds } as WorldAsset;
    project.spawn.position = [0, 0, 0];
    project.water.extent = 20;
    expect(() => placeLibraryObject(whale, createLibraryObject(whale, [0, 0, 0], 'whale-outside-water'), whaleAsset, project)).toThrow(/water surface/);
    project.water.extent = 50;
    const placedWhale = placeLibraryObject(whale, createLibraryObject(whale, [0, 0, 0], 'whale-1'), whaleAsset, project);
    expect(Math.abs(placedWhale.position[0]) + 4.37).toBeLessThanOrEqual(25);
    expect(Math.abs(placedWhale.position[2]) + 9.34).toBeLessThanOrEqual(25);
    expect(placedWhale.position[1]).toBe(0);
    expect(sampleTerrain(project.terrain, placedWhale.position[0], placedWhale.position[2])).toBeLessThan(-3);
    expect(placedWhale.collision).toBe('none');
    expect(createLibraryObject(crab, [0, 0, 0], 'crab-1').collision).toBe('none');
    project.terrain.heights.fill(2);
    const hutAsset = { bounds: inspectGlbJson(Uint8Array.from(readFileSync('public' + hut.assetUrl!)).buffer).bounds } as WorldAsset;
    const first = placeLibraryObject(hut, createLibraryObject(hut, [0, 0, 0], 'hut-1'), hutAsset, project);
    project.objects.push(first);
    const second = placeLibraryObject(hut, createLibraryObject(hut, [0, 0, 0], 'hut-2'), hutAsset, project);
    expect(second.position[0] - first.position[0]).toBe(11);
    expect(first.position[1] + hutAsset.bounds!.min[1]).toBeCloseTo(2);
    expect(first.collision).toBe('solid');
  });

  it('retains model references and exact authored positions after repository save/reopen', async () => {
    const entry = entries.find(item => item.id === 'wildlife-ghost-crab')!;
    const bytes = readFileSync('public' + entry.assetUrl!);
    const project = createWorld('Wildlife coast');
    const asset: WorldAsset = {
      id: 'ghost-crab-asset', name: entry.name, mediaType: 'model/gltf-binary',
      dataUrl: 'data:application/octet-stream;base64,' + bytes.toString('base64'),
      bytes: bytes.length, source: entry.source, license: entry.license, prepared: true,
      bounds: inspectGlbJson(Uint8Array.from(bytes).buffer).bounds,
    };
    project.assets.push(asset);
    const crab = createLibraryObject(entry, [12, 3, 22], 'ghost-crab-object');
    crab.assetId = asset.id;
    project.objects.push(crab);
    const files = await packWorldRepository(project);
    const restored = await unpackWorldRepository(async path => files.get(path)!);
    expect(restored.objects).toEqual(project.objects);
    expect(restored.assets).toEqual(project.assets);
  });
  it('reopens whale and hut models together with independent authored transforms', async () => {
    const project = createWorld('Combined coast');
    project.water = { level: 0, waveAmplitude: 0.2, waveSpeed: 1, extent: 500 };
    for (const [entryId, assetId, objectId, position] of [
      ['wildlife-humpback-whale', 'whale-asset', 'whale-1', [31, 0, 30]],
      ['island-beach-hut-s1', 'hut-asset', 'hut-1', [5, 2, -20]],
    ] as const) {
      const entry = entries.find(item => item.id === entryId)!;
      const bytes = readFileSync('public' + entry.assetUrl!);
      project.assets.push({
        id: assetId, name: entry.name, mediaType: 'model/gltf-binary',
        dataUrl: 'data:application/octet-stream;base64,' + bytes.toString('base64'),
        bytes: bytes.length, source: entry.source, license: entry.license, prepared: true,
        bounds: inspectGlbJson(Uint8Array.from(bytes).buffer).bounds,
      });
      project.objects.push({ ...createLibraryObject(entry, [...position], objectId), assetId });
    }
    const files = await packWorldRepository(project);
    const restored = await unpackWorldRepository(async path => files.get(path)!);
    expect(restored.objects).toEqual(project.objects);
    expect(restored.assets).toEqual(project.assets);
    expect(files.size).toBeGreaterThan(2);
  }, 20000);

});
