#!/usr/bin/env node
/** Trusted build-time source sync. Copies an inspected import closure, never a runtime bundle. */
import {build} from 'esbuild';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
const run=promisify(execFile),args=process.argv.slice(2),sourceArg=args.find(a=>!a.startsWith('--'));
if(!sourceArg)throw Error('Usage: node scripts/sync-native-island-runtime.mjs GAME_CHECKOUT [--allow-dirtyPROTOTYPE]');
const source=resolve(sourceArg),destination=resolve('src/vendor/elsemesh'),sourceRoot=join(source,'src');
const git=async(...values)=>(await run('git',['-C',source,...values])).stdout.trim();
const sourceGitCommit=await git('rev-parse','HEAD'),dirty=await git('status','--porcelain');
if(dirty&&!args.includes('--allow-dirtyPROTOTYPE'))throw Error('Source checkout is dirty; clean release source required (prototype override is explicit).');
const entries=['src/world-runtime/RepositoryScene.js','src/world-runtime/NativeIslandSource.js'];
const result=await build({absWorkingDir:source,entryPoints:entries,bundle:true,write:false,metafile:true,format:'esm',platform:'browser',outdir:'unused-native-sync',logLevel:'silent'});
const files=[];
for(const input of Object.keys(result.metafile.inputs).sort()){
 const absolute=resolve(source,input),path=relative(sourceRoot,absolute);
 if(path.startsWith('..'+sep)||path==='..'||resolve(sourceRoot,path)!==absolute)throw Error('Dependency escapes trusted source directory: '+input);
 if(/(^|\/)App\.js$|(^|\/)main\.js$/.test(path))throw Error('Application entry is forbidden in renderer closure: '+path);
 const bytes=await readFile(absolute),target=join(destination,path);await mkdir(dirname(target),{recursive:true});await copyFile(absolute,target);
 files.push({path:path.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(const name of ['LICENSE','CREDITS.md']){const bytes=await readFile(join(source,name));await writeFile(join(destination,name),bytes);files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile('src/vendor/native-island-runtime-provenance.json',JSON.stringify({schema:'elsemesh.native-island-runtime-provenance/1',source:'rebroad/ElseMesh',sourceGitCommit,prototypeDirty:!!dirty,license:'MIT (retained LICENSE and CREDITS.md; dependency source headers retained)',entryPoints:entries,method:'esbuild metafile dependency closure; copied original modules, no opaque runtime bundle',overlay:'For listed files this manifest supersedes the historical elsemesh-provenance.json import record; hashes describe exact current bytes.',files},null,2)+'\n');
process.stdout.write(JSON.stringify({sourceGitCommit,prototypeDirty:!!dirty,files:files.length})+'\n');
