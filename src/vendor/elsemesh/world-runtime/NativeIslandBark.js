import {Texture} from '../engine/gpu/Texture.js';
import {generateMipmaps} from '../engine/gpu/Mipmaps.js';
// Original six scanned maps are admitted repository resources, owned by this world.
export async function loadNativeIslandBark(source){
 if(!Array.isArray(source.barkAssets)||!source.vegetationTextures||typeof source.readAsset!=='function')throw Error('Native island requires its portable scanned bark resources.');
 const result={palm:{},tree:{}},owned=[];
 try{const settled=await Promise.allSettled(['palm','tree'].flatMap(set=>[['albedo','Diffuse'],['normal','nor_gl'],['orm','arm']].map(async ([slot,name])=>{
  const id=source.vegetationTextures[set]?.[slot],ref=source.barkAssets.find(asset=>asset.id===id);if(!ref||ref.mediaType!=='image/jpeg')throw Error('Missing original bark resource '+id);
  const bytes=await source.readAsset(id),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  try{if(bitmap.width!==ref.width||bitmap.height!==ref.height||bitmap.width>2048||bitmap.height>2048)throw Error('Bark resource dimensions do not match.');
   const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
   const texture=new Texture({label:id,width:bitmap.width,height:bitmap.height,format:name==='Diffuse'?'rgba8unorm-srgb':'rgba8unorm',mips:true,data:new Uint8Array(context.getImageData(0,0,bitmap.width,bitmap.height).data.buffer)});owned.push(texture);texture.getGPU();generateMipmaps(texture);result[set]['bark'+name]=texture;
  }finally{bitmap.close();}
 })));
 const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 return{...result,dispose(){for(const texture of owned)texture.destroy();}};
 }catch(error){for(const texture of owned)texture.destroy();throw error;}
}
