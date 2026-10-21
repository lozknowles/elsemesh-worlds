import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
export const MAX_ASSET_VERTICES = 500_000;
export const MAX_ASSET_TRIANGLES = 500_000;
export type AssetBounds = { min: [number, number, number]; max: [number, number, number] };
type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; sparse?: unknown };
type Primitive = { attributes: Record<string, number>; indices?: number; material?: number; mode?: number; targets?: unknown; extensions?: unknown };
type Node = { mesh?: number; skin?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
export type GlbJson = {
  asset: { version: string }; buffers: { byteLength: number; uri?: unknown }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: unknown }[];
  accessors: Accessor[]; meshes: { primitives: Primitive[]; weights?: unknown }[];
  nodes: Node[]; scenes: { nodes: number[] }[]; scene?: number;
  materials?: Record<string, unknown>[]; images?: { uri?: unknown; bufferView: number; mimeType: string }[];
  textures?: { source: number; extensions?: unknown }[];
  skins?: unknown[]; animations?: unknown[]; extensionsRequired?: string[]; extensionsUsed?: string[];
};
const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const requireValue: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const list = (value: unknown): value is unknown[] => Array.isArray(value);

/** Synchronous portable admission: validates every chunk and decoded mesh range before a loader sees the bytes. */
export function inspectGlbJson(buffer: ArrayBuffer): { json: GlbJson; materialCount: number; vertexCount: number; triangleCount: number; bounds: AssetBounds } {
  const view = new DataView(buffer);
  requireValue(buffer.byteLength <= MAX_ASSET_BYTES, 'GLB exceeds the 15 MiB asset limit.');
  requireValue(view.byteLength >= 28 && view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === view.byteLength, 'File is not a complete binary glTF 2.0 file.');
  let cursor = 12, jsonBytes: Uint8Array | undefined, binary: Uint8Array | undefined;
  while (cursor < view.byteLength) {
    requireValue(cursor + 8 <= view.byteLength, 'GLB has a truncated chunk header.');
    const length = view.getUint32(cursor, true), type = view.getUint32(cursor + 4, true);
    requireValue(length % 4 === 0 && cursor + 8 + length <= view.byteLength, 'GLB chunk length or alignment is invalid.');
    const bytes = new Uint8Array(buffer, cursor + 8, length);
    if (cursor === 12) { requireValue(type === 0x4e4f534a, 'GLB must start with JSON.'); jsonBytes = bytes; }
    else { requireValue(type === 0x004e4942 && binary === undefined, 'Only one embedded BIN chunk is supported.'); binary = bytes; }
    cursor += length + 8;
  }
  requireValue(jsonBytes && binary, 'GLB must include JSON and embedded geometry.');
  const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes).trim()) as GlbJson;
  requireValue(json && typeof json === 'object' && !Array.isArray(json) && json.asset?.version === '2.0', 'GLB asset.version must be 2.0.');
  requireValue(!json.extensionsRequired?.length && !(json.extensionsUsed ?? []).some((name) => /draco|meshopt|basisu/i.test(name)), 'Required extensions and compressed geometry/textures are unsupported.');
  requireValue(!json.skins?.length && !json.animations?.length, 'Use static GLB meshes without skinning or animation.');
  for (const field of ['buffers', 'bufferViews', 'accessors', 'meshes', 'nodes', 'scenes'] as const) requireValue(list(json[field]) && json[field].length > 0 && json[field].length <= 100_000, `GLB ${field} must be a bounded nonempty array.`);
  requireValue(json.scenes.length === 1 && json.nodes.length <= 4096, 'Use a single scene with at most 4096 nodes.');
  requireValue(json.buffers.length === 1 && json.buffers[0] && json.buffers[0].uri === undefined && integer(json.buffers[0].byteLength, 1) && json.buffers[0].byteLength <= binary.byteLength && binary.byteLength - json.buffers[0].byteLength <= 3, 'GLB must contain one complete embedded buffer.');
  for (const item of json.bufferViews) requireValue(item && item.buffer === 0 && integer(item.byteOffset ?? 0) && integer(item.byteLength, 1) && (item.byteOffset ?? 0) + item.byteLength <= json.buffers[0].byteLength && !item.extensions && (item.byteStride === undefined || (integer(item.byteStride, 4) && item.byteStride <= 252 && item.byteStride % 4 === 0)), 'GLB buffer view exceeds its embedded buffer or uses unsupported encoding.');
  const widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const bytesPerComponent: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  let decodedComponents = 0;
  const valueAt = (accessor: Accessor, row: number, column: number) => {
    const bv = json.bufferViews[accessor.bufferView!]!;
    const bytes = bytesPerComponent[accessor.componentType]!;
    const offset = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + row * (bv.byteStride ?? widths[accessor.type]! * bytes) + column * bytes;
    switch (accessor.componentType) {
      case 5120: return data.getInt8(offset); case 5121: return data.getUint8(offset);
      case 5122: return data.getInt16(offset, true); case 5123: return data.getUint16(offset, true);
      case 5125: return data.getUint32(offset, true); default: return data.getFloat32(offset, true);
    }
  };
  for (const accessor of json.accessors) {
    requireValue(accessor && !accessor.sparse && integer(accessor.bufferView) && !!json.bufferViews[accessor.bufferView] && integer(accessor.count, 1) && accessor.count <= MAX_ASSET_VERTICES * 3 && integer(accessor.byteOffset ?? 0) && !!widths[accessor.type] && !!bytesPerComponent[accessor.componentType], 'GLB accessor has an invalid range or unsupported sparse format.');
    const bv = json.bufferViews[accessor.bufferView]!, size = widths[accessor.type]! * bytesPerComponent[accessor.componentType]!;
    requireValue((accessor.byteOffset ?? 0) % bytesPerComponent[accessor.componentType]! === 0 && (bv.byteStride ?? size) >= size && (accessor.byteOffset ?? 0) + (accessor.count - 1) * (bv.byteStride ?? size) + size <= bv.byteLength, 'GLB accessor extends beyond its buffer view.');
    decodedComponents += accessor.count * widths[accessor.type]!;
    requireValue(decodedComponents <= 12_000_000, 'GLB decoded attribute budget exceeded.');
    if (accessor.componentType === 5126) for (let row = 0; row < accessor.count; row++) for (let column = 0; column < widths[accessor.type]!; column++) requireValue(Number.isFinite(valueAt(accessor, row, column)), 'GLB contains nonfinite vertex attributes.');
  }
  requireValue(json.materials === undefined || (list(json.materials) && json.materials.length <= 256 && json.materials.every((m) => m && typeof m === 'object' && !Array.isArray(m))), 'GLB material table is invalid.');
  const materialCount = json.materials?.length ?? 0;
  let vertexCount = 0, triangleCount = 0;
  for (const mesh of json.meshes) {
    requireValue(mesh && !mesh.weights && list(mesh.primitives) && mesh.primitives.length > 0, 'GLB mesh must contain static primitives.');
    for (const primitive of mesh.primitives) {
      requireValue(primitive && !primitive.targets && !primitive.extensions && (primitive.mode ?? 4) === 4 && primitive.attributes && typeof primitive.attributes === 'object', 'Only static triangle mesh primitives are supported.');
      const position = json.accessors[primitive.attributes.POSITION!];
      requireValue(position && position.type === 'VEC3' && position.componentType === 5126 && !position.normalized && position.count >= 3, 'GLB mesh needs float32 POSITION vertices.');
      requireValue(primitive.material === undefined || (integer(primitive.material) && primitive.material < materialCount), 'GLB references a missing material.');
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        const attr = json.accessors[index];
        requireValue(integer(index) && attr && attr.count === position.count && !/^JOINTS_|^WEIGHTS_/.test(semantic), 'GLB attribute counts or skinning attributes are unsupported.');
      }
      let count = position.count;
      if (primitive.indices !== undefined) {
        const index = json.accessors[primitive.indices];
        requireValue(integer(primitive.indices) && index && index.type === 'SCALAR' && !index.normalized && [5121, 5123, 5125].includes(index.componentType), 'GLB indices must use unsigned integer scalars.');
        count = index.count;
        for (let i = 0; i < count; i++) requireValue(valueAt(index, i, 0) < position.count, 'GLB index exceeds the vertex range.');
      }
      requireValue(count % 3 === 0, 'GLB triangle index count must be divisible by three.');
      let usable = false;
      const indexAccessor = primitive.indices === undefined ? undefined : json.accessors[primitive.indices];
      const readPoint = (i: number) => {
        const row = indexAccessor ? valueAt(indexAccessor, i, 0) : i;
        return new Vector3(valueAt(position, row, 0), valueAt(position, row, 1), valueAt(position, row, 2));
      };
      for (let i = 0; i < count && !usable; i += 3) {
        const a = readPoint(i), b = readPoint(i + 1).sub(a), c = readPoint(i + 2).sub(a);
        usable = b.cross(c).lengthSq() > 1e-16;
      }
      requireValue(usable, 'GLB mesh triangles are collapsed.');
      vertexCount += position.count; triangleCount += count / 3;
    }
  }
  requireValue(vertexCount <= MAX_ASSET_VERTICES && triangleCount > 0 && triangleCount <= MAX_ASSET_TRIANGLES, 'GLB decoded geometry budget exceeded.');
  for (const node of json.nodes) {
    requireValue(node && typeof node === 'object' && node.skin === undefined && (node.mesh === undefined || (integer(node.mesh) && !!json.meshes[node.mesh])), 'GLB node uses a missing mesh or skinning.');
    for (const [field, count] of [['matrix', 16], ['translation', 3], ['rotation', 4], ['scale', 3]] as const) if (node[field] !== undefined) requireValue(list(node[field]) && node[field]!.length === count && node[field]!.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6), 'GLB node transform is invalid.');
    requireValue(node.children === undefined || (list(node.children) && node.children.every((i) => integer(i) && !!json.nodes[i])), 'GLB node references a missing child.');
  }
  const selected = json.scene ?? 0;
  requireValue(integer(selected) && json.scenes[selected] && list(json.scenes[selected]!.nodes), 'GLB default scene is invalid.');
  const visited = new Set<number>(), active = new Set<number>(); let instances = 0;
  const bounds = new Box3(), point = new Vector3();
  const walk = (index: number, parent = new Matrix4(), depth = 0) => {
    requireValue(depth < 128, 'GLB hierarchy is too deep.');
    requireValue(integer(index) && json.nodes[index] && !active.has(index) && !visited.has(index), 'GLB scene graph contains a cycle or shared node.');
    visited.add(index); active.add(index);
    const node = json.nodes[index]!;
    requireValue(!(node.matrix && (node.translation || node.rotation || node.scale)), 'GLB transform cannot combine matrix and TRS.');
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3().fromArray(node.translation ?? [0, 0, 0]), new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(node.scale ?? [1, 1, 1]));
    const matrix = new Matrix4().multiplyMatrices(parent, local);
    if (node.mesh !== undefined) {
      for (const p of json.meshes[node.mesh]!.primitives) {
        const position = json.accessors[p.attributes.POSITION!]!;
        instances += position.count;
        for (let i = 0; i < position.count; i++) {
          point.set(valueAt(position, i, 0), valueAt(position, i, 1), valueAt(position, i, 2)).applyMatrix4(matrix);
          requireValue(point.toArray().every((n) => Number.isFinite(n) && Math.abs(n) <= 100_000), 'GLB transformed bounds are nonfinite or excessive.');
          bounds.expandByPoint(point);
        }
      }
      requireValue(instances <= MAX_ASSET_VERTICES, 'GLB instantiated geometry budget exceeded.');
    }
    for (const child of node.children ?? []) walk(child, matrix, depth + 1);
    active.delete(index);
  };
  for (const root of json.scenes[selected]!.nodes) walk(root);
  requireValue(instances > 0, 'GLB default scene has no usable meshes.');
  requireValue(!bounds.isEmpty() && bounds.getSize(new Vector3()).length() > 1e-6, 'GLB mesh bounds are collapsed.');
  requireValue(json.images === undefined || (list(json.images) && json.images.length <= 64), 'GLB image table is invalid.');
  let imagePixels = 0;
  for (const image of json.images ?? []) {
    requireValue(image && image.uri === undefined && integer(image.bufferView) && json.bufferViews[image.bufferView] && ['image/png', 'image/jpeg'].includes(image.mimeType), 'GLB textures must be embedded PNG or JPEG images.');
    const bv = json.bufferViews[image.bufferView]!;
    const bytes = binary.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const dimensions = imageDimensions(bytes, image.mimeType);
    requireValue(dimensions[0] > 0 && dimensions[1] > 0 && dimensions.every((n) => n <= 4096), 'GLB texture dimensions exceed 4096 pixels or are invalid.');
    imagePixels += dimensions[0] * dimensions[1];
    requireValue(imagePixels <= 32_000_000, 'GLB decoded image budget exceeded.');
  }
  requireValue(json.textures === undefined || (list(json.textures) && json.textures.length <= 64), 'GLB texture table is invalid.');
  for (const texture of json.textures ?? []) requireValue(texture && !texture.extensions && integer(texture.source) && json.images?.[texture.source], 'GLB texture references an unsupported image.');
  const inspectMaterial = (value: unknown, depth = 0) => {
    requireValue(depth < 24, 'GLB material metadata is too deep.');
    if (typeof value === 'number') requireValue(Number.isFinite(value), 'GLB material contains a nonfinite value.');
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (/Texture$/.test(key)) requireValue(item && typeof item === 'object' && integer((item as { index?: unknown }).index) && json.textures?.[(item as { index: number }).index], 'GLB material references a missing texture.');
      if (['roughnessFactor', 'metallicFactor', 'alphaCutoff'].includes(key)) requireValue(typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1, 'GLB material factor must be between zero and one.');
      if (['baseColorFactor', 'emissiveFactor'].includes(key)) requireValue(Array.isArray(item) && item.length === (key === 'baseColorFactor' ? 4 : 3) && item.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1), 'GLB material color factor is invalid.');
      inspectMaterial(item, depth + 1);
    }
  };
  for (const material of json.materials ?? []) inspectMaterial(material);
  return { json, materialCount, vertexCount, triangleCount, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

function imageDimensions(bytes: Uint8Array, mime: string): [number, number] {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') {
    requireValue(bytes.length >= 24 && data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a && data.getUint32(12) === 0x49484452, 'Invalid embedded PNG header.');
    return [data.getUint32(16), data.getUint32(20)];
  }
  requireValue(bytes.length >= 4 && data.getUint16(0) === 0xffd8, 'Invalid embedded JPEG header.');
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    requireValue(bytes[offset] === 0xff, 'Invalid JPEG marker.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    requireValue(offset + 2 <= bytes.length, 'Truncated JPEG marker.');
    const length = data.getUint16(offset);
    requireValue(length >= 2 && offset + length <= bytes.length, 'Truncated JPEG segment.');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) { requireValue(length >= 8, 'Invalid JPEG dimensions.'); return [data.getUint16(offset + 5), data.getUint16(offset + 3)]; }
    offset += length;
  }
  throw new Error('Unsupported JPEG dimensions or encoding.');
}
