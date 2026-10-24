import { Group, Mesh, Color } from '../engine/index.js';
import { Texture } from '../engine/gpu/Texture.js';
import { GPU } from '../engine/gpu/GPU.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { Material } from '../engine/render/Material.js';

/** glTF primitives may be merged by GLTFLoader into geometry groups. Each group
 * retains its source material; source slots can be shared by several nodes. */
export function assetPrimitiveGroups(child) {
  const geometry=child.geometry;
  const materials=Array.isArray(child.material)?child.material:[child.material];
  const count=geometry.index?.count??geometry.getAttribute('position').count;
  const groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
  const output=[];
  for(const group of groups) {
    const start=Math.max(0,group.start,geometry.drawRange.start);
    const end=Math.min(count,group.start+group.count,geometry.drawRange.start+geometry.drawRange.count);
    if(end<=start) continue;
    const material=materials[group.materialIndex??0];
    if(!material) continue;
    const indices=[];
    for(let index=start;index<end;index++) indices.push(geometry.index?geometry.index.getX(index):index);
    const part=geometry.clone();part.clearGroups();part.setIndex(indices);part.setDrawRange(0,indices.length);
    part.applyMatrix4(child.matrixWorld);
    if(child.matrixWorld.determinant()<0) {
      for(let triangle=0;triangle+2<indices.length;triangle+=3) [indices[triangle+1],indices[triangle+2]]=[indices[triangle+2],indices[triangle+1]];
      part.setIndex(indices);
    }
    output.push({geometry:part,material});
  }
  return output;
}

function uploadBaseColor(map) {
  const image=map.image;
  const width=image?.width??image?.videoWidth, height=image?.height??image?.videoHeight;
  if(!width||!height) throw new Error('Base-color image has no decoded pixels.');
  if(width>8192||height>8192) throw new Error('Base-color image exceeds the native preview limit.');
  const texture=new Texture({label:'builder-asset-base-color',width,height,format:'rgba8unorm-srgb',mips:true,usage:['sample','copyDst']});
  try {
    GPU.queue.copyExternalImageToTexture({source:image,flipY:!!map.flipY},{texture:texture.getGPU(),premultipliedAlpha:false},[width,height]);
    generateMipmaps(texture);
    return texture;
  } catch(error) {texture.destroy();throw error;}
}
const wrap=value=>value===1000?'repeat':value===1002?'mirror-repeat':'clamp-to-edge';

/** Converts an admitted static scene, leaving object placement to its parent.
 * No normalization/centering is applied: saved transforms remain authoritative. */
export function buildNativeAsset(loaded,object,convertGeometry) {
  const group=new Group(), diagnostics={primitives:[],warnings:[]};
  const textures=new Map(), materials=new Map();
  const ownedTextures=[];
  loaded.scene.updateMatrixWorld(true);
  const makeMaterial=source=>{
    if(materials.has(source)) return materials.get(source);
    const slot=loaded.materialIndices.get(source)??source.userData.gltfMaterialIndex??-1;
    const override=object.materialOverrides?.find(value=>value.materialIndex===slot);
    let color=new Color(source.color?.r??1,source.color?.g??1,source.color?.b??1);
    if(override?.color!==undefined) color=new Color(override.color);
    const roughness=override?.roughness??source.roughness??1;
    const metalness=override?.metalness??source.metalness??0;
    let texture=null, bindings={}, uniforms={}, surface='';
    if(source.map) {
      try {
        texture=textures.get(source.map);
        if(!texture) {texture=uploadBaseColor(source.map);textures.set(source.map,texture);ownedTextures.push(texture);}
        const map=source.map;if(map.matrixAutoUpdate) map.updateMatrix();
        const matrix=map.matrix.elements;
        uniforms={assetUVRow0:['vec3f',[matrix[0],matrix[3],matrix[6]]],assetUVRow1:['vec3f',[matrix[1],matrix[4],matrix[7]]]};
        bindings={assetAlbedo:{texture},assetSampler:{sampler:GPU.device.createSampler({addressModeU:wrap(map.wrapS),addressModeV:wrap(map.wrapT),minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:4})}};
        surface=/* wgsl */`
  let assetUV=vec2f(dot(mat.assetUVRow0,vec3f(in.uv,1.0)),dot(mat.assetUVRow1,vec3f(in.uv,1.0)));
  let assetTexel=textureSample(assetAlbedo,assetSampler,assetUV);
  s.albedo *= assetTexel.rgb;
  s.alpha *= assetTexel.a;
`;
      } catch(error) {diagnostics.warnings.push(`Material ${slot}: ${error.message}`);}
    }
    if(source.normalMap||source.roughnessMap||source.metalnessMap||source.aoMap||source.emissiveMap) diagnostics.warnings.push(`Material ${slot}: normal/ORM/AO/emissive textures are omitted.`);
    const material=new Material({name:`builder-asset-slot-${slot}`,color,roughness,metalness,opacity:source.opacity??1,alphaTest:source.alphaTest??0,transparent:source.transparent??false,depthWrite:source.depthWrite??true,side:source.side===2?'double':source.side===1?'back':'front',lit:!source.isMeshBasicMaterial,vertexColors:source.vertexColors??false,emissive:new Color(source.emissive?.r??0,source.emissive?.g??0,source.emissive?.b??0).multiplyScalar(source.emissiveIntensity??1),bindings,uniforms,surface});
    materials.set(source,{material,slot,textured:!!texture});
    return materials.get(source);
  };
  try {
    loaded.scene.traverse(child=>{
      if(!child.isMesh||!child.visible) return;
      if(child.isSkinnedMesh||child.morphTargetInfluences?.length) diagnostics.warnings.push('Skinning/morph animation is shown as static geometry.');
      for(const part of assetPrimitiveGroups(child)) {
        if(part.material.map?.channel) {
          const attribute=part.geometry.getAttribute(`uv${part.material.map.channel}`);
          if(attribute) part.geometry.setAttribute('uv',attribute);
          else diagnostics.warnings.push(`Material ${part.material.userData.gltfMaterialIndex??-1}: requested UV channel is missing.`);
        }
        const info=makeMaterial(part.material), geometry=convertGeometry(part.geometry);part.geometry.dispose();
        const item=new Mesh(geometry,info.material);item.castShadow=true;item.receiveShadow=true;
        if(info.material.transparent) item.layers.set(2);
        group.add(item);
        const position=geometry.getAttribute('position'), first=geometry.index?.getX(0)??0;
        diagnostics.primitives.push({node:child.name,materialIndex:info.slot,indices:geometry.index?.count??0,firstPosition:[position.getX(first),position.getY(first),position.getZ(first)],color:[info.material.color.r,info.material.color.g,info.material.color.b],roughness:info.material.roughness,metalness:info.material.metalness,textured:info.textured});
      }
    });
    group.userData.assetDiagnostics=diagnostics;
    group.userData.disposeAssetTextures=()=>{
      const destroy=()=>ownedTextures.forEach(texture=>texture.destroy());
      if(GPU.encoder) GPU.onSubmit(null,destroy); else destroy();
    };
    return {group,diagnostics};
  } catch(error) {
    group.traverse(node=>node.geometry?.dispose());materials.forEach(value=>value.material.dispose());ownedTextures.forEach(texture=>texture.destroy());throw error;
  }
}
