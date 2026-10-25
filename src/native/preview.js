import {buildMediaScreenGeometry,disposeMediaScreenGeometry} from '../domain/media-screen.ts';
import {NativeIslandParentReader,buildNativeIslandPreview} from './NativeIslandPreview.js';
import {buildNativeLandscape} from './NativeLandscape.js';
import * as T from 'three';
import { resolveWorldMatrices, effectiveObjectState } from '../domain/object-hierarchy.ts';
import * as N from '../vendor/elsemesh/engine/index.js';
import { Engine } from '../vendor/elsemesh/engine/Engine.js';
import { GPU } from '../vendor/elsemesh/engine/gpu/GPU.js';
import { G } from '../vendor/elsemesh/engine/render/Frame.js';
import {RefractionPass} from '../vendor/elsemesh/ocean/RefractionPass.js';
import { SceneRenderer } from '../vendor/elsemesh/engine/render/SceneRenderer.js';
import { Material } from '../vendor/elsemesh/engine/render/Material.js';
import { SunShadows } from '../vendor/elsemesh/engine/render/Shadows.js';
import { Atmosphere, SUN_ILLUMINANCE } from '../vendor/elsemesh/sky/Atmosphere.js';
import { Sky, sunDirectionFromTime } from '../vendor/elsemesh/sky/Sky.js';
import { SkyProClouds } from '../vendor/elsemesh/sky/SkyProClouds.js';
import { Environment } from '../vendor/elsemesh/sky/Environment.js';
import { PostFX } from '../vendor/elsemesh/post/PostFX.js';
import { createDryWorldMedium, terrainMistBase } from './DriftingMist.js';
import { NativeWeather } from './NativeWeather.js';
import { buildComputerGeometry, disposeComputerGeometry } from '../domain/computer.ts';
import { buildNativeNeon } from './NativeNeon.js';
import { buildNativeFeatures } from './NativeFeatures.js';
import { buildNativeForest } from './NativeForest.js';
import { buildNativeAsset } from './NativeAssets.js';
import {createNativeAmbientInstances} from './NativeAmbientInstances.js';
import {createNativeAmbientObjects} from './NativeAmbientObjects.js';
import { inspectAndLoadAsset, disposeAssetScene } from '../ui/asset-admission.ts';
import { createNativeTerrainMaterial } from './NativeTerrain.js';
import { NativeNavigation } from './NativeNavigation.js';

