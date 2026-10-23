#!/usr/bin/env node
// Export an explicit .emw source without changing it or replacing existing files.
import './world-repository-git.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {packWorldRepository,inspectWorldRepository}=await import('../src/domain/world-repository.ts');
const {forkWorldSource}=await import('../src/domain/world-source.ts');
const args=process.argv.slice(2);
if(![2,4].includes(args.length)||(args.length===4&&(args[2]!=='--fork'||!args[3]?.trim())))throw new Error('Usage: node scripts/world-repository-export.mjs INPUT.emw NEW_OUTPUT_DIRECTORY [--fork NAME]');
const input=path.resolve(args[0]),out=path.resolve(args[1]);
const handle=await fs.open(input,'r');let bytes;
try{
 const info=await handle.stat();if(!info.isFile()||info.size>25*1024*1024)throw new Error('Input exceeds the 25 MiB project limit.');
 const chunks=[];let total=0;for(;;){const chunk=Buffer.alloc(65536),{bytesRead}=await handle.read(chunk);if(!bytesRead)break;total+=bytesRead;if(total>25*1024*1024)throw new Error('Input exceeds the 25 MiB project limit.');chunks.push(chunk.subarray(0,bytesRead));}bytes=Buffer.concat(chunks,total);
}finally{await handle.close();}
const project=JSON.parse(bytes.toString('utf8')),sourceDigest=createHash('sha256').update(bytes).digest('hex');
const options={attribution:{authors:[]},provenance:{sourceWorldId:project.metadata?.worldId,sourceLocation:'local-export:'+path.basename(input),sourceDigest}};
let packed=await packWorldRepository(project,options);
if(args[2]==='--fork'){
 const state=await inspectWorldRepository(async p=>packed.get(p));
 const fork=forkWorldSource({...state,identity:{worldId:state.project.metadata.worldId,location:options.provenance.sourceLocation,contentDigest:state.contentDigest,sessionId:'export'},source:{kind:'local',read:async p=>packed.get(p)}},args[3]);
 packed=await packWorldRepository(fork.project,fork.packOptions);
}
await fs.mkdir(out,{recursive:false});
for(const[p,b]of packed){await fs.mkdir(path.dirname(path.join(out,p)),{recursive:true});await fs.writeFile(path.join(out,p),b,{flag:'wx'});}
console.log(JSON.stringify({output:out,worldId:JSON.parse(Buffer.from(packed.get('world.json')).toString('utf8')).world.worldId,sourceDigest},null,2));
