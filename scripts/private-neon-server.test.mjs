import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from 'node:crypto';
import { WebSocket } from 'ws';
import { createPrivateNeonServer, PROTOCOL } from './private-neon-server.mjs';
import { newIdentity, canonical } from './lib/identity.mjs';
import { defaultNeonSign } from '../src/domain/neon-sign.ts';
const connect=async port=>{
 const socket=new WebSocket('ws://127.0.0.1:'+port+'/api'),messages=[],waiters=[];
 socket.on('message',bytes=>{const value=JSON.parse(bytes);const index=waiters.findIndex(w=>w.predicate(value));if(index>=0){const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(value);}else messages.push(value);});
 const next=predicate=>{const index=messages.findIndex(predicate);if(index>=0)return Promise.resolve(messages.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>reject(new Error('Message timeout')),2000)};waiters.push(waiter);});};
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});return{socket,send:m=>socket.send(JSON.stringify(m)),next};
};
const auth=async(client,identity)=>{
 client.send({type:'hello',protocol:PROTOCOL,nodeId:identity.nodeId,publicKey:identity.publicKeyPem});const {challenge}=await client.next(m=>m.type==='challenge');
 const message={type:'auth',sessionId:challenge.sessionId,signature:sign(null,Buffer.from(canonical(challenge)),identity.privateKeyPem).toString('base64')};client.send(message);
 const snapshot=await client.next(m=>m.type==='snapshot');return{snapshot,message,challenge};
};
test('private authority enforces identity, roles, CAS, retry and recovery',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'neon-private-')),owner=newIdentity(),member=newIdentity(),unknown=newIdentity(),statePath=join(dir,'world.json'),allowlist={[owner.nodeId]:{publicKey:owner.publicKeyPem,role:'owner'},[member.nodeId]:{publicKey:member.publicKeyPem,role:'member'}},options={host:'127.0.0.1',port:0,statePath,worldId:'test-world',allowlist,signs:[{id:'red-lion',config:defaultNeonSign(),powered:true}]};
 let server=await createPrivateNeonServer(options);await server.listen();const clients=[];t.after(async()=>{for(const c of clients)c.socket.terminate();await server.close();await rm(dir,{recursive:true,force:true});});
 const open=async()=>{const c=await connect(server.address().port);clients.push(c);return c;};
 const bad=await open();bad.send({type:'hello',protocol:PROTOCOL,nodeId:unknown.nodeId,publicKey:unknown.publicKeyPem});assert.equal((await bad.next(m=>m.type==='error')).code,'AUTH');
 const a=await open(),oa=await auth(a,owner);assert.equal(oa.snapshot.role,'owner');const b=await open(),mb=await auth(b,member);assert.equal(mb.snapshot.role,'member');
 a.send(oa.message);assert.equal((await a.next(m=>m.type==='error')).code,'AUTH');
 const replay=await open();replay.send({type:'hello',protocol:PROTOCOL,nodeId:owner.nodeId,publicKey:owner.publicKeyPem});await replay.next(m=>m.type==='challenge');replay.send(oa.message);assert.equal((await replay.next(m=>m.type==='error')).code,'AUTH');
 b.send({type:'setConfig',requestId:'forbid',expectedRevision:0,signId:'red-lion',config:defaultNeonSign('EDIT')});assert.equal((await b.next(m=>m.type==='error')).code,'FORBIDDEN');
 b.send({type:'setPower',requestId:'unknown',expectedRevision:0,signId:'missing',powered:false});assert.equal((await b.next(m=>m.type==='error')).code,'UNKNOWN_SIGN');
 b.send({type:'setPower',requestId:'malformed',expectedRevision:0,signId:'red-lion',powered:'false'});assert.equal((await b.next(m=>m.type==='error')).code,'SHAPE');
 a.send({type:'setConfig',requestId:'too-complex',expectedRevision:0,signId:'red-lion',config:{...defaultNeonSign('B'.repeat(80)),font:'optimer',quality:'high',doubleSided:true}});assert.equal((await a.next(m=>m.type==='error')).code,'SHAPE');
 a.send({type:'setConfig',requestId:'unknown-field',expectedRevision:0,signId:'red-lion',config:{...defaultNeonSign(),script:'unsafe'}});assert.equal((await a.next(m=>m.type==='error')).code,'SHAPE');
 const oversized=await open();const oversizedClosed=new Promise(resolve=>oversized.socket.once('close',resolve));oversized.socket.send('x'.repeat(65537));await oversizedClosed;
 const power={type:'setPower',requestId:'power1',expectedRevision:0,signId:'red-lion',powered:false};b.send(power);assert.equal((await b.next(m=>m.type==='ack')).revision,1);
 const update=await a.next(m=>m.type==='snapshot'&&m.revision===1);assert.equal(update.signs[0].powered,false);assert.equal(JSON.parse(await readFile(statePath,'utf8')).revision,1);
 b.send(power);assert.equal((await b.next(m=>m.type==='ack')).duplicate,true);
 b.send({...power,powered:true});assert.equal((await b.next(m=>m.type==='error')).code,'REQUEST_REUSE');
 a.send({type:'setConfig',requestId:'stale',expectedRevision:0,signId:'red-lion',config:defaultNeonSign('EDIT')});assert.equal((await a.next(m=>m.type==='error')).code,'STALE');
 a.send({type:'setConfig',requestId:'edit',expectedRevision:1,signId:'red-lion',config:defaultNeonSign('EDIT')});assert.equal((await a.next(m=>m.type==='ack')).revision,2);
 const late=await open(),lateAuth=await auth(late,member);assert.equal(lateAuth.snapshot.revision,2);assert.equal(lateAuth.snapshot.signs[0].config.text,'EDIT');assert.equal(lateAuth.snapshot.signs[0].powered,false);assert.equal(lateAuth.snapshot.effectStart,oa.snapshot.effectStart);
 const flood=await open();for(let i=0;i<41;i++)flood.send({type:'unknown'});assert.equal((await flood.next(m=>m.type==='error'&&m.code==='RATE')).code,'RATE');
 for(const c of clients)c.socket.terminate();await server.close();server=await createPrivateNeonServer(options);await server.listen();
 const restored=await open(),restoredAuth=await auth(restored,owner);assert.equal(restoredAuth.snapshot.revision,2);assert.equal(restoredAuth.snapshot.signs[0].config.text,'EDIT');assert.equal(restoredAuth.snapshot.signs[0].powered,false);assert.notEqual(restoredAuth.snapshot.epoch,oa.snapshot.epoch);assert.equal(restoredAuth.snapshot.effectStart,oa.snapshot.effectStart);
 restored.send(power);assert.equal((await restored.next(m=>m.type==='error')).code,'STALE');
});
test('rejects public binds and absent explicit owners',async()=>{
 const identity=newIdentity(),base={host:'0.0.0.0',port:5197,statePath:'/tmp/unused-neon.json',worldId:'w',allowlist:{[identity.nodeId]:{publicKey:identity.publicKeyPem,role:'owner'}},signs:[]};
 await assert.rejects(createPrivateNeonServer(base),/Explicit/);await assert.rejects(createPrivateNeonServer({...base,host:'127.0.0.1',allowlist:{}}),/owner/);
});


