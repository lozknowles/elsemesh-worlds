import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectGlbJson, MAX_ASSET_TRIANGLES, MAX_ASSET_VERTICES } from '../domain/asset-glb';
import type { AssetBounds } from '../domain/asset-glb';
import type { AssetMaterialSlot, WorldAsset } from '../domain/world';

export function disposeAssetScene(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export async function inspectAndLoadAsset(buffer: ArrayBuffer): Promise<{
  scene: THREE.Group; materialCount: number; materialSlots: AssetMaterialSlot[];
  bounds: AssetBounds; materialIndices: Map<THREE.Material, number>;
}> {
  const inspection = inspectGlbJson(buffer);
  const loaded = await new GLTFLoader().parseAsync(buffer, '');
  const scene = loaded.scene;
  try {
    scene.updateMatrixWorld(true);
    const materialIndices = new Map<THREE.Material, number>();
    const materialSlots = new Map<number, AssetMaterialSlot>();
    let vertices = 0, triangles = 0, texturePixels = 0;
    const textures = new Set<THREE.Texture>();
    const bounds = new THREE.Box3();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh || object.morphTargetInfluences?.length) throw new Error('Use static meshes without skinning or morph targets.');
      const position = object.geometry.getAttribute('position');
      if (!position || position.count < 3) throw new Error('Asset mesh has no usable vertices.');
      vertices += position.count; triangles += (object.geometry.index?.count ?? position.count) / 3;
      if (vertices > MAX_ASSET_VERTICES || triangles > MAX_ASSET_TRIANGLES) throw new Error('Asset decoded geometry budget exceeded.');
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Asset has nonfinite transformed vertices.');
        bounds.expandByPoint(point);
      }
      if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
      object.castShadow = true; object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const index = loaded.parser.associations.get(material)?.materials ?? -1;
        material.userData.gltfMaterialIndex = index;
        materialIndices.set(material, index);
        if (index >= 0) {
          const standard = material as THREE.MeshStandardMaterial;
          materialSlots.set(index, { index, name: material.name || `Material ${index + 1}`, color: standard.color ? `#${standard.color.getHexString()}` : '#ffffff', roughness: standard.roughness ?? 1, metalness: standard.metalness ?? 0 });
        }
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const texture of textures) {
      const image = texture.image as { width?: number; height?: number } | undefined;
      if (!image || !image.width || !image.height || image.width > 4096 || image.height > 4096) throw new Error('Asset textures must be at most 4096 × 4096 pixels.');
      texturePixels += image.width * image.height;
    }
    if (texturePixels > 32_000_000) throw new Error('Asset decoded texture budget exceeded.');
    if (!vertices || bounds.isEmpty() || bounds.getSize(new THREE.Vector3()).length() < 1e-6 || [...bounds.min.toArray(), ...bounds.max.toArray()].some((n) => Math.abs(n) > 100_000)) throw new Error('Asset has empty, collapsed or excessive bounds.');
    return { scene, materialCount: inspection.materialCount, materialSlots: [...materialSlots.values()].sort((a, b) => a.index - b.index), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, materialIndices };
  } catch (error) { disposeAssetScene(scene); throw error; }
}

export async function admitGlb(buffer: ArrayBuffer, meta: { id: string; name: string; source?: string; license?: string; prepared?: boolean }): Promise<WorldAsset> {
  const admitted = await inspectAndLoadAsset(buffer);
  try {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { ...meta, mediaType: 'model/gltf-binary', dataUrl: `data:application/octet-stream;base64,${btoa(binary)}`, bytes: buffer.byteLength, bounds: admitted.bounds, materialCount: admitted.materialCount, materialSlots: admitted.materialSlots };
  } finally { disposeAssetScene(admitted.scene); }
}
