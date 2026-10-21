import type { Terrain } from './world';

export type GeographicBounds = { west: number; south: number; east: number; north: number };
export type GeographicSource = { sourceName: string; license: string; attribution: string; verticalDatum: string; source?: string };
export type GeoReference = GeographicSource & {
  crs: 'EPSG:27700'; center: { easting: number; northing: number }; bounds: GeographicBounds;
  sourceSpacing: number; outputSpacing: number;
};
export type TerrainImagery = {
  crs: 'EPSG:27700'; dataUrl: string; bounds: GeographicBounds;
  sourceName: string; license: string; attribution: string;
};
/** Origins are the southwest sample centre; values retain ASCII's north-first row order. */
export type AsciiGrid = { ncols: number; nrows: number; cellSize: number; xOrigin: number; yOrigin: number; nodata: number | null; values: number[] };
export type GeographicSelection = { easting: number; northing: number; radius: number; resolution?: number };
export const MAX_IMAGERY_BYTES = 15 * 1024 * 1024;
function fail(message: string): never { throw new Error(message); }
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: unknown, limit = 2000): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= limit;

export function parseAsciiGrid(input: string): AsciiGrid {
  if (input.length > 64 * 1024 * 1024) fail('ASCII grid exceeds the 64 MiB text limit.');
  const tokens = input.trim().split(/\s+/);
  const header = new Map<string, number>();
  const keys = new Set(['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'nodata_value']);
  let cursor = 0;
  while (cursor < tokens.length && keys.has(tokens[cursor]!.toLowerCase())) {
    const key = tokens[cursor++]!.toLowerCase();
    if (header.has(key)) fail(`Duplicate ASCII grid header ${key}.`);
    const raw = tokens[cursor++];
    const value = raw === undefined ? Number.NaN : Number(raw);
    if (!Number.isFinite(value)) fail(`ASCII grid header ${key} must be finite.`);
    header.set(key, value);
  }
  const ncols = header.get('ncols')!, nrows = header.get('nrows')!, cellSize = header.get('cellsize')!;
  if (![ncols, nrows].every((n) => Number.isInteger(n) && n >= 2) || ncols * nrows > 4_194_304) fail('ASCII grid must contain 2–4,194,304 bounded sample cells.');
  if (!finite(cellSize) || cellSize <= 0 || cellSize > 10_000) fail('ASCII cellsize must be a positive spacing in metres.');
  for (const axis of ['x', 'y']) if (Number(header.has(`${axis}llcorner`)) + Number(header.has(`${axis}llcenter`)) !== 1) fail(`Specify exactly one ${axis}llcorner or ${axis}llcenter header.`);
  if (tokens.length - cursor !== ncols * nrows) fail(`ASCII sample count differs from ncols × nrows (${ncols * nrows}).`);
  const values = new Array<number>(ncols * nrows);
  for (let i = 0; i < values.length; i++) {
    const value = Number(tokens[cursor + i]);
    if (!finite(value)) fail(`ASCII sample ${i + 1} is not finite.`);
    values[i] = value;
  }
  return { ncols, nrows, cellSize, xOrigin: header.get('xllcenter') ?? header.get('xllcorner')! + cellSize / 2, yOrigin: header.get('yllcenter') ?? header.get('yllcorner')! + cellSize / 2, nodata: header.get('nodata_value') ?? null, values };
}

/** Bilinear interpolation only inside the source sample-centre coverage. Never invent missing elevations. */
export function sampleGeographicGrid(grid: AsciiGrid, easting: number, northing: number): number {
  const x = (easting - grid.xOrigin) / grid.cellSize;
  const y = (northing - grid.yOrigin) / grid.cellSize;
  if (!finite(x) || !finite(y) || x < -1e-8 || y < -1e-8 || x > grid.ncols - 1 + 1e-8 || y > grid.nrows - 1 + 1e-8) fail('Selected terrain extends outside source sample coverage. Choose a smaller area or another grid.');
  const sx = Math.max(0, Math.min(grid.ncols - 1, x)), sy = Math.max(0, Math.min(grid.nrows - 1, y));
  const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(grid.ncols - 1, x0 + 1), y1 = Math.min(grid.nrows - 1, y0 + 1);
  const tx = sx - x0, ty = sy - y0;
  const corners = [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]];
  let height = 0;
  for (const [col, row, weight] of corners) {
    if (weight! <= 1e-12) continue;
    const value = grid.values[(grid.nrows - 1 - row!) * grid.ncols + col!];
    if (!finite(value) || (grid.nodata !== null && value === grid.nodata)) fail('Selected terrain includes NODATA or missing elevations. Choose a fully covered area.');
    height += value * weight!;
  }
  return height;
}

export function createGeographicTerrain(grid: AsciiGrid, selection: GeographicSelection, metadata: GeographicSource): { terrain: Terrain; geography: GeoReference } {
  const { easting, northing, radius } = selection;
  if (![easting, northing].every(finite) || !Number.isInteger(radius) || radius < 8 || radius > 1024) fail('Choose finite British National Grid coordinates and an integer radius from 8 to 1024 metres.');
  const size = radius * 2;
  const requested = selection.resolution ?? Math.min(257, Math.max(9, Math.ceil(size / grid.cellSize / 2) * 2 + 1));
  if (!Number.isInteger(requested) || requested < 9 || requested > 257 || requested % 2 !== 1) fail('Output resolution must be an odd grid size from 9 to 257.');
  const bounds = { west: easting - radius, east: easting + radius, south: northing - radius, north: northing + radius };
  const geography: GeoReference = { ...metadata, crs: 'EPSG:27700', center: { easting, northing }, bounds, sourceSpacing: grid.cellSize, outputSpacing: size / (requested - 1) };
  const errors = validateGeography(geography);
  if (errors.length) fail(errors[0]!);
  // Inspect every source cell touched by the crop, including cells skipped by a coarser output grid.
  const minCol = Math.floor((bounds.west - grid.xOrigin) / grid.cellSize + 1e-8), maxCol = Math.ceil((bounds.east - grid.xOrigin) / grid.cellSize - 1e-8);
  const minRow = Math.floor((bounds.south - grid.yOrigin) / grid.cellSize + 1e-8), maxRow = Math.ceil((bounds.north - grid.yOrigin) / grid.cellSize - 1e-8);
  if (minCol < 0 || minRow < 0 || maxCol >= grid.ncols || maxRow >= grid.nrows) fail('Selected terrain extends outside source sample coverage.');
  for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
    const value = grid.values[(grid.nrows - 1 - row) * grid.ncols + col];
    if (!finite(value) || (grid.nodata !== null && value === grid.nodata)) fail('Selected terrain includes NODATA or missing elevations.');
  }
  const heights: number[] = [];
  for (let z = 0; z < requested; z++) for (let x = 0; x < requested; x++) {
    const value = sampleGeographicGrid(grid, bounds.west + x * geography.outputSpacing, bounds.north - z * geography.outputSpacing);
    if (Math.abs(value) > 2000) fail('Source elevations exceed the builder’s supported ±2000 metre datum range.');
    heights.push(value);
  }
  return { terrain: { width: size, depth: size, resolution: requested, seed: 0, heights, materials: Array(heights.length).fill(0) }, geography };
}

