import {Frustum,Matrix4,Box3,Vector3} from '../engine/index.js';
import {loadNativeIslandBark} from './NativeIslandBark.js';
import {FrameUniforms} from '../engine/render/Frame.js';
import {GPU} from '../engine/gpu/GPU.js';
import {TerrainGPU} from '../world/TerrainGPU.js';
import {Terrain} from '../world/Terrain.js';
import {Vegetation} from '../world/Vegetation.js';
import {NativeIslandTerrain} from './NativeIslandTerrain.js';
import {NativeIslandTiles} from './NativeIslandTiles.js';
import {buildNativeIslandWater} from './NativeIslandWater.js';
// The contract reader is injected by installed software. Content supplies data, never callbacks.
// It returns {domain:{res,size,origin},coarse:{res,heights,normal,splat},shore,
// records,grassMask,tiles:[{id,x,z,width,height,bounds}],readTile,appearance,ocean}.
function expandRGBA(data,n,res){const out=new Uint8Array(res*res*4);for(let z=0;z<res;z++)for(let x=0;x<res;x++){const i=(Math.min(n-1,Math.floor(z*n/res))*n+Math.min(n-1,Math.floor(x*n/res)))*4;out.set(data.subarray(i,i+4),(z*res+x)*4);}return out;}
export async function buildNativeIsland({project,root,camera,options={}}){
 if(typeof options.readNativeIsland!=='function')throw Error('Native island content requires the installed verified field reader.');
 const source=await options.readNativeIsland(project),{domain,coarse}=source;
 if(!coarse?.normal||!coarse?.splat||!source.records||!source.grassMask||!source.shore||!source.appearance||!source.ocean){source.dispose?.();throw Error('Incomplete native island fidelity fields.');}
 const bark=await (options.prepareVegetationAssets??loadNativeIslandBark)(source);
 const data=new NativeIslandTerrain({...domain,coarse});data.shoreField=source.shore;
 const normal=expandRGBA(coarse.normal,coarse.res,domain.res),splat=expandRGBA(coarse.splat,coarse.res,domain.res);
 let gpu,terrain,vegetation,cache,water,disposed=false;
 try{
 gpu=new TerrainGPU(data,source.shore,{maps:{normal,splat,ms:{captured:0}}});
 gpu.shoreField=source.shore;
 terrain=new Terrain({scene:root,terrainData:data,terrainGPU:gpu,renderer:options.water?.renderer,appearance:source.appearance,caveMouth:false});
 vegetation=new Vegetation({scene:root,terrain:data,records:source.records,grassMask:source.grassMask,barkMaps:bark});
 cache=new NativeIslandTiles({tiles:source.tiles,readTile:source.readTile,maxBytes:options.maxBytes,maxConcurrency:options.maxConcurrency,
  onLoad(tile,decoded){const fields=decoded.fields??decoded;data.apply(tile,decoded);gpu.uploadRegion({x:tile.x,z:tile.z,width:tile.width,height:tile.height,heights:fields.heights,normal:fields.normal,splat:fields.splat});vegetation.grass.heightTex.upload(fields.heights,{x:tile.x,y:tile.z,width:tile.width,height:tile.height});},
 });data.cache=cache;
 water=buildNativeIslandWater({root,terrainGPU:gpu,terrain,params:source.ocean,context:options.water});}
 catch(error){cache?.dispose();vegetation?.dispose();terrain?.mesh.removeFromParent();terrain?.lod.geometry.dispose();terrain?.lod.params.buffer?.destroy();terrain?.material.dispose();terrain?.material.uniformBlock.buffer?.destroy();gpu?.dispose();bark?.dispose();source.dispose?.();throw error;}
 const arrivalLeases=new Set(),frustum=new Frustum(),viewProjection=new Matrix4();
 const tileBoxes=new Map(source.tiles.map(tile=>[tile.id,new Box3(new Vector3(tile.bounds[0],tile.minHeight??-90,tile.bounds[1]),new Vector3(tile.bounds[2],tile.maxHeight??200,tile.bounds[3]))]));
 const requestVisible=viewCamera=>{viewCamera.updateMatrixWorld();viewProjection.multiplyMatrices(viewCamera.projectionMatrix,viewCamera.matrixWorldInverse.copy(viewCamera.matrixWorld).invert());frustum.setFromProjectionMatrix(viewProjection,viewCamera.coordinateSystem,viewCamera.reversedDepth!==false);const {x,z}=viewCamera.position;cache.requestView(x,z,options.viewRadius??2400,tile=>{const [x0,z0,x1,z1]=tile.bounds;return Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1))<100||frustum.intersectsBox(tileBoxes.get(tile.id));});};
 return{data,terrain,gpu,vegetation,mediaOcclusion:{grassMask:source.grassMask},water,waterMaterial:water.material,query:water.query,
  async ensureArrival(position){const release=await cache.ensureAt(position[0],position[2],3);arrivalLeases.add(release);return()=>{arrivalLeases.delete(release);release();};},
  canOccupy(x,z,radius=1){return [[x-radius,z-radius],[x+radius,z-radius],[x-radius,z+radius],[x+radius,z+radius]].every(([px,pz])=>cache.readyAt(px,pz));},
  bindView(viewCamera,view){if(view)water.update(FrameUniforms.fields.dt.value,viewCamera);terrain.update(viewCamera,0);vegetation.update(0,viewCamera);water.bindView(viewCamera,view);requestVisible(viewCamera);},
  update(dt,viewCamera){terrain.update(viewCamera,dt);vegetation.update(dt,viewCamera);water.update(dt,viewCamera);water.bindView(viewCamera);requestVisible(viewCamera);},
  stats(){return{...cache.stats(),cpuFieldBytes:data.heights.byteLength+normal.byteLength+splat.byteLength+source.grassMask.data.byteLength,source:source.sourceStats?.(),vegetation:vegetation.stats(),vegetationRecordsResident:true,gpuTerrainBaseBytes:domain.res*domain.res*12,gpuFieldResidency:'full-domain; fine tile uploads over coarse base'};},
  dispose(){if(disposed)return;disposed=true;for(const release of arrivalLeases)release();arrivalLeases.clear();cache.dispose();source.dispose?.();vegetation.group.removeFromParent();water.mesh.removeFromParent();terrain.mesh.removeFromParent();const release=()=>{vegetation.dispose();water.dispose();terrain.lod.geometry.dispose();terrain.lod.params.buffer?.destroy();terrain.material.dispose();terrain.material.uniformBlock.buffer?.destroy();gpu.dispose();bark?.dispose();};if(GPU.encoder)GPU.onSubmit(null,release);else release();},
 };
}
