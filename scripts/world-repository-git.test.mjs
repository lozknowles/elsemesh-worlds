import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {run} from './world-repository-git.mjs';
const {packWorldRepository,inspectWorldRepository}=await import('../src/domain/world-repository.ts');
const base='/fast/world-repositories',house=base+'/house',landscape=base+'/landscape';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function digest(dir){const h=createHash('sha256');async function visit(p){for(const e of (await fs.readdir(p,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(p,e.name);if(e.isDirectory())await visit(f);else if(e.isFile()){h.update(path.relative(dir,f));h.update(await fs.readFile(f));}}}await visit(dir);return h.digest('hex');}
function fixtureGit(dir,args,input){
 const result=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','--git-dir='+dir+'/.git',...args],{input,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@local.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@local.invalid'}});
 assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
async function write(dir,files){for(const[p,b]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),b);}}
test('real independent content repositories: exact reproduction, isolation, deliberate save, conflicts and hostile content',async ()=>{
 const beforeA=await run('status',house),beforeB=await run('status',landscape);
 assert.notEqual(beforeA.worldId,beforeB.worldId);assert.equal(beforeA.dirty,false);assert.equal(beforeB.dirty,false);
 const work=base+'/qualification-'+randomUUID();await fs.mkdir(work);
 const a=work+'/a',fresh=work+'/fresh';
 await run('clone',house,[beforeA.head,a]);
 const reproduced=await run('clone',house,[beforeA.head,fresh]);
 assert.equal(reproduced.commit,beforeA.head);assert.equal(reproduced.contentDigest,beforeA.contentDigest);assert.equal((await run('status',fresh)).head,beforeA.head);
 // A clean tip must not hide forbidden source or credentials in transferred ancestry.
 const hostile=work+'/hostile-ancestry';await run('clone',house,[beforeA.head,hostile]);
 const cleanTree=fixtureGit(hostile,['rev-parse',beforeA.head+'^{tree}']);
 const secretBlob=fixtureGit(hostile,['hash-object','-w','--stdin'],'fixture secret; never transfer\n');
 const rootEntries=fixtureGit(hostile,['ls-tree',beforeA.head]);
 const forbiddenTree=fixtureGit(hostile,['mktree'],rootEntries+'\n100644 blob '+secretBlob+'\tcredentials.txt\n');
 const forbiddenCommit=fixtureGit(hostile,['commit-tree',forbiddenTree,'-p',beforeA.head,'-m','Forbidden ancestor']);
 const cleanTip=fixtureGit(hostile,['commit-tree',cleanTree,'-p',forbiddenCommit,'-m','Clean tip still has forbidden ancestry']);
 fixtureGit(hostile,['update-ref','refs/heads/main',cleanTip]);
 fixtureGit(hostile,['read-tree',cleanTip]);
 assert.equal((await run('status',hostile)).dirty,false);
 const rejectedClone=work+'/must-not-exist';
 await assert.rejects(run('clone',hostile,[cleanTip,rejectedClone]),/Forbidden path/);
 assert.equal(await fs.stat(rejectedClone).catch(()=>null),null);
 // The same validation rejects push before Git can start any transport.
 const transportMarker=work+'/TRANSPORT_ATTEMPTED',bin=work+'/transport-guard';
 await fs.mkdir(bin);
 await fs.writeFile(bin+'/git','#!/bin/sh\nfor arg do\n if [ "$arg" = push ]; then touch "'+transportMarker+'"; exit 99; fi\ndone\nexec /usr/bin/git "$@"\n',{mode:0o755});
 const priorPath=process.env.PATH;process.env.PATH=bin+':'+priorPath;
 try{await assert.rejects(run('push',hostile,[cleanTip,'https://github.com/fixture/never-contact.git','main','AUTHORIZE_PUSH']),/Forbidden path/);}
 finally{process.env.PATH=priorPath;}
 assert.equal(await fs.stat(transportMarker).catch(()=>null),null);
 assert.equal((await run('status',hostile)).head,cleanTip);
 const engine='/fast/work/elsemesh-world-repositories-20261023/src';
 const engineBefore=await digest(engine),bBefore=await digest(landscape);
 const state=await inspectWorldRepository(async p=>fs.readFile(path.join(a,p)));
 state.project.metadata.description+=' Local checkpoint qualification.';
 await write(a,await packWorldRepository(state.project,{attribution:state.manifest.attribution,provenance:state.manifest.provenance}));
 assert.equal((await run('status',a)).dirty,true);
 await assert.rejects(run('checkpoint',a,['0'.repeat(40),'stale expected head']),/HEAD changed/);
 assert.equal((await run('status',a)).head,beforeA.head);
 await assert.rejects(run('update',a,[beforeA.head,beforeA.head]),/Local edits preserved/);
 const changed=await run('checkpoint',a,[beforeA.head,'Deliberate content change']);
 assert.notEqual(changed.head,beforeA.head);assert.equal((await run('status',a)).dirty,false);
 const engineAfter=await digest(engine); assert.equal(engineAfter,engineBefore);assert.equal(await digest(landscape),bBefore);
 assert.equal((await run('checkpoint',a,[changed.head,'No movement commit'])).unchanged,true);
 const output=work+'/old-snapshot';await run('read',a,[beforeA.head,output]);
 assert.equal(sha(await fs.readFile(output+'/world.json')),sha(await fs.readFile(house+'/world.json')));
 await assert.rejects(run('update',a,[changed.head,beforeA.head]),/Git operation failed/);
 const candidate=await run('update',a,[changed.head,changed.head]);assert.match(candidate.recoveryAction,/new folder/);
 await run('clone',a,[changed.head,work+'/with-history']);
 for(const file of ['script.js','.env','session.json']){
  await fs.writeFile(a+'/'+file,'unsafe');
  await assert.rejects(run('checkpoint',a,[changed.head,'forbidden']),/Unexpected file/);
  await fs.unlink(a+'/'+file);
 }
 await fs.symlink('/etc/passwd',a+'/credential');
 await assert.rejects(run('status',a),/Symlinks/);await fs.unlink(a+'/credential');
 const hooks=a+'/.git/hooks';await fs.mkdir(hooks);
 const marker=work+'/HOOK_EXECUTED';
 await fs.writeFile(hooks+'/pre-commit','#!/bin/sh\ntouch '+marker+'\n',{mode:0o755});
 const hookState=await inspectWorldRepository(async p=>fs.readFile(path.join(a,p)));
 hookState.project.metadata.description+=' Hook bypass qualification.';
 await write(a,await packWorldRepository(hookState.project,{attribution:hookState.manifest.attribution,provenance:hookState.manifest.provenance}));
 const hookCommit=await run('checkpoint',a,[changed.head,'Real commit must bypass repository hooks']);
 changed.head=hookCommit.head;
 const large=await fs.open(a+'/oversize.json','w');await large.truncate(25*1024*1024+1);await large.close();
 await assert.rejects(run('status',a),/Content size limit exceeded/);await fs.unlink(a+'/oversize.json');
 assert.equal(await fs.stat(marker).catch(()=>null),null);
 await fs.appendFile(a+'/.git/config','\n[filter "hostile"]\n clean = touch '+marker+'\n');
 await assert.rejects(run('status',a),/Unsupported repository configuration/);
 assert.equal(await fs.stat(marker).catch(()=>null),null);
 assert.equal((await run('status',house)).head,beforeA.head);
 assert.equal((await run('status',landscape)).head,beforeB.head);
 console.log(JSON.stringify({evidenceDirectory:work,engineBefore,engineAfter,otherRepositoryBefore:bBefore,otherRepositoryAfter:await digest(landscape),house:beforeA,landscape:beforeB,changedHead:changed.head}));
});
