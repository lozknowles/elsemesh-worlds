import { validateNeonSign } from './neon-sign';
import type { NeonSignConfig } from './neon-sign';
export const PRIVATE_NEON_PROTOCOL='elsemesh.neon-session/1';
export type PrivateNeonSnapshot={type:'snapshot';protocol:string;serverId:string;worldId:string;epoch:string;revision:number;serverNow:number;effectStart:number;worldHour:number;role:'owner'|'member';signs:{id:string;config:NeonSignConfig;powered:boolean}[]};
/** Binding is exact: a similarly named world or a subset of its signs is not the private scene. */
export function privateNeonMatchesWorld(snapshot:PrivateNeonSnapshot|null,worldId:string,signIds:string[]):boolean {
 if(!snapshot || snapshot.worldId!==worldId || snapshot.signs.length!==signIds.length)return false;
 const local=new Set(signIds),remote=new Set(snapshot.signs.map(sign=>sign.id));
 return local.size===signIds.length && remote.size===snapshot.signs.length && [...remote].every(id=>local.has(id));
}
export type PrivateNeonIdentity={nodeId:string;publicKey:string;privateKey:CryptoKey};
export function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';}
const base64=(bytes:Uint8Array)=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
export async function privateNeonIdentity():Promise<PrivateNeonIdentity>{
 if(!globalThis.isSecureContext||!crypto.subtle)throw new Error('Open this client on localhost in a browser supporting Ed25519.');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('elsemesh-private-neon-identity',1);request.onupgradeneeded=()=>request.result.createObjectStore('keys');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{
 const existing=await new Promise<PrivateNeonIdentity|undefined>((resolve,reject)=>{const r=db.transaction('keys').objectStore('keys').get('identity');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(existing)return existing;
 const keys=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']) as CryptoKeyPair;
 const der=new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',der));
 const nodeId='elsemesh-node:'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
 const encoded=base64(der);const identity={nodeId,publicKey:'-----BEGIN PUBLIC KEY-----\n'+encoded.match(/.{1,64}/g)!.join('\n')+'\n-----END PUBLIC KEY-----\n',privateKey:keys.privateKey};
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('keys','readwrite');tx.objectStore('keys').add(identity,'identity');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});return identity;}catch(error){if(!(error instanceof DOMException)||error.name!=='ConstraintError')throw error;return await new Promise<PrivateNeonIdentity>((resolve,reject)=>{const r=db.transaction('keys').objectStore('keys').get('identity');r.onsuccess=()=>r.result?resolve(r.result):reject(new Error('Identity creation failed'));r.onerror=()=>reject(r.error);});}
 }finally{db.close();}
}
export type PrivateNeonEvents={snapshot:(value:PrivateNeonSnapshot,offsetMs:number)=>void;status:(value:string)=>void;error:(value:string)=>void};
export class PrivateNeonClient{
 private socket:WebSocket|null=null;private snapshot:PrivateNeonSnapshot|null=null;private helloAt=0;private closed=false;private offsetMs=0;private challengeBinding:{serverId:string;worldId:string}|null=null;private identity:PrivateNeonIdentity|null=null;
 constructor(private events:PrivateNeonEvents){}
 async connect(){this.closed=false;this.events.status('Preparing browser identity');try{this.identity=await privateNeonIdentity();if(this.closed)return;this.events.status('Connecting');const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/__private-neon`);this.socket=ws;ws.onopen=()=>{this.helloAt=Date.now();ws.send(JSON.stringify({type:'hello',protocol:PRIVATE_NEON_PROTOCOL,nodeId:this.identity!.nodeId,publicKey:this.identity!.publicKey}));};ws.onmessage=event=>{if(this.closed)return;void this.receive(event.data).catch(error=>{this.events.error(String(error));this.disconnect();});};ws.onerror=()=>{if(!this.closed)this.events.error('Connection failed. Check that the private loopback proxy and server are running.');};ws.onclose=()=>{if(this.closed)return;this.snapshot=null;this.events.status('Disconnected; reconnect to get current server state');};}catch(error){this.events.error(error instanceof Error?error.message:String(error));this.events.status('Disconnected');}}
 private async receive(data:string){const message=JSON.parse(data);if(message.type==='challenge'){
  const c=message.challenge;if(!this.identity||c.protocol!==PRIVATE_NEON_PROTOCOL||c.nodeId!==this.identity.nodeId||c.publicKey!==this.identity.publicKey||![c.serverId,c.worldId,c.sessionId,c.nonce].every(value=>typeof value==='string'&&value.length>0&&value.length<=256)||!Number.isFinite(c.expiresAt)||c.expiresAt<Date.now()-60000||c.expiresAt>Date.now()+300000)throw new Error('Invalid identity challenge');
  this.challengeBinding={serverId:c.serverId,worldId:c.worldId};const signature=base64(new Uint8Array(await crypto.subtle.sign('Ed25519',this.identity.privateKey,new TextEncoder().encode(canonical(c)))));this.socket?.send(JSON.stringify({type:'auth',sessionId:c.sessionId,signature}));this.events.status('Authenticating');
 }else if(message.type==='snapshot'){
  if(!Number.isFinite(message.worldHour)||message.worldHour<0||message.worldHour>24||message.serverId!==this.challengeBinding?.serverId||message.worldId!==this.challengeBinding?.worldId||message.protocol!==PRIVATE_NEON_PROTOCOL||!Array.isArray(message.signs)||!Number.isFinite(message.serverNow)||!Number.isFinite(message.effectStart)||!Number.isSafeInteger(message.revision)||!['owner','member'].includes(message.role))throw new Error('Invalid private server snapshot');
  if(typeof message.epoch!=='string'||!message.epoch||message.epoch.length>100||message.revision<0||message.serverNow<0||message.effectStart<0||message.signs.length<1||message.signs.length>50)throw new Error('Invalid private snapshot bounds');
  const ids=new Set<string>();for(const sign of message.signs){if(!sign||typeof sign.id!=='string'||!sign.id||sign.id.length>100||ids.has(sign.id)||typeof sign.powered!=='boolean'||validateNeonSign(sign.config).length)throw new Error('Invalid private sign configuration');ids.add(sign.id);}
  if(this.snapshot&&message.epoch===this.snapshot.epoch&&message.revision<this.snapshot.revision)return;
  const first=!this.snapshot;this.snapshot=message;if(first)this.offsetMs=message.serverNow-(this.helloAt+Date.now())/2;this.events.snapshot(message,this.offsetMs);this.events.status('Connected');
 }else if(message.type==='error'){this.events.error(`${message.code}: ${message.message}${message.code==='STALE'?' Latest server state is shown. Retry your change.':''}`);} }
 setPower(signId:string,powered:boolean){this.write({type:'setPower',signId,powered});}
 setConfig(signId:string,config:NeonSignConfig){if(this.snapshot?.role!=='owner')throw new Error('Only the enrolled owner can edit configuration');this.write({type:'setConfig',signId,config});}
 private write(payload:Record<string,unknown>){if(!this.snapshot||this.socket?.readyState!==WebSocket.OPEN)throw new Error('Connect before changing private runtime');this.socket.send(JSON.stringify({...payload,requestId:crypto.randomUUID(),expectedRevision:this.snapshot.revision}));}
 disconnect(){this.closed=true;this.socket?.close();this.socket=null;this.snapshot=null;this.events.status('Disconnected');}
}
