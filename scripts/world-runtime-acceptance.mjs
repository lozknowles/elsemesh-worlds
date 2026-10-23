import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const reference = process.env.ELSEMESH_REFERENCE_ROOT;
if (!reference || process.argv.length !== 4) throw new Error('Set ELSEMESH_REFERENCE_ROOT to the read-only game reference and supply two world folders.');
const moduleAt = path => import(pathToFileURL(resolve(reference,path)).href);
const [{ Player }, { Colliders }, N, federation, identity, fixtures] = await Promise.all([
  moduleAt('src/player/Player.js'), moduleAt('src/world/Colliders.js'), moduleAt('src/engine/index.js'),
  moduleAt('network/federation.mjs'), moduleAt('network/identity.mjs'), moduleAt('network/federation-fixtures.mjs'),
]);
const vite = await createServer({ configFile:false, logLevel:'silent', server:{middlewareMode:true}, appType:'custom' });
try {
  const { loadWorldSource } = await vite.ssrLoadModule('/src/domain/world-source.ts');
  const { describeRuntimeWorld } = await vite.ssrLoadModule('/src/domain/runtime-world.ts');
  const { admitFederatedRuntimeWorld } = await vite.ssrLoadModule('/src/domain/runtime-admission.ts');
  const owner=identity.newIdentity(), other=identity.newIdentity();
  const regionFixtures=fixtures.sampleRegions(owner.nodeId,other.nodeId);
  const reports=[];
  for(const [index,folder] of process.argv.slice(2).entries()) {
    const root=await realpath(folder);
    const read=async(path,maxBytes)=>{
      const target=await realpath(resolve(root,path));
      if(!target.startsWith(root+sep))throw new Error('World path escaped repository');
      const bytes=await readFile(target);if(bytes.length>maxBytes)throw new Error('World byte budget exceeded');return new Uint8Array(bytes);
    };
    const loaded=await loadWorldSource({kind:'local',read,label:root});
    const runtime=describeRuntimeWorld(loaded.project), authoredBefore=JSON.stringify(loaded.project);
    const colliders=new Colliders();
    for(const box of runtime.boxes)colliders.addBox(new N.Vector3(...box.center),new N.Vector3(...box.half),0,{walkable:box.walkable,solid:box.solid,tag:box.id});
    const input={consumeLook:()=>({x:0,y:0}),moveAxes:()=>({x:0,y:1,sprint:0}),down:()=>false,hit:()=>false};
    const query={allocate:()=>0,setPoint:()=>{},cpuValid:true,cpu:new Float32Array([-1000,0,0,0])};
    const camera=new N.PerspectiveCamera();
    const player=new Player({camera,input,terrain:runtime.terrain,colliders,query,boat:null});
    player.position.set(...runtime.spawn.position);
    player.position.y=runtime.terrain.heightAt(player.position.x,player.position.z);
    player.yaw=runtime.spawn.yaw;player.velocity.set(0,0,0);
    const before=player.position.clone();
    for(let frame=0;frame<120;frame++)player.update(1/60);
    assert.ok(before.distanceTo(player.position)>.1,'actual game Player must move');
    assert.ok(Number.isFinite(camera.position.y));
    assert.equal(player.mode,'walk');
    assert.equal(player.grounded,true);
    assert.ok(Math.abs(player.position.y-player.groundAt(player.position.x,player.position.z,player.position.y+.45))<.001,'actual Player must contact runtime ground');
    const obstacle=runtime.boxes.find(box=>box.half[1]>1 && !box.walkable);
    assert.ok(obstacle,'fixture must contain a wall collider');
    const penetration=new N.Vector3(obstacle.center[0],obstacle.center[1]-obstacle.half[1],obstacle.center[2]);
    const penetratingBefore=penetration.clone();colliders.resolveCapsule(penetration,.3,1.75,.4);
    assert.ok(penetration.distanceTo(penetratingBefore)>.01,'actual collider must intercept authored wall');
    assert.equal(JSON.stringify(loaded.project),authoredBefore,'player movement must not change authored content');
    // Explicit runtime-owned binding preserves legacy federation identity namespaces.
    // A content repository supplies no keys, trusted-owner set or administrator role.
    const descriptor=structuredClone(index===0?regionFixtures.exterior:regionFixtures.edWorld);
    descriptor.ownerNodeId=owner.nodeId;descriptor.hosts=[owner.nodeId];descriptor.authority={nodeId:owner.nodeId,epoch:1};
    federation.validateRegion(descriptor);
    const published=federation.publishRegion(descriptor,owner);
    const admitted=federation.verifyRegionVersion(published,new Set([owner.nodeId]));
    const binding=identity.signObject({kind:'elsemesh.world-content-admission/1',authoredWorldId:runtime.worldId,authoredRegionId:runtime.regionId,contentDigest:loaded.identity.contentDigest,
      federationWorldId:admitted.worldId,federationRegionId:admitted.regionId,authorityNodeId:admitted.authority.nodeId,authorityEpoch:admitted.authority.epoch},owner);
    const verifiers={verifyRegion:proof=>federation.verifyRegionVersion(proof,new Set([owner.nodeId])),verifyBinding:proof=>identity.verifyObject(proof,new Set([owner.nodeId]))};
    const activated=admitFederatedRuntimeWorld(loaded.project,loaded.identity.contentDigest,binding,published,verifiers);
    assert.equal(activated.runtime.worldId,runtime.worldId);
    assert.throws(()=>admitFederatedRuntimeWorld(loaded.project,'0'.repeat(64),binding,published,verifiers));
    assert.throws(()=>admitFederatedRuntimeWorld(loaded.project,loaded.identity.contentDigest,{...binding,authorityEpoch:2},published,verifiers));
    assert.throws(()=>federation.verifyRegionVersion(published,new Set([other.nodeId])));
    assert.equal(binding.authoredWorldId,loaded.project.metadata.worldId);
    reports.push({worldId:runtime.worldId,contentDigest:loaded.identity.contentDigest,positionBefore:before.toArray(),positionAfter:player.position.toArray(),
      groundContact:true,wallInterception:true,signedContentAdmission:true,collisionBoxes:runtime.boxes.length,interactions:runtime.interactions,federationBinding:binding,unauthorisedOwnerRejected:true,authoredUnchanged:true});
  }
  assert.notEqual(reports[0].worldId,reports[1].worldId,'sample repositories must be independently identified');
  console.log(JSON.stringify({actualPlayer:true,rendering:false,source:'read-only reference',worlds:reports},null,2));
} finally { await vite.close(); }
