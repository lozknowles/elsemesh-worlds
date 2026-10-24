// Converts the validated versioned repository contract to installed renderer fields.
// readResource is the installed hash-verifying reader; no fetched code is evaluated.
export async function readNativeIslandSource(project,readResource,{maxConcurrency=4}={}){
 const native=project.nativeIsland;if(native?.schema!=='elsemesh.native-island/1'||typeof readResource!=='function')throw Error('Unsupported native island source.');
 if(native.vegetationRecipe!=='elsemesh.native-vegetation/1')throw Error('Unsupported native vegetation recipe.');
 const {grid,resources}=native;if(grid.origin[0]!==grid.origin[1]||grid.size!==grid.resolution)throw Error('Native island renderer requires a square one metre source grid.');
 if(!Number.isInteger(maxConcurrency)||maxConcurrency<1||maxConcurrency>16)throw Error('Invalid native resource concurrency.');
 let disposed=false,running=0,readBytes=0,reads=0;const queue=[];const pump=()=>{while(!disposed&&running<maxConcurrency&&queue.length){const {ref,resolve,reject}=queue.shift();running++;Promise.resolve().then(()=>readResource(ref.id)).then(decoded=>{readBytes+=ref.bytes;reads++;resolve(decoded.data);},reject).finally(()=>{running--;pump();});}};
 const read=ref=>new Promise((resolve,reject)=>{if(disposed){reject(Error('Native source disposed.'));return;}queue.push({ref,resolve,reject});pump();});
 const refs=(channel,level)=>resources.filter(r=>r.channel===channel&&(level===undefined||r.level===level));
 async function field(channel,level){const list=refs(channel,level);if(!list.length)throw Error('Missing native '+channel+' field.');const n=grid.resolution/2**level,channels=list[0].channels;const out=list[0].format==='f32le'?new Float32Array(n*n*channels):new Uint8Array(n*n*channels);
  await Promise.all(list.map(async ref=>{const data=await read(ref);for(let z=0;z<ref.height;z++)out.set(data.subarray(z*ref.width*channels,(z+1)*ref.width*channels),((ref.z+z)*n+ref.x)*channels);}));return{res:n,data:out};
 }
 const coarseLevels=refs('height').map(r=>r.level).filter(level=>refs('normal',level).length&&refs('splat',level).length);const level=Math.max(...coarseLevels);if(!Number.isFinite(level))throw Error('Native terrain needs captured height, normal and splat pyramids.');
 const [heights,normal,splat,shore,grass,vegetation]=await Promise.all([field('height',level),field('normal',level),field('splat',level),field('shore',Math.max(...refs('shore').map(r=>r.level))),field('grass',Math.max(...refs('grass').map(r=>r.level))),Promise.all(refs('vegetation').map(read))]);
 const expectedLod={palmNear:120,treeNear:65,shrubNear:45,underFade:[120,140],fernFade:[42,58],broadFade:[85,105],bananaFade:[100,120],canopyFar:[2600,2800],band:.12};
 const names=['palms','trees','bananas','shrubs','youngPalms','ferns','monsteras','elephantEars','heliconias','strelitzias'];const records=Object.fromEntries(names.map(name=>[name,[]]));
 for(const payload of vegetation){if(payload.lod&&Object.entries(expectedLod).some(([key,value])=>JSON.stringify(payload.lod[key])!==JSON.stringify(value)))throw Error('Unsupported native vegetation LOD recipe.');records.villagePalms=(records.villagePalms??0)+(payload.villagePalms??0);const groups=payload.records??payload;for(const name of names){if(!Array.isArray(groups[name]))throw Error('Native vegetation omits '+name);for(const record of groups[name])records[name].push(record);}}
 const fine=refs('height',0),tiles=fine.map(ref=>({id:ref.id,x:ref.x,z:ref.z,width:ref.width,height:ref.height,minHeight:ref.min,maxHeight:ref.max,bounds:[grid.origin[0]+ref.x,grid.origin[1]+ref.z,grid.origin[0]+ref.x+ref.width,grid.origin[1]+ref.z+ref.height]}));
 const companion=(channel,tile)=>refs(channel,0).find(r=>r.x===tile.x&&r.z===tile.z&&r.width===tile.width&&r.height===tile.height);
 for(const tile of tiles)if(!companion('normal',tile)||!companion('splat',tile))throw Error('Native fine tile lacks captured shading fields.');
 return{vegetationTextures:native.vegetationTextures,barkAssets:native.assets,readAsset:async id=>{const ref=native.assets?.find(a=>a.id===id);if(!ref)throw Error('Unknown native asset.');return read(ref);},domain:{res:grid.resolution,size:grid.size,origin:grid.origin[0]},coarse:{res:heights.res,heights:heights.data,normal:normal.data,splat:splat.data},shore,grassMask:grass,records,tiles,
  readTile:async tile=>{const ref=fine.find(r=>r.id===tile.id);const [heights,normal,splat]=await Promise.all([read(ref),read(companion('normal',tile)),read(companion('splat',tile))]);return{fields:{heights,normal,splat}};},
  dispose(){if(disposed)return;disposed=true;for(const task of queue)task.reject(Error('Native source disposed.'));queue.length=0;},
  appearance:native.sea.appearance,ocean:native.sea,sourceStats:()=>({readBytes,reads,queued:queue.length,running,coarseLevel:level,vegetationRecordsResident:true}),
 };
}