const status = document.querySelector('#status');
let project, engine, atmosphere, sky, clouds, environment, post, sr, refraction, medium, world, shadows, weather, forest;
let nativeCandidate=null,pendingNativeReader=null;
let revision = 0, navigation, nextNavigationReport = 0;
let neonRuntime={},serverOffsetMs=0;
let assetDiagnostics=[];
let ambientObjects=null;
let nativeAmbient=null;
let terrainDiagnostics={imagery:false};
const report = (value) => { status.textContent = value; };
const send = (type, extra = {}) => parent.postMessage({ type, ...extra }, location.origin);
const nativeGeometry = (geometry) => {
  const result = new N.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const data = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) data[i*attribute.itemSize+c] = attribute.getComponent(i,c);
    result.setAttribute(name, new N.BufferAttribute(data,attribute.itemSize));
  }
  if (geometry.index) result.setIndex(Array.from(geometry.index.array));
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  return result;
};
const mesh = (geo, color, vertexColors=false) => new N.Mesh(nativeGeometry(geo), new Material({ color, roughness: 0.85, vertexColors, side: 'double' }));
function addPart(group, geo, color, position=[0,0,0], rotation=[0,0,0]) {
  const item=mesh(geo,color); item.position.fromArray(position); item.rotation.set(...rotation); group.add(item);
}
function disposeWorld(group) {
  const materials=new Set(),geometries=new Set();
  group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material) materials.add(node.material);node.userData.disposeAssetTextures?.();node.userData.disposeTerrainImagery?.();node.userData.disposeLandscape?.();});
  geometries.forEach(geometry=>geometry.dispose());
  materials.forEach(material=>{if(!material.userData.sharedBuilderTreeMaterial)material.dispose();});
}
async function rebuild(value) {
  const token=++revision;
  pendingNativeReader?.dispose();pendingNativeReader=null;
  if(value.nativeIsland){
    const reader=new NativeIslandParentReader(value);pendingNativeReader=reader;
    const candidate=await buildNativeIslandPreview(value,engine.camera,{renderer:engine.meshRenderer,sky,sceneCopy:sr.opaqueCopy,sceneDepthHalf:sr.opaqueDepthHalf.texture,clouds,refraction},reader);
    if(token!==revision){candidate.dispose();return;}
    pendingNativeReader=null;
    if(world){engine.scene.remove(world);if(nativeCandidate)nativeCandidate.dispose();else disposeWorld(world);}
    nativeCandidate=candidate;world=candidate.root;forest=null;ambientObjects=null;nativeAmbient=createNativeAmbientInstances(value,world,candidate.matrices,candidate.terrain);engine.scene.add(world);assetDiagnostics=candidate.assets??[];
    terrainDiagnostics={nativeIsland:true,navigation:'editable coarse proxy only; visual native fields stream independently'};medium.uniforms.fields.base.value=terrainMistBase(value.terrain);post.taau?.resetHistory();
    send('elsemesh-native-quality',{nativeIsland:candidate.nativeIsland.stats(),renderPixels:engine.width*engine.height});
    report('ElseMesh native captured island · original terrain, vegetation and ocean renderer · navigation uses editable coarse proxy');
    return;
  }
  const group = new N.Group();
  const nextAmbient=createNativeAmbientObjects(value);
  const { width,depth,resolution,heights,materials }=value.terrain;
  const positions=[], colors=[], indices=[];
  const palette=[[.38,.49,.32],[.54,.39,.27],[.48,.5,.48],[.7,.63,.43]];
  for(let z=0;z<resolution;z++) for(let x=0;x<resolution;x++) {
    const i=z*resolution+x, h=heights[i], tint=Math.max(.68,Math.min(1.22,.88+h/55));
    positions.push(x*width/(resolution-1)-width/2,h,z*depth/(resolution-1)-depth/2);
    colors.push(...palette[materials[i]].map(v=>v*tint));
    if(x<resolution-1 && z<resolution-1) indices.push(i,i+resolution,i+1,i+1,i+resolution,i+resolution+1);
  }
  const terrain=new T.BufferGeometry();
  terrain.setAttribute('position',new T.Float32BufferAttribute(positions,3)); terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3)); terrain.setIndex(indices); terrain.computeVertexNormals();
  const surface=await createNativeTerrainMaterial(value);
  const terrainMesh=new N.Mesh(nativeGeometry(terrain),surface.material);terrain.dispose();
  terrainMesh.userData.disposeTerrainImagery=surface.dispose;
  group.add(terrainMesh);
  let warnings=0;
  const nextAssetDiagnostics=[];
  const objectMatrices=resolveWorldMatrices(value.objects);
  for(const object of value.objects.filter(o=>effectiveObjectState(value.objects,o.id).visible)) {
    if(object.kind==='tree'||object.kind==='group'||object.collisionOnly)continue;
    const item=new N.Group(); item.userData.editorObjectId=object.id; item.matrixAutoUpdate=false; item.matrix.fromArray(objectMatrices.get(object.id).elements);
    const c=object.color;
    if(object.kind==='media-screen') {
      const television=buildMediaScreenGeometry(object.mediaScreen);try{for(const part of television.parts)item.add(new N.Mesh(nativeGeometry(part.geometry),new Material({color:part.color,roughness:.45,metalness:.25})));}finally{disposeMediaScreenGeometry(television);}
    } else if(object.kind==='computer') {
      const computer=buildComputerGeometry();item.userData.computerParts=[];
      for(const part of computer.parts){const color=part.emissive?object.computer.screenColor:part.color;const material=new Material({name:'computer-'+part.name,color,emissive:part.emissive?color:'#000000',roughness:.45,side:'double'});if(part.emissive)material.emissive.multiplyScalar(.15);item.add(new N.Mesh(nativeGeometry(part.geometry),material));item.userData.computerParts.push({name:part.name,vertices:part.geometry.getAttribute('position').count,emissive:material.emissive.toArray()});}
      disposeComputerGeometry(computer);
    } else if(object.kind==='neon-sign') {
      const neon=buildNativeNeon(object.neon,nativeGeometry);neon.userData.neonObjectId=object.id;item.add(neon);
    } else if(object.kind==='glb') {
      try {
        const asset=value.assets.find(a=>a.id===object.assetId);
        if(!asset) throw new Error('Referenced GLB asset is missing.');
        const response=await fetch(asset.dataUrl);
        if(!response.ok) throw new Error(`GLB could not be read (${response.status}).`);
        const loaded=await inspectAndLoadAsset(await response.arrayBuffer());
        try {
          const converted=buildNativeAsset(loaded,object,nativeGeometry);item.add(converted.group);
          nextAssetDiagnostics.push({objectId:object.id,assetId:asset.id,...converted.diagnostics});
          warnings+=converted.diagnostics.warnings.length;
        } finally {disposeAssetScene(loaded.scene);}
      } catch(error) {
        addPart(item,new T.BoxGeometry(1.6,1.6,1.6),'#cf6858');warnings++;
        nextAssetDiagnostics.push({objectId:object.id,assetId:object.assetId,error:error.message,primitives:[],warnings:[error.message]});
      }
    } else if(object.kind==='building') {
      addPart(item,new T.BoxGeometry(3.6,2.2,3),c,[0,1.1,0]); addPart(item,new T.ConeGeometry(2.7,1.1,4),'#574e42',[0,2.55,0],[0,Math.PI/4,0]);
    } else {
      const geo=object.kind==='sphere'?new T.SphereGeometry(.8,32,24):object.kind==='cylinder'?new T.CylinderGeometry(.65,.65,1.6,32):object.kind==='cone'?new T.ConeGeometry(.8,1.6,32):new T.BoxGeometry(1.6,1.6,1.6);
      addPart(item,geo,c);
    }
    group.add(item);
    if(object.ambientBehaviour)nextAmbient.add(item,object,objectMatrices.get(object.id));
  }
  const nextForest=buildNativeForest(value.objects,engine.camera.position);group.add(nextForest);
  group.add(buildNativeFeatures(value,nativeGeometry));
  let landscape;try{landscape=await buildNativeLandscape(value,nativeGeometry);}catch(error){disposeWorld(group);throw error;}group.add(landscape);group.userData.landscapeStats=landscape.userData.landscapeStats;
  if(token!==revision) { disposeWorld(group); return; }
  if(world) { engine.scene.remove(world);if(nativeCandidate){nativeCandidate.dispose();nativeCandidate=null;}else disposeWorld(world); }
  world=group;forest=nextForest;ambientObjects=nextAmbient;nativeAmbient=null;engine.scene.add(world);
  send('elsemesh-native-quality',{trees:forest.userData.treePreviewStats(),renderPixels:engine.width*engine.height});
  assetDiagnostics=nextAssetDiagnostics;
  terrainDiagnostics=surface.diagnostics;
  medium.uniforms.fields.base.value=terrainMistBase(value.terrain);
  report(`ElseMesh WebGPU · drag to look · wheel zoom · WASD fly where you look · Q/E down/up · Shift boost${warnings?` · ${warnings} GLB shading limitation(s); see preview notes`:''}${surface.diagnostics.error?` · Imagery fallback: ${surface.diagnostics.error}`:''}`);
}
function setEnvironment() {
  const env=project.environment;
  clouds.coverage.value=env.cloudCoverage??.49;
  G.windSpeed.value=env.windSpeed??6;
  medium.uniforms.fields.storm.value=env.weather==='storm'?1:0;
  medium.uniforms.fields.density.value=env.mistDensity ?? .004;
  medium.uniforms.fields.speed.value=env.mistSpeed ?? 2;
  medium.uniforms.fields.height.value=env.mistHeight ?? 9;
  const dir=sunDirectionFromTime(env.timeOfDay ?? 14).applyAxisAngle(new N.Vector3(0,1,0),env.sunAzimuth);
  atmosphere.sunDir.value.copy(dir);
  const night=N.MathUtils.smoothstep(-dir.y,.02,.18); G.night.value=night; sky.starIntensity.value=night;
  const moon=new N.Vector3(-dir.x,Math.abs(dir.y)*.8+.25,-dir.z).normalize(); sky.moonDir.value.copy(moon); G.sunDir.value.copy(dir.y>-.07?dir:moon);
}
async function init() {
  engine=new Engine(document.querySelector('#native-root')); engine.maxOutputPixels=1000000; await engine.init();
  if(GPU.limits.maxStorageTexturesPerShaderStage<5)throw new Error(`Native sky preview requires 5 storage textures per shader stage; this adapter supports ${GPU.limits.maxStorageTexturesPerShaderStage}. Use the editor WebGL preview on this device.`);
  engine.meshRenderer.syncPipelines=true;
  atmosphere=new Atmosphere(engine); sky=new Sky(atmosphere); clouds=new SkyProClouds(engine,atmosphere); await clouds.ready; sky.clouds=clouds;
  environment=new Environment(engine,engine.scene,sky,128);
  shadows=new SunShadows({size:1024});
  weather=new NativeWeather();engine.scene.add(weather.group);
  sr=new SceneRenderer(engine.meshRenderer,engine.scene,engine.camera); sr.background=sky.background; sr.waterMaterial={needsSSRDepth:false};
  refraction=new RefractionPass({meshRenderer:engine.meshRenderer,scene:engine.scene,camera:engine.camera,sceneRenderer:sr,scale:.5});sr.onBeforeWater=view=>{if(nativeCandidate)refraction.render(G.seaLevel.value,view);};
  medium=createDryWorldMedium(sr.sceneRT.depthTexture);
  post=new PostFX(engine,{sceneRenderer:sr,camera:engine.camera,underwater:medium,clouds});
  if (post.motionBlur.strength) post.motionBlur.strength.value=0;
  navigation = new NativeNavigation(engine.camera); navigation.attach(engine.canvas);
  engine.start((dt,time)=>{
    if(!project) return;
    try {
      GPU.beginFrame(); G.seaLevel.value=nativeCandidate?.nativeIsland.water.seaLevel??project.water?.level??0; G.time.value=time; G.dt.value=dt; G.exposure.value=0.55; // pristine App.js default
      const navigationState = navigation.update(dt);
      if (time >= nextNavigationReport) { send('elsemesh-native-navigation-state', { navigation: navigationState }); nextNavigationReport = time + 0.25; }
      nativeCandidate?.nativeIsland.update(dt,engine.camera);nativeCandidate?.query.setTime(time);
      world?.traverse(node=>node.userData.updateLandscape?.(time));
      nativeAmbient?.update(time);
      ambientObjects?.update(time);

      const previousTreeStats=forest?.userData.treePreviewStats();
      forest?.userData.updateTreeLOD(time,engine.camera.position);
      if(forest && forest.userData.treePreviewStats()!==previousTreeStats)send('elsemesh-native-quality',{trees:forest.userData.treePreviewStats(),renderPixels:engine.width*engine.height});
      const weatherState=weather.update(time,engine.camera,navigation.yaw,project.environment,event=>send('elsemesh-native-thunder',{event}));
      medium.uniforms.fields.lightning.value=weatherState.flash;
      world?.traverse(node=>{if(!node.userData.updateNeon)return;const state=neonRuntime[node.userData.neonObjectId];const elapsed=Number.isFinite(state?.effectStartMs)?Math.max(0,(Date.now()+serverOffsetMs-state.effectStartMs)/1000):time;node.userData.updateNeon(elapsed,project.environment.timeOfDay??14,state?.powered);});
      setEnvironment(); atmosphere.update(dt,engine.camera.position.y);
      if(atmosphere.sunTransmittance) {
        const d=atmosphere.sunDir.value, t=atmosphere.sunTransmittance;
        if(d.y>-.07) G.sunColor.value.setRGB(...t).multiplyScalar(SUN_ILLUMINANCE*N.MathUtils.smoothstep(d.y,-.03,.02));
        else G.sunColor.value.setRGB(.6,.7,1).multiplyScalar(.12*G.night.value);
        const a=atmosphere.skyIrradiance,k=.012*G.night.value; G.skyIrradiance.value.setRGB(a[0]+k*.6,a[1]+k*.7,a[2]+k); G.horizonColor.value.setRGB(...atmosphere.horizon);
      }
      clouds.update(dt,engine.camera); environment.update(dt); post.beginFrame();
      shadows.render(engine.scene,engine.meshRenderer,shadows.update(engine.camera,G.sunDir.value));
      nativeCandidate?.nativeIsland.bindView(engine.camera);sr.waterMaterial=nativeCandidate?.nativeIsland.waterMaterial??{needsSSRDepth:false};
      sr.render(); post.render(); post.endFrame(); GPU.submit();
      const computers=[];world?.traverse(node=>{if(node.userData.computerParts)computers.push({id:node.userData.editorObjectId,parts:node.userData.computerParts});});
      const neons=[];world?.traverse(node=>{if(node.userData.neonState)neons.push(node.userData.neonState);});
      const hierarchyMatrices={};world?.traverse(node=>{if(node.userData.editorObjectId)hierarchyMatrices[node.userData.editorObjectId]=Array.from(node.matrixWorld.elements);});
      window.__nativePreview={computers,neons,hierarchyMatrices,frames:engine.frame,time,objects:project.objects.length,features:project.features?.length??0,settings:project.environment,effectUniforms:{cloudCoverage:clouds.coverage.value,mistBase:medium.uniforms.fields.base.value,mistDensity:medium.uniforms.fields.density.value,mistHeight:medium.uniforms.fields.height.value,mistSpeed:medium.uniforms.fields.speed.value},weather:weatherState,assets:assetDiagnostics,terrain:terrainDiagnostics,nativeIsland:nativeCandidate?{backend:'webgpu',backendQualification:'native-render-path-awaiting-browser-qualification',...nativeCandidate.nativeIsland.stats()}:null,landscape:world?.userData.landscapeStats,camera:engine.camera.position.toArray(),navigation:navigationState,trees:forest?.userData.treePreviewStats(),ambient:ambientObjects?.poses()??[],nativeAmbient:nativeAmbient?.objectCount??0,renderPixels:engine.width*engine.height};
      if(engine.frame===2) send('elsemesh-native-rendered');
    } catch(error) { engine.stop(); report(`Native preview failed: ${error.message}`); console.error(error); send('elsemesh-native-error',{message:error.message}); }
  });
  send('elsemesh-native-ready');
}
window.addEventListener('message',e=>{
  if(e.origin!==location.origin || e.source!==parent) return;
  if(e.data?.type==='elsemesh-native-neon-runtime') { neonRuntime=e.data.states??{};serverOffsetMs=Number.isFinite(e.data.serverOffsetMs)?e.data.serverOffsetMs:0;return; }
  if(e.data?.type==='elsemesh-native-navigation') { navigation?.command(e.data); if(['overview','spawn','recenter'].includes(e.data.action)) engine?.canvas.focus(); return; }
  if(e.data?.type!=='elsemesh-native-project') return;
  const next=e.data.project;
  const changed=!project || JSON.stringify([project.terrain,project.objects,project.assets,project.features,project.geography,project.terrainImagery,project.landscape,project.nativeIsland,project.water])!==JSON.stringify([next.terrain,next.objects,next.assets,next.features,next.geography,next.terrainImagery,next.landscape,next.nativeIsland,next.water]);
  navigation?.setProject(next);
  project=next; if(changed){const expectedRevision=revision+1;void rebuild(project).catch(error=>{if(expectedRevision!==revision)return;report('Scene import failed: '+error.message);send('elsemesh-native-error',{message:error.message});});}
});
window.addEventListener('pagehide',()=>{pendingNativeReader?.dispose();nativeCandidate?.dispose();navigation?.dispose();refraction?.dispose();engine?.stop();GPU.device?.destroy();});
init().catch(error=>{report(error.message);send('elsemesh-native-error',{message:error.message});console.error(error);});