test('initial snapshot clock persists before any mutation and retains authoritative hour',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'neon-bootstrap-')),owner=newIdentity(),options={host:'127.0.0.1',port:0,statePath:join(dir,'state.json'),worldId:'bootstrap-world',worldHour:22,allowlist:{[owner.nodeId]:{publicKey:owner.publicKeyPem,role:'owner'}},signs:[{id:'sign',config:defaultNeonSign(),powered:true}]};
 let server=await createPrivateNeonServer(options);await server.listen();let client=await connect(server.address().port);const first=await auth(client,owner);assert.equal(first.snapshot.worldHour,22);assert.equal(JSON.parse(await readFile(options.statePath,'utf8')).effectStart,first.snapshot.effectStart);
 client.socket.terminate();await server.close();server=await createPrivateNeonServer({...options,worldHour:14});await server.listen();client=await connect(server.address().port);
 t.after(async()=>{client.socket.terminate();await server.close();await rm(dir,{recursive:true,force:true});});
 const second=await auth(client,owner);assert.equal(second.snapshot.worldHour,22);assert.equal(second.snapshot.effectStart,first.snapshot.effectStart);assert.equal(second.snapshot.revision,0);assert.notEqual(second.snapshot.epoch,first.snapshot.epoch);
});
test('persistence failure before rename rejects safely; failure after rename fails stopped and recovers idempotently',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'neon-durability-')),owner=newIdentity(),options={host:'127.0.0.1',port:0,statePath:join(dir,'state.json'),worldId:'durability-world',allowlist:{[owner.nodeId]:{publicKey:owner.publicKeyPem,role:'owner'}},signs:[{id:'sign',config:defaultNeonSign(),powered:true}]};
 let failAt='beforeRename',server=await createPrivateNeonServer({...options,persistenceHook:async(stage,candidate)=>{if(candidate.revision>0&&stage===failAt)throw new Error('Injected persistence failure');}});await server.listen();let client=await connect(server.address().port);await auth(client,owner);
 const mutation={type:'setPower',requestId:'durable-1',expectedRevision:0,signId:'sign',powered:false};client.send(mutation);assert.equal((await client.next(m=>m.type==='error')).code,'PERSIST');assert.equal(JSON.parse(await readFile(options.statePath,'utf8')).revision,0);
 failAt='afterRename';const received=[];client.socket.on('message',bytes=>received.push(JSON.parse(bytes)));const disconnected=new Promise(resolve=>client.socket.once('close',resolve));client.send(mutation);client.send({type:'setPower',requestId:'queued-2',expectedRevision:1,signId:'sign',powered:true});await disconnected;await server.close();
 assert.equal(received.some(m=>m.type==='ack'||m.type==='error'||m.type==='snapshot'),false);const disk=JSON.parse(await readFile(options.statePath,'utf8'));assert.equal(disk.revision,1);assert.equal(disk.signs[0].powered,false);
 assert.equal(server.address(),null);server=await createPrivateNeonServer(options);await server.listen();client=await connect(server.address().port);t.after(async()=>{client.socket.terminate();await server.close();await rm(dir,{recursive:true,force:true});});
 const recovered=await auth(client,owner);assert.equal(recovered.snapshot.revision,1);assert.equal(recovered.snapshot.signs[0].powered,false);
 client.send(mutation);const retry=await client.next(m=>m.type==='ack');assert.equal(retry.duplicate,true);assert.equal(retry.revision,1);
});

