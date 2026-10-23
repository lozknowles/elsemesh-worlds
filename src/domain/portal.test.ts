import { describe, expect, it } from 'vitest';
import { createTerrain, createWorld, validateWorld, type Vec3 } from './world';
import { mapPortalDirection, mapPortalPoint, mapPortalYaw, portalLocalPoint, portalWorldPoint, portalMappingElements, sweepPortalCapsule, validateWorldConnections, type WorldPortal } from './portal';
import { inspectWorldRepository, packWorldRepository, unpackWorldRepository } from './world-repository';
const portal = (id = 'a', yaw = 0, position: Vec3 = [0,1.25,0]): WorldPortal => ({
  id: 'elsemesh-portal:'+id, name: id, position, yaw, width: 2, height: 2.5,
  destination: {worldId:'elsemesh.world:remote',regionId:'elsemesh.region:remote',portalId:'elsemesh-portal:remote'},
  enabled:true,view:{enabled:true,maxDistance:40},traversal:{enabled:true},policyRef:'portal-policy:public',
  visual:{frameColor:'#55aaff',unavailableColor:'#553333'},
});
const close = (a: Vec3,b: Vec3) => a.forEach((n,i) => expect(n).toBeCloseTo(b[i]!,10));
const world = () => {const w=createWorld('Portal test');w.terrain=createTerrain(32,32,9);return w;};
const reader = (files: Map<string, Uint8Array>) => async (path:string,limit:number) => {const bytes=files.get(path);if(!bytes || bytes.byteLength>limit)throw new Error('Invalid read');return bytes;};
describe('upright portal coordinate mapping',()=>{
  it('maps the source back to the destination front using the same rotation for position, velocity and yaw',()=>{
    const a=portal('a',Math.PI/2,[12,1.25,7]),b=portal('b',-Math.PI/3,[-9,3.25,11]);
    const point=portalWorldPoint(a,[.3,.4,-.7]),mapped=mapPortalPoint(a,b,point);
    close(portalLocalPoint(b,mapped),[-.3,.4,.7]);
    const velocity=mapPortalDirection(a,b,[2,-1,-4]);
    expect(Math.hypot(...velocity)).toBeCloseTo(Math.sqrt(21),10);
    expect(velocity[1]).toBe(-1);
    const yaw=.8,forward:Vec3=[-Math.sin(yaw),0,-Math.cos(yaw)],out=mapPortalDirection(a,b,forward),outYaw=mapPortalYaw(a,b,yaw);
    close(out,[-Math.sin(outYaw),0,-Math.cos(outYaw)]);
    const moved=mapPortalPoint(a,b,[point[0]+2,point[1]-1,point[2]-4]);
    close([moved[0]-mapped[0],moved[1]-mapped[1],moved[2]-mapped[2]],velocity);
  });
  it('exports the same column-major homogeneous mapping used by both runtimes',()=>{
    const a=portal('a',.7,[1,2,3]),b=portal('b',-1.1,[9,4,-7]),v:Vec3=[3,5,-8],e=portalMappingElements(a,b);
    expect(e).toHaveLength(16);
    close([e[0]!*v[0]+e[4]!*v[1]+e[8]!*v[2]+e[12]!,e[1]!*v[0]+e[5]!*v[1]+e[9]!*v[2]+e[13]!,e[2]!*v[0]+e[6]!*v[1]+e[10]!*v[2]+e[14]!],mapPortalPoint(a,b,v));
  });
  it('round trips translated and rotated points, directions and yaw without scale',()=>{
    const a=portal('a',.73,[20,5,-11]),b=portal('b',-2.1,[-7,2,8]),v:Vec3=[3,2,-9];
    close(mapPortalPoint(b,a,mapPortalPoint(a,b,v)),v);
    close(mapPortalDirection(b,a,mapPortalDirection(a,b,v)),v);
    expect(mapPortalYaw(b,a,mapPortalYaw(a,b,.42))).toBeCloseTo(.42,10);
  });
  it('sweeps rotated feet through the full body aperture with horizontal radius',()=>{
    const p=portal('a',1.3,[10,1.25,8]);
    const sweep=(x:number,feetY=0)=>sweepPortalCapsule({portal:p,previousFeet:portalWorldPoint(p,[x,feetY-1.25,5]),nextFeet:portalWorldPoint(p,[x,feetY-1.25,-3])});
    const hit=sweep(.5);expect(hit?.fraction).toBeCloseTo(5/8);close(portalLocalPoint(p,hit!.feet),[.5,-1.25,0]);
    expect(sweep(.73)).toBeNull();
    expect(sweep(0,-.1)).toBeNull();
    expect(sweep(0,1)).toBeNull();
    expect(sweepPortalCapsule({portal:p,previousFeet:portalWorldPoint(p,[0,-1.25,-1]),nextFeet:portalWorldPoint(p,[0,-1.25,1])})).toBeNull();
    p.traversal.enabled=false;expect(sweep(0)).toBeNull();
  });
  it('rejects nonfinite movement and invalid capsule dimensions',()=>{
    const p=portal();expect(sweepPortalCapsule({portal:p,previousFeet:[0,0,1],nextFeet:[0,NaN,-1]})).toBeNull();
    expect(sweepPortalCapsule({portal:p,previousFeet:[0,0,1],nextFeet:[0,0,-1],radius:-1})).toBeNull();
  });
});
describe('authored connections validation',()=>{
  it('validates local portal references and rejects duplicate identities, credential fields and undersized apertures',()=>{
    const w=world(),a=portal(),b=portal('b');a.destination={worldId:w.metadata.worldId,regionId:w.metadata.regionId,portalId:b.id};w.portals=[a,b];
    expect(validateWorld(w).valid).toBe(true);
    b.id=a.id;expect(validateWorld(w).errors.join(' ')).toMatch(/duplicate|missing local/);
    b.id='elsemesh-portal:b';a.destination.portalId='elsemesh-portal:missing';expect(validateWorld(w).valid).toBe(false);
    a.destination.portalId=b.id;a.width=.3;expect(validateWorld(w).valid).toBe(false);
    a.width=.6;expect(validateWorld(w).valid).toBe(true);
    a.width=2;Object.assign(a,{endpoint:'https://example.com',token:'secret'});expect(validateWorld(w).valid).toBe(false);
  });
  it('bounds water and terminal references and rejects unsupported authored instructions',()=>{
    const w=world();w.water={level:0,waveAmplitude:.3,waveSpeed:1,extent:128};
    w.terminals=[{id:'retro:c64',objectId:'missing',kind:'c64',position:[0,1,0],interactionRadius:2}];
    expect(validateWorldConnections(w).join(' ')).toMatch(/missing object/);
    w.terminals=[];expect(validateWorld(w).valid).toBe(true);
    w.water.waveAmplitude=4;expect(validateWorld(w).valid).toBe(false);
  });
  it('never throws on malformed optional field shapes',()=>{
    for(const bad of [null,7,'x',{},[null],[{id:'x',destination:null}]]) {
      const w=world();Object.assign(w,{portals:bad,water:bad,terminals:bad});
      expect(()=>validateWorld(w)).not.toThrow();expect(validateWorld(w).valid).toBe(false);
    }
  });
});
describe('connections repository v3',()=>{
  it('round trips every optional authored field with stable content hashes and required capabilities',async()=>{
    const w=world();w.portals=[portal()];w.water={level:-.5,waveAmplitude:.3,waveSpeed:1,extent:128};
    w.objects=[{id:'c64',name:'C64',kind:'box',position:[0,1,0],rotation:[0,0,0],scale:[1,1,1],visible:true,color:'#aaaaaa',collision:'solid'}];
    w.terminals=[{id:'retro:c64',objectId:'c64',screenObjectIds:['c64'],kind:'c64',position:[0,1,0],interactionRadius:2}];
    const files=await packWorldRepository(w),before=structuredClone(files),loaded=await inspectWorldRepository(reader(files));
    expect(loaded.project).toEqual(w);expect(loaded.manifest.version).toBe(3);
    expect(loaded.manifest.schema).toBe('elsemesh.world-repository/3');
    expect(loaded.manifest.components.connections?.path).toMatch(/connections.json$/);
    expect(loaded.manifest.engine.requires).toEqual(expect.arrayContaining(['portal/1','water/1','retro-terminal/1']));
    expect(files).toEqual(before);expect(await packWorldRepository(w)).toEqual(files);
  });
  it('rejects omitted capabilities and schema downgrades of a connections snapshot',async()=>{
    const w=world();w.portals=[portal()];const files=await packWorldRepository(w),manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')));
    manifest.engine.requires=manifest.engine.requires.filter((v:string)=>v!=='portal/1');
    files.set('world.json',new TextEncoder().encode(JSON.stringify(manifest)));
    await expect(unpackWorldRepository(reader(files))).rejects.toThrow(/omits a capability/);
    manifest.schema='elsemesh.world-repository/2';manifest.version=2;
    files.set('world.json',new TextEncoder().encode(JSON.stringify(manifest)));
    await expect(unpackWorldRepository(reader(files))).rejects.toThrow(/invalid world repository manifest/);
  });
});