export function validateGeographicBounds(value: unknown): value is GeographicBounds {
  if (!value || typeof value !== 'object') return false;
  const b = value as GeographicBounds;
  return [b.west, b.east, b.south, b.north].every(finite) && b.west < b.east && b.south < b.north && b.west >= 0 && b.east <= 700_000 && b.south >= 0 && b.north <= 1_300_000;
}
export function validateGeography(value: unknown, terrain?: Terrain): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Geographic reference must be an object.'];
  const geo = value as GeoReference;
  const errors: string[] = [];
  if (geo.crs !== 'EPSG:27700') errors.push('Only EPSG:27700 British National Grid geography is supported.');
  if (!validateGeographicBounds(geo.bounds) || !geo.center || !finite(geo.center.easting) || !finite(geo.center.northing)) errors.push('Geographic bounds or centre are invalid.');
  else {
    const width = geo.bounds.east - geo.bounds.west, depth = geo.bounds.north - geo.bounds.south;
    if (width > 2048 || depth > 2048 || Math.abs(width - depth) > 1e-6 || Math.abs((geo.bounds.west + geo.bounds.east) / 2 - geo.center.easting) > 1e-6 || Math.abs((geo.bounds.south + geo.bounds.north) / 2 - geo.center.northing) > 1e-6) errors.push('Geographic extent must be a centred square no larger than 2048 metres.');
    if (terrain && (Math.abs(width - terrain.width) > 1e-6 || Math.abs(depth - terrain.depth) > 1e-6 || Math.abs(width / (terrain.resolution - 1) - geo.outputSpacing) > 1e-6)) errors.push('Geographic extent or output spacing does not match the terrain.');
  }
  if (![geo.sourceSpacing, geo.outputSpacing].every((n) => finite(n) && n > 0)) errors.push('Geographic source and output sample spacing must be positive.');
  if (!text(geo.sourceName, 240) || !text(geo.license) || !text(geo.attribution) || !text(geo.verticalDatum, 240) || (geo.source !== undefined && !text(geo.source))) errors.push('Geographic source name, licence, attribution and vertical datum are required.');
  return errors;
}

