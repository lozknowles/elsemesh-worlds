import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {run} from './world-repository-git.mjs';
const {createWorld,createTerrain}=await import('../src/domain/world.ts');
const {packWorldRepository,inspectWorldRepository}=await import('../src/domain/world-repository.ts');
async function write(dir,files){for(const[p,b]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),b);}}
test('v3 connection checkpoints and clone retain mixed v2/v3 snapshots and exact identities',async()=>{
 const evidence=await fs.mkdtemp('/fast/world-repositories/portal-v3-'),repo=path.join(evidence,'world'),clone=path.join(evidence,'clone');
 await fs.mkdir(repo);
 const w=createWorld('Portal Git fixture');w.terrain=createTerrain(32,32,9);
 await write(repo,await packWorldRepository(w));
 await run('init',repo);const first=await run('checkpoint',repo,['none','Base v2 snapshot']);
 w.water={level:0,waveAmplitude:.4,waveSpeed:1,extent:128};
 w.portals=[{id:'elsemesh-portal:entry',name:'Entry',position:[0,1.25,0],yaw:0,width:2,height:2.5,destination:{worldId:'elsemesh.world:destination',regionId:'elsemesh.region:main',portalId:'elsemesh-portal:arrival'},enabled:true,view:{enabled:true,maxDistance:40},traversal:{enabled:true},policyRef:'portal-policy:public',visual:{frameColor:'#55aaff',unavailableColor:'#553333'}}];
 await write(repo,await packWorldRepository(w));
 const second=await run('checkpoint',repo,[first.head,'Author portal and sea v3']);
 assert.notEqual(second.head,first.head);
 assert.equal((await run('status',repo)).dirty,false);
 const copied=await run('clone',repo,[second.head,clone]);
 assert.equal(copied.commit,second.head);
 assert.equal((await run('status',clone)).contentDigest,(await run('status',repo)).contentDigest);
 const loaded=await inspectWorldRepository(async p=>fs.readFile(path.join(clone,p)));
 assert.deepEqual(loaded.project,w);assert.equal(loaded.manifest.version,3);
 // A future v2 tip can still retain v3 history, and the snapshot validator must use each snapshot's own role set.
 delete w.portals;delete w.water;w.metadata.description='Back to a basic scene while preserving history';
 await write(repo,await packWorldRepository(w));
 const third=await run('checkpoint',repo,[second.head,'Basic v2 tip retains connection history']);
 await run('clone',repo,[third.head,path.join(evidence,'v2-tip-clone')]);
 // A hostile orphan JSON component is still rejected before checkpoint.
 const extra='snapshots/'+loaded.manifest.snapshot+'/untrusted.json';
 await fs.writeFile(path.join(repo,extra),'{}');
 await assert.rejects(run('checkpoint',repo,[third.head,'Forbidden orphan']),/Unexpected file/);
 console.log(JSON.stringify({evidenceDirectory:evidence,v2:first.head,v3:second.head,v2Tip:third.head}));
});
