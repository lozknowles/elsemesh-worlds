import { describe, expect, it } from 'vitest';
import { createGeographicTerrain, parseAsciiGrid, sampleGeographicGrid, validateGeography, validateTerrainImagery } from './geography';
import { createPlayerWorldPackage, createWorld, validateWorld } from './world';
import type { GeographicSource, TerrainImagery } from './geography';

const source: GeographicSource = { sourceName: 'Synthetic surveyed grid', license: 'Test fixture', attribution: 'Synthetic test values', verticalDatum: 'Fixture datum; heights retained' };
const header = 'ncols 5\nnrows 5\nxllcorner 100095\nyllcorner 200095\ncellsize 10\nNODATA_value -9999';
const samples = '400 410 420 430 440\n300 310 320 330 340\n200 210 220 230 240\n100 110 120 130 140\n0 10 20 30 40';
const selection = { easting: 100120, northing: 200120, radius: 20, resolution: 9 };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrB8AAAAASUVORK5CYII=';

describe('EPSG:27700 sampled terrain import', () => {
  it('reads corner and centre origins equivalently and preserves north-first rows', () => {
    const corner = parseAsciiGrid(`${header}\n${samples}`);
    const centre = parseAsciiGrid(`${header.replace('xllcorner 100095', 'xllcenter 100100').replace('yllcorner 200095', 'yllcenter 200100')}\n${samples}`);
    expect(corner).toEqual(centre);
    expect(sampleGeographicGrid(corner, 100100, 200140)).toBe(400);
    expect(sampleGeographicGrid(corner, 100100, 200100)).toBe(0);
    expect(sampleGeographicGrid(corner, 100105, 200105)).toBeCloseTo(55);
  });
  it('creates east-positive, north-negative Z terrain while retaining source datum heights', () => {
    const { terrain, geography } = createGeographicTerrain(parseAsciiGrid(`${header}\n${samples}`), selection, source);
    expect(terrain.width).toBe(40);
    expect(terrain.resolution).toBe(9);
    expect(terrain.heights[0]).toBe(400);
    expect(terrain.heights[8]).toBe(440);
    expect(terrain.heights[40]).toBe(220);
    expect(terrain.heights[72]).toBe(0);
    expect(terrain.heights[80]).toBe(40);
    expect(geography.sourceSpacing).toBe(10);
    expect(geography.outputSpacing).toBe(5);
    expect(geography.verticalDatum).toBe(source.verticalDatum);
    expect(validateGeography(geography, terrain)).toEqual([]);
  });
  it('rejects incomplete, extra, duplicate, conflicting and nonfinite ASCII data', () => {
    for (const input of [
      `${header}\n${samples} 1`, `${header}\n${samples.replace('400 ', '')}`,
      `${header}\nncols 5\n${samples}`, `${header}\nxllcenter 100100\n${samples}`,
      `${header}\n${samples.replace('420', 'NaN')}`, `${header.replace('cellsize 10', 'cellsize 0')}\n${samples}`,
      `${header.replace('nrows 5', 'nrows 5.5')}\n${samples}`,
    ]) expect(() => parseAsciiGrid(input)).toThrow();
  });
  it('rejects any uncovered or NODATA cells without extrapolating across holes', () => {
    const grid = parseAsciiGrid(`${header}\n${samples}`);
    expect(() => createGeographicTerrain(grid, { ...selection, radius: 21 }, source)).toThrow(/coverage/);
    expect(() => sampleGeographicGrid(grid, 100099, 200120)).toThrow(/coverage/);
    grid.values[12] = -9999;
    expect(() => createGeographicTerrain(grid, selection, source)).toThrow(/NODATA/);
    const many = { ncols: 65, nrows: 65, cellSize: 1, xOrigin: 100100, yOrigin: 200100, nodata: -9999, values: Array(65 * 65).fill(50) as number[] };
    many.values[66] = -9999; // This cell lies between the deliberately coarse output samples.
    expect(() => createGeographicTerrain(many, { easting: 100132, northing: 200132, radius: 32, resolution: 9 }, source)).toThrow(/NODATA/);
  });
  it('caps local extent and output samples while distinguishing source detail from resampling', () => {
    const grid = { ncols: 3, nrows: 3, cellSize: 1024, xOrigin: 100000, yOrigin: 200000, nodata: null, values: Array(9).fill(-10) as number[] };
    const result = createGeographicTerrain(grid, { easting: 101024, northing: 201024, radius: 1024, resolution: 257 }, source);
    expect(result.terrain.heights).toHaveLength(257 ** 2);
    expect(new Set(result.terrain.heights)).toEqual(new Set([-10]));
    expect(result.geography.sourceSpacing).toBe(1024);
    expect(result.geography.outputSpacing).toBe(8);
    expect(() => createGeographicTerrain(grid, { easting: 101024, northing: 201024, radius: 1025 }, source)).toThrow();
    expect(() => createGeographicTerrain(grid, { easting: 101024, northing: 201024, radius: 1024, resolution: 259 }, source)).toThrow();
  });
  it('round-trips georeference, attribution and embedded imagery without changing legacy projects', () => {
    const result = createGeographicTerrain(parseAsciiGrid(`${header}\n${samples}`), selection, source);
    const terrainImagery: TerrainImagery = { crs: 'EPSG:27700', dataUrl: image, bounds: result.geography.bounds, sourceName: 'Fixture image', license: 'Fixture', attribution: 'Synthetic image' };
    const project = { ...createWorld(), ...result, terrainImagery };
    expect(validateTerrainImagery(terrainImagery, result.geography)).toEqual([]);
    expect(validateWorld(project).valid).toBe(true);
    const output = createPlayerWorldPackage(JSON.parse(JSON.stringify(project)));
    expect(output.project.geography).toEqual(result.geography);
    expect(output.project.terrainImagery).toEqual(terrainImagery);
    expect(validateWorld(createWorld()).valid).toBe(true);
  });
  it('rejects mismatched geography, CRS, disjoint imagery and excessive dimensions while permitting partial coverage', () => {
    const { terrain, geography } = createGeographicTerrain(parseAsciiGrid(`${header}\n${samples}`), selection, source);
    expect(validateGeography({ ...geography, crs: 'EPSG:4326' }, terrain).length).toBeGreaterThan(0);
    expect(validateGeography({ ...geography, outputSpacing: 10 }, terrain).length).toBeGreaterThan(0);
    const imagery = { crs: 'EPSG:27700', dataUrl: image, bounds: geography.bounds, sourceName: 'Image', license: 'Fixture', attribution: 'Fixture' };
    expect(validateTerrainImagery(imagery).length).toBeGreaterThan(0);
    expect(validateTerrainImagery({ ...imagery, bounds: { ...geography.bounds, west: geography.bounds.west + 1 } }, geography)).toEqual([]);
    expect(validateTerrainImagery({ ...imagery, bounds: { ...geography.bounds, west: geography.bounds.east + 1, east: geography.bounds.east + 10 } }, geography).length).toBeGreaterThan(0);
    expect(validateTerrainImagery({ ...imagery, dataUrl: 'https://example.test/image.png' }, geography).length).toBeGreaterThan(0);
    const bytes = Buffer.from(image.split(',')[1]!, 'base64'); bytes.writeUInt32BE(9000, 16);
    expect(validateTerrainImagery({ ...imagery, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }, geography).join(' ')).toMatch(/budget/);
  });
});
