import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createTreeGeometry, treeWindOffset } from '../domain/trees';
import type { TreeMeshData, TreeSpecies } from '../domain/trees';

function buffer(data: TreeMeshData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // Wind can move the crown beyond the static bounds.
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.4;
  return geometry;
}
export default function TreeShape({ species = 'broadleaf', seed = 7319, color = '#496d35' }: {
  species?: TreeSpecies; seed?: number; color?: string;
}) {
  const meshes = useMemo(() => {
    const data = createTreeGeometry(species, seed);
    return [data.bark, data.foliage].map((part) => ({ rest: part.positions, geometry: buffer(part) }));
  }, [species, seed]);
  useEffect(() => () => meshes.forEach(({ geometry }) => geometry.dispose()), [meshes]);
  useFrame(({ clock }) => {
    for (const { rest, geometry } of meshes) {
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        const x = rest[i * 3]!, y = rest[i * 3 + 1]!, z = rest[i * 3 + 2]!;
        const [dx, dy, dz] = treeWindOffset(x, y, z, clock.elapsedTime, seed, species);
        positions.setXYZ(i, x + dx, y + dy, z + dz);
      }
      positions.needsUpdate = true;
    }
  });
  return <group>
    <mesh geometry={meshes[0]!.geometry} castShadow receiveShadow>
      <meshStandardMaterial color={species === 'palm' ? '#897156' : '#66503a'} roughness={0.95} />
    </mesh>
    <mesh geometry={meshes[1]!.geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.78} />
    </mesh>
  </group>;
}
