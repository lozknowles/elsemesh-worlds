import {createViewUniforms,setFrameCamera} from '../engine/render/Frame.js';
import {canonicalWaterSurfaceExclusions} from '../ocean/WaterSurfaceExclusions.js';
import {RefractionPass} from '../ocean/RefractionPass.js';
import {GPU} from '../engine/gpu/GPU.js';
import {Mesh,Vector2} from '../engine/index.js';
import {CDLOD} from '../core/CDLOD.js';
import {LAYERS} from '../core/SceneRenderer.js';
import {OceanFFT} from '../ocean/OceanFFT.js';
import {WaterSurface} from '../ocean/WaterSurface.js';
import {WaterMaterial} from '../ocean/WaterMaterial.js';
import {WaterQuery} from '../ocean/WaterQuery.js';
import {ShoreWaves} from '../ocean/ShoreWaves.js';
import {ShoreSim} from '../ocean/ShoreSim.js';
import {SeaDetail} from '../ocean/SeaDetail.js';
import {SurfFoam} from '../ocean/SurfFoam.js';
import {createFoamTexture} from '../ocean/FoamTexture.js';
// Context belongs to the current renderer/view; the adapter never disposes its render targets.
export function buildNativeIslandWater({root,terrainGPU,terrain,params,context}){
 if(!context?.sky||!context?.sceneCopy?.texture||!context?.sceneCopy?.depthTexture)throw Error('Native island sea requires its renderer water context.');
 const surfaceExclusions=canonicalWaterSurfaceExclusions(params.surfaceExclusions??[]);
 const fft=new OceanFFT(context.renderer,params.fft),foam=createFoamTexture(context.renderer),lod=new CDLOD({gridSize:32,leafSize:8,levels:12,minY:-25,maxY:25});
 for(const key of ['choppiness','foamBias','foamGain','foamDecay','foamAdd'])if(Number.isFinite(params.fft?.[key]))fft[key].value=params.fft[key];
 if(Number.isFinite(params.fft?.seed))fft.uSeed.value=params.fft.seed;if(Number.isFinite(params.fft?.timeScale))fft.timeScale=params.fft.timeScale;
 const surface=new WaterSurface({fft,cdlod:lod,foamTexture:foam});surface.terrain=terrainGPU;for(const [key,value] of Object.entries(params.surface??{})){if(surface[key]&&typeof value==='number')surface[key].value=value;else if(key==='foamWeights')surface.foamWeights=value.slice();}
 const detail=surface.detail=new SeaDetail(),shore=surface.shore=new ShoreWaves(terrainGPU);
 for(const [key,value] of Object.entries(params.shore??{}))if(shore[key]&&typeof value==='number')shore[key].value=value;
 const simParams=params.sim;const sim=surface.shoreSim=new ShoreSim(context.renderer,{terrainGPU,shore,center:new Vector2(...simParams.center),size:simParams.size,res:simParams.res});
 for(const [key,value] of Object.entries(simParams))if(sim.uniforms.fields[key]&&typeof value==='number')sim.uniforms.fields[key].value=value;
 const surfFoam=new SurfFoam({shoreSim:sim});surface.foamShading=surfFoam;
 terrain.wetness={modules:[sim.module],code:`fn terrainWetness(xz:vec2f,h:f32)->vec2f{let s=shoreSimSample(xz);let inside=shoreSimInside(shoreSimUvOf(xz));return vec2f(max(s.y,smoothstep(0.45,0.0,h)*(1.0-inside)),shoreSimSandFoam(xz,s,h));}`};terrain.finalizeMaterial();
 const material=new WaterMaterial({surface,...context,surfaceExclusions});material.clouds=context.clouds??null;
 const mesh=new Mesh(lod.geometry,material);mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.staticVelocity=true;mesh.layers.set(LAYERS.WATER);root.add(mesh);
 const query=new WaterQuery(context.renderer,surface);query.setTime=()=>{};
 const seaLevel=Number.isFinite(params.level)?params.level:0;
 const simulationBlock=createViewUniforms('native-island-simulation'),packSimulation=simulationBlock.onBeforePack;
 simulationBlock.onBeforePack=()=>{packSimulation();simulationBlock.fields.seaLevel.value=seaLevel;};
 // These kernels read world-specific sea level. The FFT/surface remain shared across views.
 for(const owner of [fft,sim])for(const value of Object.values(owner))for(const kernel of Array.isArray(value)?value:[value])if(kernel?.constructor?.name==='ComputeKernel')kernel.frameBlock=simulationBlock;
 query._build();query.kernel.frameBlock=simulationBlock;
 material.cameraWaterHeightNode=query.cameraState().x;

 let disposed=false,primed=false,lastSimulationFrame=-1;const views=new Set();
 // Only owned direct resources, never recursively walk shared terrain/detail modules.
 const destroyOwned=object=>{for(const value of Object.values(object)){if(value===sim.lace)continue;if(value?.isTexture||value?.constructor?.name==='Texture'||value?.constructor?.name==='StorageBuffer')value.destroy?.();else if(value?.constructor?.name==='UniformBlock')value.buffer?.destroy();}};
 return{material,query,surface,fft,mesh,seaLevel,surfaceExclusionsEnforced:true,surfaceExclusions,getSurfaceExclusions:()=>surfaceExclusions,createView(renderer){const refraction=new RefractionPass({meshRenderer:renderer.meshRenderer,scene:renderer.scene,camera:renderer.camera,sceneRenderer:renderer,scale:.5});renderer.onBeforeWater=options=>refraction.render(seaLevel,options);const viewMaterial=new WaterMaterial({surface,surfaceExclusions,refraction,sky:context.sky,sceneCopy:renderer.opaqueCopy,sceneDepthHalf:renderer.opaqueDepthHalf.texture,hullMask:renderer.hullMaskRT.texture,hullMaskActive:renderer.hullMaskActive});viewMaterial.clouds=null;viewMaterial.cameraWaterHeightNode=query.cameraState().x;const view={material:viewMaterial,refraction,dispose(){if(!views.delete(view))return;renderer.onBeforeWater=null;refraction.dispose();viewMaterial.dispose();viewMaterial.uniformBlock.buffer?.destroy();}};views.add(view);renderer.waterMaterial=viewMaterial;return view;},bindView(camera,view){setFrameCamera(camera,1,1,{block:simulationBlock});mesh.material=view?.material??material;if(!primed){fft.update(0);sim.update();primed=true;}lod.update(camera);},update(dt,camera){if(lastSimulationFrame===GPU.frame)return;lastSimulationFrame=GPU.frame;setFrameCamera(camera,1,1,{block:simulationBlock});primed=true;fft.update(dt);detail.update(dt);sim.update();query.setPoint(0,camera.position.x,camera.position.z);query.update();},dispose(){if(disposed)return;disposed=true;for(const view of [...views])view.dispose();mesh.removeFromParent();lod.geometry.dispose();material.dispose();material.uniformBlock.buffer?.destroy();lod.params.buffer?.destroy();foam.destroy();simulationBlock.buffer?.destroy();for(const owned of [fft,detail,shore,sim,surfFoam,query])destroyOwned(owned);query.readback.onData=null;for(const slot of query.readback.ring)slot.buffer?.destroy();}};
}
