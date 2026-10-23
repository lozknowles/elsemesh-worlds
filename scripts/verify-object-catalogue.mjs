import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectGlbJson} from '../src/domain/asset-glb.ts';
const publicRoot=path.resolve('public');
const manifest=JSON.parse(await fs.readFile(path.join(publicRoot,'assets/catalogue/manifest.json'),'utf8'));
if(manifest.schema!=='elsemesh.object-catalogue/1'||manifest.source.commit!=='7be9b573bc74f32ed766b44b3f46550d02ca83b5')throw Error('Unknown catalogue provenance');
const ids=new Set();let triangles=0,bytes=0;
const read=async relative=>{if(typeof relative!=='string'||!/^assets\/catalogue\/7be9b573\/packs\/[a-z0-9-]+\/(?:thumbs\/)?[A-Za-z0-9_.-]+\.(?:glb|webp)$/.test(relative))throw Error('Unsafe asset path');const real=await fs.realpath(path.resolve(publicRoot,relative));if(!real.startsWith(publicRoot+path.sep))throw Error('Escaped publication root');return fs.readFile(real);};
for(const asset of manifest.assets){
 if(ids.has(asset.id))throw Error('Duplicate id');ids.add(asset.id);
 if(asset.license.id!=='CC0-1.0')throw Error('Unknown licence');
 const model=await read(asset.model),thumb=await read(asset.thumbnail);
 for(const [data,digest]of[[model,asset.sha256],[thumb,asset.thumbnailSha256]])if(createHash('sha256').update(data).digest('hex')!==digest)throw Error('Content hash mismatch: '+asset.id);
 if(model.length!==asset.bytes)throw Error('Byte count mismatch');
 const inspected=inspectGlbJson(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength));
 if(inspected.triangleCount!==asset.triangleCount||inspected.vertexCount!==asset.vertexCount||JSON.stringify(inspected.bounds)!==JSON.stringify(asset.bounds))throw Error('Geometry metadata mismatch: '+asset.id);
 triangles+=asset.triangleCount;bytes+=model.length;
}
const inventory=JSON.parse(await fs.readFile(path.join(publicRoot,'assets/catalogue/inventory.json'),'utf8'));
if(ids.size!==inventory.admitted||ids.size+inventory.excluded.length!==inventory.models)throw Error('Inventory count mismatch');
console.log(JSON.stringify({status:'pass',assets:ids.size,models:inventory.models,excluded:inventory.excluded.length,packs:inventory.packs.length,modelBytes:bytes,triangles,interiors:inventory.interiors}));
