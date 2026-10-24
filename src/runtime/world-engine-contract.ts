/** Trusted installed software; no renderer implementation or source-provided code. */
export * as T from 'three';
export * as Three from 'three';
export * from '../domain/world';
export * from '../domain/world-repository';
export * from '../domain/world-source';
export * from '../domain/runtime-world';
export * from '../domain/runtime-admission';
export * from '../domain/object-hierarchy';
export * from '../domain/trees';
export * from '../domain/features';
export * from '../domain/neon-sign';
export * from '../domain/neon-geometry';
export * from '../domain/computer';
export * from '../domain/geography';
export * from '../domain/weather';
export * from '../domain/private-neon-client';
export * from '../ui/asset-admission';
export const WORLD_SOFTWARE_BUNDLE_SCHEMA = 'elsemesh.world-software/1';
export function assetPrimitiveGroups(child: import('three').Mesh) {
 const geometry=child.geometry, materials=Array.isArray(child.material)?child.material:[child.material];
 const count=geometry.index?.count??geometry.getAttribute('position').count;
 const groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
 return groups.flatMap(group=>{
  const start=Math.max(0,group.start,geometry.drawRange.start), end=Math.min(count,group.start+group.count,geometry.drawRange.start+geometry.drawRange.count);
  const material=materials[group.materialIndex??0]; if(end<=start||!material)return [];
  const indices:number[]=[];for(let i=start;i<end;i++)indices.push(geometry.index?geometry.index.getX(i):i);
  const part=geometry.clone();part.clearGroups();part.setIndex(indices);part.setDrawRange(0,indices.length);part.applyMatrix4(child.matrixWorld);
  if(child.matrixWorld.determinant()<0){for(let i=0;i+2<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2]!,indices[i+1]!];part.setIndex(indices);}
  return [{geometry:part,material}];
 });
}
export * from '../domain/authored-runtime';
export * from '../domain/portal';

// Installed avatar rendering; authored GLB admission remains static and unchanged.
export { GLTFLoader as BuiltinCharacterGLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export * from '../domain/landscape';

export {landscapePartTint,landscapeInstanceTint,bakeLandscapeAtlas,threeAtlas,installLandscapeShader,landscapeChunks,sceneryParts,landscapeWaterGeometry,updateLandscapeWater} from '../ui/landscape-render';

export * from '../domain/road-traffic';

export * from '../domain/object-access';

export * from '../domain/native-island';
