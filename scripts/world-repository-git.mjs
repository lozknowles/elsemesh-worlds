#!/usr/bin/env node
import {registerHooks} from 'node:module';
import {existsSync,promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&c.parentURL?.startsWith(pathToFileURL(root+'/src/domain/').href)&&!path.extname(s))s+='.ts';return n(s,c);}});
const domain=await import(pathToFileURL(root+'/src/domain/world-repository.ts').href);
const sha=b=>createHash('sha256').update(b).digest('hex'), oid=/^[a-f0-9]{40}$/;
const roles=['metadata','terrain','objects','features','environment','spawn','geography','assets'];
const controls=new Set(['README.md','.gitattributes','.gitignore']);
const allowed=p=>/^snapshots\/[a-f0-9]{64}\/(metadata|terrain|objects|features|environment|spawn|geography|assets)\.json$/.test(p)||/^(assets\/[a-f0-9]{64}\.glb|imagery\/[a-f0-9]{64}\.(png|jpg))$/.test(p);
const branchOK=b=>/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(b)&&!b.includes('..')&&!b.endsWith('/')&&!b.endsWith('.lock');
function git(repo,args,input,extra={}){
 const env={...process.env};
 for(const k of Object.keys(env))if(k.startsWith('GIT_'))delete env[k];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_ATTR_NOSYSTEM:'1',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_AUTHOR_NAME:'World author',GIT_AUTHOR_EMAIL:'world@local.invalid',GIT_COMMITTER_NAME:'World author',GIT_COMMITTER_EMAIL:'world@local.invalid'},extra);
 const r=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false','-c','tag.gpgsign=false','-c','core.attributesFile=/dev/null','-c','diff.external=','-c','protocol.ext.allow=never','-c','protocol.file.allow=never','--git-dir='+path.join(repo,'.git'),...args],{env,input,maxBuffer:32*1024*1024});
 if(r.status!==0)throw new Error('Git operation failed: '+args[0]);
 return r.stdout;
}
const text=(r,a,i,e)=>git(r,a,i,e).toString('utf8').trim();
async function safe(repo,initialized=true){
 repo=path.resolve(repo);
 if(await fs.realpath(repo)!==repo||(await fs.lstat(repo)).isSymbolicLink())throw new Error('Use a canonical repository path without symlinks.');
 if(initialized){
  const d=path.join(repo,'.git'),st=await fs.lstat(d);
  if(!st.isDirectory()||st.isSymbolicLink())throw new Error('A dedicated local content .git directory is required.');
  if(await fs.readFile(path.join(d,'world-content-repository'),'utf8').catch(()=> '')!=='elsemesh-content/1\n')throw new Error('Repository was not initialized by this tool.');
  for(const p of ['objects/info/alternates','info/grafts','commondir'])if(existsSync(path.join(d,p)))throw new Error('Shared object storage is forbidden.');
  await rejectGitLinks(d);
  const config=await fs.readFile(path.join(d,'config'),'utf8');
  if(/\[(?!core\]|branch "|remote ")/i.test(config)||/(?:hooksPath|fsmonitor|sshCommand|worktree|include|filter|credential|sign|template|alternate|promisor)/i.test(config))throw new Error('Unsupported repository configuration.');
 }
 return repo;
}
async function rejectGitLinks(d){for(const e of await fs.readdir(d,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Symlinks inside Git storage are forbidden.');if(e.isDirectory())await rejectGitLinks(path.join(d,e.name));}}
function head(r){try{return text(r,['rev-parse','--verify','HEAD']);}catch{return null;}}
function branch(r){const b=text(r,['symbolic-ref','HEAD']);if(!branchOK(b))throw new Error('A normal branch is required.');return b;}
function tree(r,commit){
 if(!oid.test(commit))throw new Error('An exact commit SHA is required.');
 const entries=git(r,['ls-tree','-r','-z',commit]).toString('utf8').split('\0').filter(Boolean);if(entries.length>4096)throw new Error('Repository file count limit exceeded.');
 return new Map(entries.map(l=>{
  const [info,p]=l.split('\t'),[mode,type,id]=info.split(' ');
  if(mode!=='100644'||type!=='blob'||!(p==='world.json'||controls.has(p)||allowed(p)))throw new Error('Forbidden path, executable, symlink or submodule in commit.');
  return[p,id];
 }));
}
async function boundedFile(r,p,max=25*1024*1024){
 const full=path.join(r,p),resolved=await fs.realpath(full);if(!resolved.startsWith(r+path.sep))throw new Error('Content escaped repository.');
 const handle=await fs.open(full,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>max)throw new Error('Content size limit exceeded.');
 const actual=await fs.realpath('/proc/self/fd/'+handle.fd);if(!actual.startsWith(r+path.sep))throw new Error('Content escaped repository.');
 const chunks=[];let total=0;for(;;){const b=Buffer.alloc(Math.min(65536,max-total+1));const {bytesRead}=await handle.read(b);if(!bytesRead)break;total+=bytesRead;if(total>max)throw new Error('Content size limit exceeded.');chunks.push(b.subarray(0,bytesRead));}return Buffer.concat(chunks,total);
 }finally{await handle.close();}
}
function blob(r,id,max=25*1024*1024){const size=Number(text(r,['cat-file','-s',id]));if(!Number.isSafeInteger(size)||size<0||size>max)throw new Error('Git blob size limit exceeded.');const b=git(r,['cat-file','blob',id]);if(b.length!==size||b.length>max)throw new Error('Git blob changed or exceeded limit.');return b;}
async function walk(r,prefix='',budget={count:0}){
 const out=[];
 for(const e of await fs.readdir(path.join(r,prefix),{withFileTypes:true})){
  if(!prefix&&e.name==='.git')continue;
  if(++budget.count>4096)throw new Error('Repository file count limit exceeded.');
  const p=prefix?prefix+'/'+e.name:e.name;
  if(e.isSymbolicLink())throw new Error('Symlinks are forbidden.');
  if(e.isDirectory()){if(!/^(snapshots|snapshots\/[a-f0-9]{64}|assets|imagery)$/.test(p))throw new Error('Unexpected directory.');out.push(...await walk(r,p,budget));}
  else if(e.isFile())out.push(p);else throw new Error('Special files are forbidden.');
 }
 return out;
}
async function inspect(r,commit=null){
 const tracked=commit?tree(r,commit):null,files=new Map();
 const read=async(p,max)=>{
  if(!/^[A-Za-z0-9./_-]+$/.test(p)||p.includes('..'))throw new Error('Invalid content path.');
  const b=tracked?blob(r,tracked.get(p)??'missing',max):await boundedFile(r,p,max);
  if(b.length>max)throw new Error('Content size limit exceeded.');
  files.set(p,b);return b;
 };
 // Check symlinks and unexpected directories before following any file.
 const paths=tracked?[...tracked.keys()]:await walk(r);
 const state=await domain.inspectWorldRepository(read);

 const canonical=await domain.packWorldRepository(state.project,{attribution:state.manifest.attribution,provenance:state.manifest.provenance});
 let total=0;
 for(const p of paths){
  if(!files.has(p)){
   const b=tracked?blob(r,tracked.get(p)):await boundedFile(r,p);
   if(controls.has(p)){if(!Buffer.from(canonical.get(p)).equals(b))throw new Error('Unexpected control file.');}
   else if(allowed(p)){
    if(commit){
     if(/^(assets|imagery)\//.test(p)&&!p.includes(sha(b)))throw new Error('Historical binary hash mismatch.');
     if(p.endsWith('.json'))JSON.parse(b.toString('utf8'));
    }
   }else throw new Error('Unexpected file; only validated world content may be checkpointed.');
   files.set(p,b);
  }
  if(p.endsWith('.json')){
   const content=files.get(p).toString('utf8');
   if(/"(?:password|passwd|accessToken|refreshToken|apiKey|secret|credential|sessionId)"\s*:|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{15,}|https?:\/\/[^\s/"']+:[^\s/"']+@/i.test(content))throw new Error('Credential or session material is forbidden in world checkpoints.');
  }
  total+=files.get(p).length;if(total>25*1024*1024)throw new Error('Repository exceeds 25 MiB.');
 }
 // Validate every retained snapshot independently, and reject orphan payloads.
 const referenced=new Set(['world.json',...controls]);
 for(const snapshot of new Set([...files.keys()].filter(p=>p.startsWith('snapshots/')).map(p=>p.split('/')[1]))){
  const components={};
  for(const role of roles){const p='snapshots/'+snapshot+'/'+role+'.json',b=files.get(p);if(!b)throw new Error('Incomplete historical snapshot.');components[role]={path:p,sha256:sha(b),bytes:b.length};}
  const digest=sha(Buffer.from(JSON.stringify(Object.fromEntries(roles.map(role=>[role,{sha256:components[role].sha256,bytes:components[role].bytes}])),null,2)+'\n'));
  if(digest!==snapshot)throw new Error('Historical snapshot digest mismatch.');
  const metadata=JSON.parse(files.get(components.metadata.path).toString('utf8'));
  const manifest={...state.manifest,snapshot,components,world:metadata,regions:[{regionId:metadata.regionId,name:metadata.name,scene:{snapshot}}],engine:{...state.manifest.engine,requires:[...domain.WORLD_CAPABILITIES]}};
  await domain.inspectWorldRepository(async(p,max)=>{referenced.add(p);const b=p==='world.json'?Buffer.from(JSON.stringify(manifest)):files.get(p);if(!b||b.length>max)throw new Error('Invalid retained snapshot reference.');return b;});
 }
 if([...files.keys()].some(p=>!referenced.has(p)))throw new Error('Unreferenced binary payload is forbidden.');
 return{...state,files};
}
async function validateReachable(r,commit){
 if(!oid.test(commit))throw new Error('An exact commit SHA is required.');
 const commits=text(r,['rev-list','--max-count=129',commit]).split('\n').filter(Boolean);
 if(commits.length>128)throw new Error('Reachable history exceeds 128 commits; preserve it and use an explicitly reviewed separate content publication.');
 const blobs=new Set();let total=0;
 for(const current of commits){
  for(const id of tree(r,current).values()){
   if(blobs.has(id))continue;
   blobs.add(id);if(blobs.size>16384)throw new Error('Reachable history exceeds the blob count limit.');
   const size=Number(text(r,['cat-file','-s',id]));
   if(!Number.isSafeInteger(size)||size<0||size>25*1024*1024)throw new Error('Reachable history contains an oversized blob.');
   total+=size;if(total>128*1024*1024)throw new Error('Reachable history exceeds 128 MiB of unique content.');
  }
  await inspect(r,current);
 }
 return{commits:commits.length,uniqueBlobs:blobs.size,bytes:total};
}
function expected(r,v){const h=head(r);if((h??'none')!==v)throw new Error('HEAD changed. Both snapshots are preserved. Run status and history; export local edits separately and explicitly reconcile.');return h;}
function writeTree(r,files){
 const idx=path.join(r,'.git','world-index-'+randomUUID());
 try{
  text(r,['read-tree','--empty'],undefined,{GIT_INDEX_FILE:idx});
  const records=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([p,b])=>'100644 '+text(r,['hash-object','-w','--stdin'],b)+'\t'+p+'\0').join('');
  text(r,['update-index','-z','--index-info'],records,{GIT_INDEX_FILE:idx});
  return text(r,['write-tree'],undefined,{GIT_INDEX_FILE:idx});
 }finally{fs.unlink(idx).catch(()=>{});}
}
export async function run(command,repo,args=[]){
 if(command==='init'){
  repo=await safe(repo,false);if(existsSync(path.join(repo,'.git')))throw new Error('Existing Git state is preserved.');
  await inspect(repo);git(repo,['init','--initial-branch=main','--template=']);
  await fs.writeFile(path.join(repo,'.git','world-content-repository'),'elsemesh-content/1\n',{flag:'wx'});
  return{initialized:true,head:null,next:'checkpoint <repo> none <message>'};
 }
 repo=await safe(repo);
 if(command==='status'){
  const s=await inspect(repo),h=head(repo),tracked=h?tree(repo,h):new Map();
  const dirty=!h||tracked.size!==s.files.size||[...s.files].some(([p,b])=>tracked.get(p)!==text(repo,['hash-object','--stdin'],b));
  return{head:h,branch:branch(repo),dirty,worldId:s.project.metadata.worldId,snapshot:s.manifest.snapshot,contentDigest:s.contentDigest};
 }
 if(command==='checkpoint'){
  if(args.length!==2||!args[1].trim()||args[1].length>500)throw new Error('checkpoint requires expected HEAD (or none) and message.');
  const h=expected(repo,args[0]);
  if(h&&existsSync(path.join(repo,'.git','index'))&&text(repo,['write-tree'])!==text(repo,['rev-parse',h+'^{tree}']))throw new Error('Staged changes preserved. Reconcile the existing index before checkpoint.');
  const s=await inspect(repo),t=writeTree(repo,s.files);
  if(h&&t===text(repo,['rev-parse',h+'^{tree}'])){if(!existsSync(path.join(repo,'.git','index')))git(repo,['read-tree',h]);return{head:h,unchanged:true};}
  const commit=text(repo,['commit-tree',t,...(h?['-p',h]:[]),'-m',args[1]]);
  expected(repo,args[0]);git(repo,['update-ref',branch(repo),commit,h??'0'.repeat(40)]);git(repo,['read-tree',commit]);
  return{head:commit,snapshot:s.manifest.snapshot};
 }
 if(command==='clone'){
  if(args.length!==2)throw new Error('clone requires exact commit and a new destination.');
  const commit=args[0],out=path.resolve(args[1]);await validateReachable(repo,commit);await run('read',repo,[commit,out]);await run('init',out);
  const pack=git(repo,['pack-objects','--stdout','--revs'],commit+'\n');
  git(out,['unpack-objects'],pack);git(out,['update-ref','refs/heads/main',commit]);git(out,['read-tree',commit]);
  return{commit,output:out,contentDigest:(await inspect(out,commit)).contentDigest};
 }
 if(command==='history')return{history:text(repo,['log','--format=%H%x09%ct%x09%s','--max-count=30']).split('\n')};
 if(command==='read'){
  if(args.length!==2)throw new Error('read requires exact commit SHA and a new output folder.');
  const s=await inspect(repo,args[0]),out=path.resolve(args[1]);await fs.mkdir(out,{recursive:false});
  for(const[p,b]of s.files){await fs.mkdir(path.dirname(path.join(out,p)),{recursive:true});await fs.writeFile(path.join(out,p),b,{flag:'wx'});}
  return{commit:args[0],output:out,contentDigest:s.contentDigest};
 }
 if(command==='update'){
  const h=expected(repo,args[0]);if((await run('status',repo)).dirty)throw new Error('Local edits preserved. Checkpoint or export before update.');
  if(!oid.test(args[1]??''))throw new Error('update requires expected HEAD and an exact already fetched commit.');
  git(repo,['merge-base','--is-ancestor',h,args[1]]);const s=await inspect(repo,args[1]);
  return{candidate:args[1],expectedHead:h,contentDigest:s.contentDigest,recoveryAction:'Use read with this commit into a new folder, then Open world repository. Existing folder and branch remain preserved.'};
 }
 if(command==='push'){
  if(args.length!==4||args[3]!=='AUTHORIZE_PUSH')throw new Error('push requires expected HEAD, GitHub URL, branch and AUTHORIZE_PUSH.');
  const h=expected(repo,args[0]);if((await run('status',repo)).dirty)throw new Error('Checkpoint local edits before push.');
  if(!/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(args[1])||!branchOK('refs/heads/'+args[2]))throw new Error('Only credential-free GitHub HTTPS and normal branches are supported.');
  await validateReachable(repo,h);
  git(repo,['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','--no-verify',args[1],h+':refs/heads/'+args[2]]);return{pushed:h};
 }
 throw new Error('Commands: init, status, checkpoint, history, read, clone, update, push.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv[2],process.argv[3],process.argv.slice(4)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
