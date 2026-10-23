import { inspectAndLoadAsset, disposeAssetScene } from './asset-admission';
import { useMemo, useEffect } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as T from 'three';
import type { WorldProject } from '../domain/world';
import {
  landscapeChunks,
  sceneryParts,
  landscapeInstanceTint,
  landscapePartTint,
  landscapeWaterGeometry,
  updateLandscapeWater,
} from './landscape-render';
export default function LandscapeScenery({
  project,
  onPromote,
}: {
  project: WorldProject;
  onPromote?: (id: string) => void;
}) {
  const chunks = useMemo(() => landscapeChunks(project), [project]);
  const group = useMemo(() => {
    const shared = new Map<
      string,
      { geometry: T.BufferGeometry; material: T.MeshStandardMaterial; semantic?: string }[]
    >();
    const root = new T.Group(),
      matrix = new T.Matrix4(),
      q = new T.Quaternion(),
      scale = new T.Vector3();
    for (const [key, items] of chunks) {
      const first = items[0]!;
      if (first.assetRef) continue;
      const variantKey = [first.kind, first.treeSpecies, first.seed % 4].join('/');
      let parts = shared.get(variantKey);
      if (!parts) {
        parts = sceneryParts(first.kind, first.treeSpecies, first.seed % 4).map((part) => ({
          geometry: part.geometry,
          semantic: part.semantic,
          material: new T.MeshStandardMaterial({ color: part.color, roughness: 0.9, side: T.DoubleSide }),
        }));
        shared.set(variantKey, parts);
      }
      for (const part of parts) {
        const mesh = new T.InstancedMesh(part.geometry, part.material, items.length);
        mesh.name = 'Landscape ' + key;
        mesh.userData.landscapeIds = items.map((i) => i.id);
        mesh.userData.landscapeKind = first.kind;
        items.forEach((item, i) => {
          q.setFromEuler(new T.Euler(...item.rotation));
          scale.fromArray(item.scale);
          matrix.compose(new T.Vector3(...item.position), q, scale);
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, landscapePartTint(item, part.semantic));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = first.kind !== 'grass';
        mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
    return root;
  }, [chunks]);
  useEffect(() => {
    let disposed = false;
    const loadedRoots: T.Group[] = [];
    void (async () => {
      const assets = [
        ...new Set(
          [...chunks.values()].map((items) => items[0]!.assetRef).filter((id): id is string => !!id),
        ),
      ];
      for (const id of assets) {
        const asset = project.assets.find((a) => a.id === id);
        if (!asset) throw new Error('Landscape GLB asset missing: ' + id);
        const loaded = await inspectAndLoadAsset(await (await fetch(asset.dataUrl)).arrayBuffer());
        if (disposed) {
          disposeAssetScene(loaded.scene);
          return;
        }
        loadedRoots.push(loaded.scene);
        loaded.scene.updateMatrixWorld(true);
        for (const items of chunks.values()) {
          if (items[0]!.assetRef !== id) continue;
          loaded.scene.traverse((node) => {
            if (!(node instanceof T.Mesh)) return;
            const mesh = new T.InstancedMesh(node.geometry, node.material, items.length),
              matrix = new T.Matrix4(),
              q = new T.Quaternion();
            mesh.userData.landscapeIds = items.map((i) => i.id);
            mesh.userData.landscapeKind = items[0]!.kind;
            items.forEach((item, i) => {
              q.setFromEuler(new T.Euler(...item.rotation));
              matrix
                .compose(new T.Vector3(...item.position), q, new T.Vector3(...item.scale))
                .multiply(node.matrixWorld);
              mesh.setMatrixAt(i, matrix);
              mesh.setColorAt(i, landscapeInstanceTint(item));
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.castShadow = true;
            group.add(mesh);
          });
        }
      }
    })().catch((error) => console.error('Landscape custom asset:', error));
    return () => {
      disposed = true;
      loadedRoots.forEach(disposeAssetScene);
    };
  }, [group, chunks, project.assets]);
  const water = useMemo(() => landscapeWaterGeometry(project), [project]);
  useFrame(({ clock }) => updateLandscapeWater(project, water, clock.elapsedTime));
  useEffect(
    () => () => {
      group.traverse((o) => {
        const m = o as T.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material)
          for (const material of Array.isArray(m.material) ? m.material : [m.material]) material.dispose();
      });
      water.dispose();
    },
    [group, water],
  );
  return (
    <>
      <primitive
        object={group}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (event.delta > 5 || !onPromote || event.object.userData.landscapeKind !== 'tree') return;
          const id = event.object.userData.landscapeIds?.[event.instanceId ?? -1];
          if (id) {
            event.stopPropagation();
            onPromote(id);
          }
        }}
      />
      <mesh geometry={water} receiveShadow>
        <meshStandardMaterial
          color="#4f9fba"
          roughness={0.23}
          metalness={0.25}
          transparent
          opacity={0.72}
          side={T.DoubleSide}
        />
      </mesh>
    </>
  );
}
