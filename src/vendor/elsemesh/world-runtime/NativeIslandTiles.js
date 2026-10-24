// A bounded, shared CPU cache. Readers verify source bytes before returning decoded tiles.
// Render fields occupy full-domain GPU textures; this class does not claim sparse GPU residency.
export class NativeIslandTiles {
 constructor({tiles,readTile,maxConcurrency=3,maxBytes=64*1024*1024,onLoad=()=>{},onEvict=()=>{}}){
  if(!Array.isArray(tiles)||typeof readTile!=='function')throw Error('Native island tiles require an index and reader.');
  if(!Number.isInteger(maxConcurrency)||maxConcurrency<1||!Number.isFinite(maxBytes)||maxBytes<=0)throw Error('Invalid native tile budget.');
  Object.assign(this,{tiles,readTile,maxConcurrency,maxBytes,onLoad,onEvict});this.entries=new Map();this.queue=[];this.running=0;this.bytes=0;this.clock=0;this.disposed=false;this.inflight=new Set();this.failures=[];
 }
 request(tile){
  if(this.disposed)return Promise.reject(Error('Native tile cache disposed.'));
  const key=typeof tile==='string'?tile:tile.id;let entry=this.entries.get(key);
  if(entry){entry.used=++this.clock;return entry.promise;}
  tile=this.tiles.find(t=>t.id===key);if(!tile)return Promise.reject(Error('Unknown native tile '+key));
  entry={tile,refs:0,used:++this.clock,data:null,bytes:0};entry.promise=new Promise((resolve,reject)=>Object.assign(entry,{resolve,reject}));
  this.entries.set(key,entry);this.queue.push(entry);this.pump();return entry.promise;
 }
 pump(){
  while(!this.disposed&&this.running<this.maxConcurrency&&this.queue.length){const entry=this.queue.shift();this.running++;
   const controller=new AbortController();this.inflight.add(controller);
   Promise.resolve().then(()=>this.readTile(entry.tile,{signal:controller.signal})).then(data=>{
    if(this.disposed)throw Error('Native tile cache disposed.');
    const bytes=data.byteLength??Object.values(data.fields??data).reduce((s,v)=>s+(v?.byteLength??0),0);
    if(!Number.isFinite(bytes)||bytes<=0||bytes>this.maxBytes)throw Error('Native tile exceeds the CPU cache budget.');
    this.trim(bytes,entry);
    if(this.bytes+bytes>this.maxBytes)throw Error('Native tile cache is pinned beyond its byte budget.');
    entry.data=data;entry.bytes=bytes;this.bytes+=bytes;this.onLoad(entry.tile,data);entry.resolve(data);
   }).catch(error=>{if(entry.data){this.bytes-=entry.bytes;entry.data=null;}this.entries.delete(entry.tile.id);entry.reject(error);if(!this.disposed)this.failures.push({id:entry.tile.id,message:error.message});}).finally(()=>{this.running--;this.inflight.delete(controller);this.pump();});
  }
 }
 trim(incoming=0,except=null){
  const candidates=[...this.entries.values()].filter(e=>e!==except&&e.data&&!e.refs).sort((a,b)=>a.used-b.used);
  for(const e of candidates){if(this.bytes+incoming<=this.maxBytes)break;this.onEvict(e.tile,e.data);this.entries.delete(e.tile.id);this.bytes-=e.bytes;}
 }
 async retain(tiles){
  const entries=[];try{for(const tile of tiles){const promise=this.request(tile),entry=this.entries.get(tile.id??tile);entry.refs++;entries.push(entry);await promise;}}
  catch(error){for(const e of entries)e.refs--;throw error;}
  let released=false;return()=>{if(released)return;released=true;for(const e of entries)e.refs--;this.trim();};
 }
 at(x,z){return this.tiles.filter(t=>x>=t.bounds[0]&&z>=t.bounds[1]&&x<t.bounds[2]&&z<t.bounds[3]);}
 readyAt(x,z){const tiles=this.at(x,z);return tiles.length>0&&tiles.every(t=>!!this.entries.get(t.id)?.data);}
 async ensureAt(x,z,radius=2){
  const tiles=this.tiles.filter(t=>t.bounds[0]<=x+radius&&t.bounds[2]>=x-radius&&t.bounds[1]<=z+radius&&t.bounds[3]>=z-radius);
  if(!tiles.length)throw Error('Arrival is outside native terrain.');return this.retain(tiles);
 }
 requestView(x,z,radius=220,visible=()=>true){const tiles=this.tiles.filter(t=>visible(t)&&t.bounds[0]<=x+radius&&t.bounds[2]>=x-radius&&t.bounds[1]<=z+radius&&t.bounds[3]>=z-radius).sort((a,b)=>Math.hypot((a.bounds[0]+a.bounds[2])/2-x,(a.bounds[1]+a.bounds[3])/2-z)-Math.hypot((b.bounds[0]+b.bounds[2])/2-x,(b.bounds[1]+b.bounds[3])/2-z));for(const tile of tiles.slice().reverse())if(this.entries.has(tile.id))this.request(tile).catch(()=>{});for(const tile of tiles)if(!this.entries.has(tile.id))this.request(tile).catch(()=>{});}
 stats(){return{residentTiles:[...this.entries.values()].filter(e=>e.data).length,bytes:this.bytes,maxBytes:this.maxBytes,running:this.running,queued:this.queue.length,failures:this.failures.slice(-8),gpuSparse:false};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const c of this.inflight)c.abort();for(const e of this.queue)e.reject(Error('Native tile cache disposed.'));this.queue=[];for(const e of this.entries.values())if(e.data)this.onEvict(e.tile,e.data);this.entries.clear();this.bytes=0;}
}
