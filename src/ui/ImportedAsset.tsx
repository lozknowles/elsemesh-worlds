import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { EditorObject, WorldAsset } from '../domain/world';
import { disposeAssetScene, inspectAndLoadAsset } from './asset-admission';

type MaterialSource = { material: THREE.MeshStandardMaterial; index: number; color: THREE.Color; roughness: number; metalness: number };
type LoadedInstance = { scene: THREE.Group; sources: MaterialSource[] };

/** Each object owns its scene and cloned materials; shared material references stay shared within that instance. */
export default function ImportedAsset({ asset, overrides }: { asset?: WorldAsset; overrides?: EditorObject['materialOverrides'] }) {
  const [loaded, setLoaded] = useState<LoadedInstance | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let instance: THREE.Group | null = null;
    const load = async () => {
      if (!asset) throw new Error('The referenced model is missing.');
      const response = await fetch(asset.dataUrl);
      if (!response.ok) throw new Error('The embedded model could not be read.');
      const admitted = await inspectAndLoadAsset(await response.arrayBuffer());
      const clones = new Map<THREE.Material, THREE.Material>();
      const sources: MaterialSource[] = [];
      admitted.scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = true; node.receiveShadow = true;
        const clone = (original: THREE.Material) => {
          let material = clones.get(original);
          if (!material) {
            material = original.clone(); clones.set(original, material);
            const pbr = material as THREE.MeshStandardMaterial;
            const index = admitted.materialIndices.get(original) ?? -1;
            material.userData.gltfMaterialIndex = index;
            if (pbr.color) sources.push({ material: pbr, index, color: pbr.color.clone(), roughness: pbr.roughness ?? 1, metalness: pbr.metalness ?? 0 });
          }
          return material;
        };
        node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
      });
      for (const original of clones.keys()) original.dispose();
      if (!alive) { disposeAssetScene(admitted.scene); return; }
      instance = admitted.scene;
      setError(''); setLoaded({ scene: admitted.scene, sources });
    };
    void load().catch((reason) => { if (alive) { setLoaded(null); setError(reason instanceof Error ? reason.message : 'Model loading failed.'); } });
    return () => { alive = false; if (instance) disposeAssetScene(instance); };
  }, [asset]);
  useEffect(() => {
    for (const source of loaded?.sources ?? []) {
      const override = overrides?.find((entry) => entry.materialIndex === source.index);
      source.material.color.copy(source.color);
      source.material.roughness = source.roughness;
      source.material.metalness = source.metalness;
      if (override?.color !== undefined) source.material.color.set(override.color);
      if (override?.roughness !== undefined) source.material.roughness = override.roughness;
      if (override?.metalness !== undefined) source.material.metalness = override.metalness;
      source.material.needsUpdate = true;
    }
  }, [loaded, overrides]);
  if (error) return <Html center><div className="asset-load-error" role="alert">{error}</div></Html>;
  return loaded ? <primitive object={loaded.scene} /> : null;
}
