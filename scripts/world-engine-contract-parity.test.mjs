import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=process.env.WORLD_ENGINE_ROOT??'/fast/work/elsemesh-world-runtime-20261023';
const output=join(root,'.local-evidence/contract-parity');
await mkdir(output,{recursive:true});
await build({absWorkingDir:root,entryPoints:['src/runtime/world-engine-contract.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:join(output,'editor.mjs')});
const editor=await import(pathToFileURL(join(output,'editor.mjs')));
const runtime=await import(pathToFileURL(join(engine,'src/world-runtime/vendor/world-engine-contract.js')));
const read=base=>async(path,limit)=>{const b=await readFile(join(base,path));assert.ok(b.length<=limit);return b;};
const comparable=(api,loaded)=>{const d=api.describeRuntimeWorld(loaded.project);return{project:d.project,worldId:d.worldId,regionId:d.regionId,spawn:d.spawn,boxes:d.boxes,interactions:d.interactions,heights:[[-12,-4],[0,0],[15,7]].map(([x,z])=>d.terrain.heightAt(x,z)),digest:loaded.identity.contentDigest,capabilities:api.requiredWorldCapabilities(loaded.project),manifest:loaded.manifest};};
const encode=v=>new TextEncoder().encode(JSON.stringify(v,null,2)+'\n');
const readMap=files=>async(path,limit)=>{const b=files.get(path);if(!b)throw new Error('Missing file');assert.ok(b.length<=limit);return b;};
test('editor and actual engine load exact independent house and landscape content',async()=>{
 const evidence=[];
 for(const name of ['house','landscape']){
  const source={kind:'local',label:name,read:read('/fast/world-repositories/'+name)};
  const a=await editor.loadWorldSource(source),b=await runtime.loadWorldSource(source);
  assert.deepEqual(comparable(editor,a),comparable(runtime,b));
  evidence.push({name,worldId:a.identity.worldId,digest:a.identity.contentDigest,capabilities:editor.requiredWorldCapabilities(a.project),objects:a.project.objects.length});
 }
 assert.notEqual(evidence[0].worldId,evidence[1].worldId);
 await writeFile(join(output,'content-parity.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
});
test('both installations preserve v1 migration and reject corrupted or unsupported content',async()=>{
 const project=editor.createWorld('Contract migration fixture');
 const files=await editor.packWorldRepository(project);
 const original=JSON.parse(new TextDecoder().decode(files.get('world.json')));
 const old=structuredClone(original);old.schema='elsemesh.world-repository/1';old.version=1;old.engine={commit:'a'.repeat(40),compatibility:'reference-only-runtime-unverified'};delete old.world;delete old.regions;delete old.attribution;
 const legacy=new Map(files);legacy.set('world.json',encode(old));
 for(const api of [editor,runtime]){
  const loaded=await api.loadWorldSource({kind:'local',read:readMap(legacy)});
  assert.deepEqual(loaded.project,project);
  const repacked=await api.packWorldRepository(loaded.project);
  assert.equal(JSON.parse(new TextDecoder().decode(repacked.get('world.json'))).version,2);
  assert.deepEqual(legacy.get('world.json'),encode(old));
  const bad=new Map(files),manifest=structuredClone(original);manifest.engine.requires.push('arbitrary-scripting');bad.set('world.json',encode(manifest));
  await assert.rejects(api.loadWorldSource({kind:'local',read:readMap(bad)}),/capability/i);
  const corrupt=new Map(files);const component=original.components.objects.path;corrupt.set(component,new TextEncoder().encode('[]'));
  await assert.rejects(api.loadWorldSource({kind:'local',read:readMap(corrupt)}),/digest|size|integrity|hash|byte/i);
  await assert.rejects(api.loadWorldSource({kind:'github',owner:'example',repository:'world',path:'',commit:'main'}),/pinned|commit/i);
 }
});
