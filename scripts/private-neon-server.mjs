import { createServer } from 'node:http';
import { randomBytes, randomUUID, verify, createPublicKey } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { canonical, nodeId, sha256 } from './lib/identity.mjs';
import { validateNeonSign } from '../src/domain/neon-sign.ts';
import { neonTriangleCount, MAX_WORLD_NEON_TRIANGLES } from '../src/domain/neon-geometry.ts';
export const PROTOCOL='elsemesh.neon-session/1';
const MAX_BYTES=65536, MAX_REQUESTS=512;
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,max=80)=>typeof v==='string'&&v.length>0&&v.length<=max;
function checkSigns(signs){
 if(!Array.isArray(signs)||signs.length>50)throw new Error('At most 50 configured signs are supported.');
 const ids=new Set();for(const s of signs){if(!shape(s,['id','config','powered'])||!text(s.id)||ids.has(s.id)||typeof s.powered!=='boolean'||validateNeonSign(s.config).length)throw new Error('Invalid sign configuration.');ids.add(s.id);}
 if(signs.reduce((sum,s)=>sum+neonTriangleCount(s.config),0)>MAX_WORLD_NEON_TRIANGLES)throw new Error('World neon geometry exceeds complexity budget.');
 return structuredClone(signs);
}
const safeHost=host=>host==='127.0.0.1'||(/^100\.(\d+)\.\d+\.\d+$/.test(host)&&Number(host.split('.')[1])>=64&&Number(host.split('.')[1])<=127);
export async function createPrivateNeonServer({host,port,statePath,worldId,allowlist,signs,worldHour=22,persistenceHook}){
 if(!Number.isFinite(worldHour)||worldHour<0||worldHour>24||(persistenceHook!==undefined&&typeof persistenceHook!=='function'))throw new Error('Invalid world hour or persistence hook.');
 if(!safeHost(host)||!Number.isInteger(port)||port<0||port>65535||!text(worldId,200)||!text(statePath,4096))throw new Error('Explicit loopback or Tailscale host, port, statePath and worldId required.');
 if(!allowlist||typeof allowlist!=='object'||Array.isArray(allowlist)||Object.keys(allowlist).length>100)throw new Error('Explicit identity allowlist required.');
 const identities=new Map();let owners=0;for(const [id,entry]of Object.entries(allowlist)){if(!shape(entry,['publicKey','role'])||!['owner','member'].includes(entry.role)||typeof entry.publicKey!=='string'||entry.publicKey.length>2048||nodeId(entry.publicKey)!==id||createPublicKey(entry.publicKey).asymmetricKeyType!=='ed25519')throw new Error('Invalid allowlist identity.');identities.set(id,entry);if(entry.role==='owner')owners++;}if(!owners)throw new Error('At least one explicitly enrolled owner is required.');
 const bootstrap=checkSigns(signs),signIds=new Set(bootstrap.map(s=>s.id)),serverId='elsemesh-neon-server:'+sha256(canonical({host,port,worldId})),epoch=randomUUID();
 let initial=true;
 let state={schema:PROTOCOL,worldId,revision:0,effectStart:Date.now(),worldHour,signs:bootstrap,requests:[]};
 try{const saved=JSON.parse(await readFile(statePath,'utf8'));if(!shape(saved,['schema','worldId','revision','effectStart','worldHour','signs','requests'])||saved.schema!==PROTOCOL||saved.worldId!==worldId||!Number.isSafeInteger(saved.revision)||saved.revision<0||!Number.isFinite(saved.effectStart)||!Number.isFinite(saved.worldHour)||saved.worldHour<0||saved.worldHour>24||!Array.isArray(saved.requests)||saved.requests.length>MAX_REQUESTS)throw new Error('Invalid saved private world.');saved.signs=checkSigns(saved.signs);if(saved.signs.length!==signIds.size||saved.signs.some(s=>!signIds.has(s.id)))throw new Error('Saved signs differ from explicit server configuration.');for(const r of saved.requests)if(!shape(r,['id','actor','digest','revision'])||!text(r.id)||!text(r.actor,200)||!text(r.digest,64)||!Number.isSafeInteger(r.revision))throw new Error('Invalid persisted request history.');state=saved;initial=false;}catch(error){if(error.code!=='ENOENT')throw error;}
 const persist=async candidate=>{
  let renamed=false;
  try{
   await mkdir(dirname(statePath),{recursive:true,mode:0o700});const temp=statePath+'.'+randomUUID()+'.tmp';
   const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(candidate));await file.sync();}finally{await file.close();}
   await persistenceHook?.('beforeRename',candidate);
   await rename(temp,statePath);renamed=true;await persistenceHook?.('afterRename',candidate);
   const directory=await open(dirname(statePath),'r');try{await directory.sync();}finally{await directory.close();}
  }catch(error){if(renamed)error.indeterminateCommit=true;throw error;}
 };
 const http=createServer((_req,res)=>{res.writeHead(404);res.end('Private neon session');});
 const wss=new WebSocketServer({server:http,path:'/api',maxPayload:MAX_BYTES,perMessageDeflate:false}),sessions=new Map();let queue=Promise.resolve(),failed=false,closing;
 const shutdown=()=>{if(!closing){for(const socket of sessions.keys())socket.terminate();closing=new Promise(resolveClose=>wss.close(()=>http.close(()=>resolveClose())));}return closing;};
 const send=(socket,value)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));};
 const snapshot=role=>({type:'snapshot',protocol:PROTOCOL,serverId,worldId,epoch,revision:state.revision,serverNow:Date.now(),effectStart:state.effectStart,worldHour:state.worldHour,role,signs:state.signs});
 const broadcast=()=>{for(const [socket,session]of sessions)if(session.authenticated)send(socket,snapshot(session.role));};
 wss.on('connection',socket=>{
  if(sessions.size>=32){socket.close(1013,'Session limit');return;}
  const session={authenticated:false,challenge:null,identity:null,role:null,count:0,window:Date.now()};sessions.set(socket,session);
  const error=(code,message,requestId)=>send(socket,{type:'error',code,message,...(requestId?{requestId}:{}),revision:state.revision});
  const timeout=setTimeout(()=>{if(!session.authenticated)socket.close(1008,'Authentication timeout');},30000);timeout.unref();
  socket.on('close',()=>{clearTimeout(timeout);sessions.delete(socket);});socket.on('error',()=>{});
  socket.on('message',(bytes,isBinary)=>{
   const now=Date.now();if(now-session.window>10000){session.count=0;session.window=now;}if(++session.count>40){error('RATE','Too many messages.');socket.close(1008,'Rate limit');return;}
   if(isBinary||bytes.length>MAX_BYTES){error('SHAPE','Text message exceeds limits.');socket.close(1009);return;}
   let m;try{m=JSON.parse(bytes.toString());}catch{error('SHAPE','Invalid JSON.');return;}
   if(!m||typeof m!=='object'||Array.isArray(m)){error('SHAPE','Message must be an object.');return;}
   if(m.type==='hello'){
    if(session.authenticated||session.challenge||!shape(m,['type','protocol','nodeId','publicKey'])||m.protocol!==PROTOCOL||typeof m.publicKey!=='string'||m.publicKey.length>2048){error('AUTH','Invalid hello.');return;}
    let id;try{id=nodeId(m.publicKey);}catch{error('AUTH','Invalid public key.');return;}
    const enrolled=identities.get(id);if(id!==m.nodeId||!enrolled||nodeId(enrolled.publicKey)!==id){error('AUTH','Identity is not enrolled.');return;}
    const challenge={protocol:PROTOCOL,serverId,worldId,nodeId:id,publicKey:m.publicKey,sessionId:randomUUID(),nonce:randomBytes(32).toString('base64'),expiresAt:Date.now()+30000};
    session.challenge=challenge;session.identity=id;session.role=enrolled.role;send(socket,{type:'challenge',challenge});return;
   }
   if(m.type==='auth'){
    const challenge=session.challenge;session.challenge=null;
    if(!shape(m,['type','sessionId','signature'])||session.authenticated||!challenge||m.sessionId!==challenge.sessionId||Date.now()>challenge.expiresAt||typeof m.signature!=='string'||m.signature.length>256){error('AUTH','Invalid or consumed challenge.');return;}
    let valid=false;try{valid=verify(null,Buffer.from(canonical(challenge)),challenge.publicKey,Buffer.from(m.signature,'base64'));}catch{/* Invalid signatures fail closed. */}
    if(!valid){error('AUTH','Signature rejected.');return;}session.authenticated=true;send(socket,snapshot(session.role));return;
   }
   if(!session.authenticated){error('AUTH','Authentication required.');return;}
   queue=queue.then(async()=>{
    if(failed||!sessions.has(socket)||!session.authenticated)return;
    const configWrite=m.type==='setConfig',powerWrite=m.type==='setPower';
    if((!configWrite&&!powerWrite)||!shape(m,['type','requestId','expectedRevision','signId',configWrite?'config':'powered'])||!text(m.requestId)||!text(m.signId)||!Number.isSafeInteger(m.expectedRevision)||m.expectedRevision<0||(powerWrite&&typeof m.powered!=='boolean')||(configWrite&&validateNeonSign(m.config).length)){error('SHAPE','Invalid mutation.',text(m.requestId)?m.requestId:undefined);return;}
    if(configWrite&&session.role!=='owner'){error('FORBIDDEN','Only enrolled owners may edit configuration.',m.requestId);return;}
    const sign=state.signs.find(s=>s.id===m.signId);if(!sign){error('UNKNOWN_SIGN','Sign is not configured.',m.requestId);return;}
    const digest=sha256(canonical(m)),previous=state.requests.find(r=>r.actor===session.identity&&r.id===m.requestId);
    if(previous){if(previous.digest!==digest){error('REQUEST_REUSE','Request ID has different content.',m.requestId);return;}send(socket,{type:'ack',requestId:m.requestId,revision:previous.revision,duplicate:true});return;}
    if(m.expectedRevision!==state.revision){error('STALE','Refresh the current revision.',m.requestId);send(socket,snapshot(session.role));return;}
    const candidate=structuredClone(state);candidate.revision++;const target=candidate.signs.find(s=>s.id===m.signId);if(configWrite)target.config=structuredClone(m.config);else target.powered=m.powered;
    try{checkSigns(candidate.signs);}catch{error('SHAPE','Sign geometry exceeds the configured limits.',m.requestId);return;}
    candidate.requests.push({id:m.requestId,actor:session.identity,digest,revision:candidate.revision});candidate.requests=candidate.requests.slice(-MAX_REQUESTS);
    try{await persist(candidate);}catch(failure){if(failure.indeterminateCommit){failed=true;void shutdown();return;}error('PERSIST','Mutation was not accepted; persistence failed before commit.',m.requestId);return;}
    state=candidate;send(socket,{type:'ack',requestId:m.requestId,revision:state.revision});broadcast();
   }).catch(()=>error('SHAPE','Mutation rejected.'));
  });
 });
 return{listen:async()=>{if(initial){await persist(state);initial=false;}if(failed)throw new Error('Server requires restart after uncertain commit.');return new Promise((resolveListen,reject)=>{http.once('error',reject);http.listen(port,host,()=>{http.off('error',reject);resolveListen(http.address());});});},close:async()=>{await queue;await shutdown();},address:()=>http.address()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const configIndex=process.argv.indexOf('--config');if(configIndex<0)throw new Error('Usage: node scripts/private-neon-server.mjs --config /absolute/private-config.json');
 const config=JSON.parse(await readFile(process.argv[configIndex+1],'utf8'));
 if('persistenceHook' in config)throw new Error('Persistence hooks are factory-only test controls.');
 if(config.port===0||!Object.values(networkInterfaces()).flat().some(a=>a?.address===config.host))throw new Error('Configured host must be a local Tailscale or loopback interface and explicit port.');
 const enroll=process.argv.indexOf('--enroll');if(enroll>=0){const pem=await readFile(process.argv[enroll+1],'utf8'),role=process.argv.includes('--owner')?'owner':'member';config.allowlist??={};config.allowlist[nodeId(pem)]={publicKey:pem,role};await writeFile(process.argv[configIndex+1],JSON.stringify(config,null,2)+'\n',{mode:0o600});process.stdout.write('Public identity enrolled.\n');}
 else{const server=await createPrivateNeonServer(config);await server.listen();process.stdout.write('Private neon server listening on '+config.host+':'+config.port+' /api\n');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void server.close().then(()=>process.exit(0)));}
}

