import {buildRepositoryScene,disposeRepositoryScene} from '../vendor/elsemesh/world-runtime/RepositoryScene.js';
import {readNativeIslandSource} from '../vendor/elsemesh/world-runtime/NativeIslandSource.js';
import {describeRuntimeWorld,canonical} from '../vendor/elsemesh/world-runtime/vendor/world-engine-contract.js';
export function validateNativeBridgeResource(expected,result){
 if(!result||canonical(result.ref)!==canonical(expected))throw Error('Native resource descriptor differs from the requested world.');
 const data=result.data;
 if('mediaType' in expected){if(!(data instanceof Uint8Array)||data.byteLength!==expected.bytes)throw Error('Native asset bridge returned invalid bytes.');}
 else if(expected.format==='f32le'){if(!(data instanceof Float32Array)||data.length!==expected.width*expected.height*expected.channels||!data.every(Number.isFinite))throw Error('Native field bridge returned invalid float data.');}
 else if(expected.format==='u8'){if(!(data instanceof Uint8Array)||data.length!==expected.width*expected.height*expected.channels)throw Error('Native field bridge returned invalid byte data.');}
 else if(expected.format==='vegetation-json'){if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Native vegetation bridge returned invalid records.');}
 else throw Error('Unsupported native resource format.');
 return {ref:result.ref,data};
}
export class NativeIslandParentReader{
 constructor(project,{target=parent,eventTarget=window,origin=location.origin,timeoutMs=10000}={}){
  Object.assign(this,{target,eventTarget,origin,timeoutMs});this.refs=new Map([...project.nativeIsland.resources,...project.nativeIsland.assets].map(r=>[r.id,r]));this.pending=new Map();this.closed=false;
  this.receive=e=>{if(e.origin!==this.origin||e.source!==this.target||e.data?.type!=='elsemesh-native-island-resource')return;const task=this.pending.get(e.data.requestId);if(!task)return;this.pending.delete(e.data.requestId);clearTimeout(task.timer);try{if(e.data.error)throw Error(String(e.data.error));task.resolve(validateNativeBridgeResource(task.ref,e.data.result));}catch(error){task.reject(error);}};
  eventTarget.addEventListener('message',this.receive);
 }
 read(id){const ref=this.refs.get(id);if(this.closed||!ref)return Promise.reject(Error('Native resource unavailable for this preview revision.'));if(this.pending.size>=16)return Promise.reject(Error('Native resource bridge limit.'));
  return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('Native resource bridge timed out.'));},this.timeoutMs);this.pending.set(requestId,{ref,resolve,reject,timer});try{this.target.postMessage({type:'elsemesh-native-island-read',requestId,id},this.origin);}catch(error){clearTimeout(timer);this.pending.delete(requestId);reject(error);}});
 }
 dispose(){if(this.closed)return;this.closed=true;this.eventTarget.removeEventListener('message',this.receive);for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error('Native preview revision cancelled.'));}this.pending.clear();}
}
export async function buildNativeIslandPreview(project,camera,water,reader){
 try{const candidate=await buildRepositoryScene(describeRuntimeWorld(project),camera,{nativeIsland:{readNativeIsland:()=>readNativeIslandSource(project,id=>reader.read(id)),water}});
  let disposed=false;return {...candidate,dispose(){if(disposed)return;disposed=true;reader.dispose();disposeRepositoryScene(candidate);}};
 }catch(error){reader.dispose();throw error;}
}
