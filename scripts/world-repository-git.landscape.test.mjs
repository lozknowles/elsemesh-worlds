import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from './world-repository-git.mjs';
const {createWorld,createTerrain}=await import('../src/domain/world.ts');
const {createLandscapeLayer,applyLandscapeArea,generateLandscapeInstances,promoteLandscapeInstance}=await import('../src/domain/landscape.ts');
const {packWorldRepository,inspectWorldRepository}=await import('../src/domain/world-repository.ts');
async function write(dir,files){for(const[p,b]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),b);}}
test('landscape v4 saves, reopens and independently clones with v2 ancestry and history intact',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'elsemesh-landscape-')),source=path.join(temp,'source'),clone=path.join(temp,'clone');await fs.mkdir(source);
 const legacy=createWorld('Landscape portability');legacy.terrain=createTerrain(32,32,9);legacy.terrain.heights.fill(0);legacy.objects=[];await write(source,await packWorldRepository(legacy));await run('init',source);const first=await run('checkpoint',source,['none','Legacy document']);
 let project=createLandscapeLayer(legacy,{id:'trees',kind:'vegetation'});project=applyLandscapeArea(project,{layerId:'trees',boundary:[[-12,0,-12],[12,0,-12],[12,0,12],[-12,0,12]],mode:'paint'});project=promoteLandscapeInstance(project,generateLandscapeInstances(project)[0].id);await write(source,await packWorldRepository(project));const second=await run('checkpoint',source,[first.head,'Landscape paint and promotion']);assert.notEqual(first.head,second.head);
 const isolated=path.join(temp,'independent');await fs.mkdir(isolated);const other=createWorld('Independent world');await write(isolated,await packWorldRepository(other));await run('init',isolated);const otherFirst=await run('checkpoint',isolated,['none','Independent world']);const otherBytes=await fs.readFile(path.join(isolated,'world.json')),sourceBytes=await fs.readFile(path.join(source,'world.json'));const digest=b=>createHash('sha256').update(b).digest('hex');
 const copied=await run('clone',source,[second.head,clone]);assert.equal(copied.commit,second.head);const loaded=await inspectWorldRepository(async p=>fs.readFile(path.join(clone,p)));assert.equal(loaded.manifest.version,4);assert.deepEqual(loaded.project,project);assert.deepEqual(generateLandscapeInstances(loaded.project),generateLandscapeInstances(project));assert.equal((await run('status',clone)).dirty,false);
 loaded.project.metadata.description='Only this independent clone changed';await write(clone,await packWorldRepository(loaded.project));await run('checkpoint',clone,[second.head,'Clone-only edit']);assert.equal(digest(await fs.readFile(path.join(source,'world.json'))),digest(sourceBytes));assert.equal(digest(await fs.readFile(path.join(isolated,'world.json'))),digest(otherBytes));assert.equal((await run('status',isolated)).head,otherFirst.head);assert.notEqual(other.metadata.worldId,project.metadata.worldId);
 const historical=path.join(temp,'legacy');await run('read',clone,[first.head,historical]);const old=await inspectWorldRepository(async p=>fs.readFile(path.join(historical,p)));assert.equal(old.manifest.version,2);assert.equal(old.project.landscape,undefined);assert.equal((await run('status',source)).head,second.head);
 console.log(JSON.stringify({evidence:'landscape-real-git-roundtrip',directory:temp,legacy:first.head,landscape:second.head,worldId:project.metadata.worldId,generated:generateLandscapeInstances(project).length,promoted:project.objects.length,independentWorldId:other.metadata.worldId,sourceManifestSha256:digest(sourceBytes),independentManifestSha256:digest(otherBytes)}));
});
