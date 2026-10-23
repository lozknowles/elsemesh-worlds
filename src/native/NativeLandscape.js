import { inspectAndLoadAsset, disposeAssetScene } from '../ui/asset-admission.ts';
import { buildNativeAsset } from './NativeAssets.js';
import * as N from '../vendor/elsemesh/engine/index.js';
import { Material } from '../vendor/elsemesh/engine/render/Material.js';
import { Texture } from '../vendor/elsemesh/engine/gpu/Texture.js';
import { GPU } from '../vendor/elsemesh/engine/gpu/GPU.js';
import {
  bakeLandscapeAtlas,
  landscapeChunks,
  sceneryParts,
  landscapeInstanceTint,
  landscapePartTint,
  landscapeWaterGeometry,
  updateLandscapeWater,
  HASH_SIZE,
} from '../ui/landscape-render.ts';
import { createLandscapeCollisionIndex } from '../domain/landscape.ts';
export async function nativeLandscapeSurface(project) {
  const atlas = await bakeLandscapeAtlas(project);
  if (!atlas) return { textures: {}, uniforms: {}, surface: '', dispose() {}, diagnostics: { tiles: 0 } };
  const color = new Texture({
      label: 'landscape-color',
      width: atlas.size,
      height: atlas.size,
      format: 'rgba8unorm',
      data: atlas.data,
    }),
    rough = new Texture({
      label: 'landscape-rough',
      width: atlas.size,
      height: atlas.size,
      format: 'rgba8unorm',
      data: atlas.rough,
    }),
    index = new Texture({
      label: 'landscape-index',
      width: HASH_SIZE,
      height: 1,
      format: 'rgba32float',
      data: atlas.index,
    });
  return {
    textures: { landscapeColor: color, landscapeRough: rough, landscapeIndex: index },
    uniforms: {
      landscapeSize: ['vec4f', [atlas.size, atlas.side, project.terrain.width, project.terrain.depth]],
    },
    surface: /*wgsl*/ `
 let lc=(in.P.xz+mat.landscapeSize.zw*0.5)/16.0;let tile=floor(lc);
 var hash=i32(((i32(tile.x)*17+i32(tile.y)*31)%4096+4096)%4096);var slot=0.0;
 for(var probe=0;probe<256;probe++){let entry=textureLoad(landscapeIndex,vec2i(hash,0),0);if(entry.z<0.5){break;}if(all(abs(entry.xy-tile)<vec2f(0.1))){slot=entry.z;break;}hash=(hash+1)%4096;}
 let n=max(0.0,slot-1.0);let atlasSlot=vec2f(n%mat.landscapeSize.y,floor(n/mat.landscapeSize.y));
 let luv=(atlasSlot*66.0+1.0+fract(lc)*64.0)/mat.landscapeSize.x;
 let land=textureSampleLevel(landscapeColor,smpLinearClamp,luv,0.0);let landR=textureSampleLevel(landscapeRough,smpLinearClamp,luv,0.0);
 if(slot>0.5){s.albedo=mix(s.albedo,land.rgb,land.a);s.roughness=mix(s.roughness,landR.r,landR.a);}
`,
    diagnostics: { tiles: atlas.tiles, size: atlas.size },
    dispose() {
      const destroy = () => {
        color.destroy();
        rough.destroy();
        index.destroy();
      };
      if (GPU.encoder) GPU.onSubmit(null, destroy);
      else destroy();
    },
  };
}
export async function buildNativeLandscape(project, convert) {
  const root = new N.Group(),
    matrix = new N.Matrix4(),
    q = new N.Quaternion(),
    scale = new N.Vector3();
  const shared = new Map(),
    assetRoots = [];
  let count = 0,
    draws = 0;
  try {
    for (const items of landscapeChunks(project).values()) {
      const first = items[0];
      if (first.assetRef) continue;
      count += items.length;
      const key = [first.kind, first.treeSpecies, first.seed % 4].join('/');
      let parts = shared.get(key);
      if (!parts) {
        parts = sceneryParts(first.kind, first.treeSpecies, first.seed % 4).map((part) => {
          const geometry = convert(part.geometry);
          part.geometry.dispose();
          return {
            geometry,
            semantic: part.semantic,
            material: new Material({
              name: 'landscape-' + first.kind,
              color: part.color,
              roughness: 0.9,
              side: 'double',
            }),
          };
        });
        shared.set(key, parts);
      }
      for (const part of parts) {
        const mesh = new N.InstancedMesh(part.geometry, part.material, items.length);
        items.forEach((item, i) => {
          q.setFromEuler(new N.Euler(...item.rotation));
          scale.fromArray(item.scale);
          matrix.compose(new N.Vector3(...item.position), q, scale);
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, landscapePartTint(item, part.semantic));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = first.kind !== 'grass';
        root.add(mesh);
        draws++;
      }
    }
    const chunks = landscapeChunks(project);
    for (const id of new Set([...chunks.values()].map((items) => items[0].assetRef).filter(Boolean))) {
      const asset = project.assets.find((a) => a.id === id);
      if (!asset) throw new Error('Landscape GLB asset missing: ' + id);
      const loaded = await inspectAndLoadAsset(await (await fetch(asset.dataUrl)).arrayBuffer());
      let converted;
      try {
        converted = buildNativeAsset(loaded, { materialOverrides: [] }, convert);
        assetRoots.push(converted.group);
      } finally {
        disposeAssetScene(loaded.scene);
      }
      for (const items of chunks.values()) {
        if (items[0].assetRef !== id) continue;
        count += items.length;
        for (const child of converted.group.children) {
          const mesh = new N.InstancedMesh(child.geometry, child.material, items.length);
          items.forEach((item, i) => {
            q.setFromEuler(new N.Euler(...item.rotation));
            matrix.compose(new N.Vector3(...item.position), q, new N.Vector3(...item.scale));
            mesh.setMatrixAt(i, matrix);
            mesh.setColorAt(i, landscapeInstanceTint(item));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.castShadow = true;
          if (child.material.transparent) mesh.layers.set(2);
          root.add(mesh);
          draws++;
        }
      }
    }
    root.userData.disposeAssetTextures = () => assetRoots.forEach((g) => g.userData.disposeAssetTextures?.());
    const waterSource = landscapeWaterGeometry(project),
      waterGeometry = convert(waterSource),
      water = new N.Mesh(
        waterGeometry,
        new Material({
          name: 'landscape-water',
          color: '#4f9fba',
          roughness: 0.23,
          metalness: 0.25,
          transparent: true,
          opacity: 0.72,
          side: 'double',
        }),
      );
    water.layers.set(2);
    root.add(water);
    root.userData.updateLandscape = (time) => {
      updateLandscapeWater(project, waterSource, time);
      const source = waterSource.getAttribute('position'),
        target = waterGeometry.getAttribute('position');
      target.array.set(source.array);
      target.needsUpdate = true;
    };
    root.userData.disposeLandscape = () => waterSource.dispose();
    root.userData.landscapeStats = {
      instances: count,
      draws,
      colliders: createLandscapeCollisionIndex(project).shapes.length,
      sharedVariants: shared.size,
      waterVertices: waterSource.getAttribute('position').count,
    };
    return root;
  } catch (error) {
    const geometries = new Set(),
      materials = new Set();
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) materials.add(node.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    assetRoots.forEach((group) => group.userData.disposeAssetTextures?.());
    throw error;
  }
}