/** Validate encoded imagery and real image dimensions before any browser/GPU decode. */
export function validateTerrainImagery(value: unknown, geography?: GeoReference): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Terrain imagery must be an object.'];
  const imagery = value as TerrainImagery;
  const errors: string[] = [];
  if (!geography || imagery.crs !== 'EPSG:27700' || !validateGeographicBounds(imagery.bounds)) errors.push('Terrain imagery needs EPSG:27700 bounds and a geographic terrain reference.');
  else if (validateGeographicBounds(geography.bounds) && (imagery.bounds.west >= geography.bounds.east || imagery.bounds.east <= geography.bounds.west || imagery.bounds.south >= geography.bounds.north || imagery.bounds.north <= geography.bounds.south)) errors.push('Imagery bounds must overlap the selected terrain extent.');
  if (!text(imagery.sourceName, 240) || !text(imagery.license) || !text(imagery.attribution)) errors.push('Imagery source name, licence and attribution are required.');
  try {
    if (typeof imagery.dataUrl !== 'string' || imagery.dataUrl.length > MAX_IMAGERY_BYTES * 4 / 3 + 64) fail('Terrain imagery exceeds the 15 MiB embedded image limit.');
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(imagery.dataUrl);
    if (!match || match[2]!.length % 4 !== 0) fail('Imagery must be an embedded base64 PNG or JPEG.');
    const binary = atob(match[2]!);
    if (!binary.length || binary.length > MAX_IMAGERY_BYTES) fail('Terrain imagery exceeds the 15 MiB embedded image limit.');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const [width, height] = imageDimensions(bytes, match[1]!);
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32_000_000) fail('Terrain imagery exceeds the 8192 pixel side or 32 megapixel decode budget.');
  } catch (error) { errors.push(error instanceof Error ? error.message : 'Terrain imagery is invalid.'); }
  return errors;
}

function imageDimensions(bytes: Uint8Array, type: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png') {
    if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(12) !== 0x49484452) fail('Imagery PNG header is invalid.');
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) fail('Imagery JPEG header is invalid.');
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) fail('Imagery JPEG marker is invalid.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail('Imagery JPEG is truncated.');
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) fail('Imagery JPEG segment is truncated.');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) { if (length < 8) fail('Imagery JPEG dimensions are invalid.'); return [view.getUint16(offset + 5), view.getUint16(offset + 3)]; }
    offset += length;
  }
  return fail('Imagery JPEG dimensions could not be read.');
}
