import {nativeLandscapeSurface} from './RepositoryLandscapeSurface.js';
import { Material } from '../engine/render/Material.js';
import { Texture } from '../engine/gpu/Texture.js';
import { GPU } from '../engine/gpu/GPU.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';

/** EPSG:27700 imagery drape. Local east is +X and north is -Z. Image row zero
 * is its northern edge; imagery outside its own bounds never stretches. */
export async function createNativeTerrainMaterial(project) {
  const landscape=await nativeLandscapeSurface(project);
  const fallback=()=>new Material({name:'builder-terrain',color:'#ffffff',roughness:.92,vertexColors:true,side:'double',textures:landscape.textures,uniforms:landscape.uniforms,surface:landscape.surface});
  const image=project.terrainImagery, geography=project.geography;
  if(!image||!geography) return {material:fallback(),diagnostics:{imagery:false,landscape:landscape.diagnostics},dispose:landscape.dispose};
  let texture, bitmap;
  try {
    if(image.crs!=='EPSG:27700'||geography.crs!=='EPSG:27700') throw new Error('Imagery and terrain must use EPSG:27700.');
    const response=await fetch(image.dataUrl);
    bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
    if(bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>32_000_000) throw new Error('Terrain imagery exceeds the decoded image limit.');
    texture=new Texture({label:'builder-terrain-imagery',width:bitmap.width,height:bitmap.height,format:'rgba8unorm-srgb',mips:true,usage:['sample','copyDst']});
    GPU.queue.copyExternalImageToTexture({source:bitmap},{texture:texture.getGPU(),premultipliedAlpha:false},[bitmap.width,bitmap.height]);
    generateMipmaps(texture);
    const west=image.bounds.west-geography.center.easting;
    const northZ=geography.center.northing-image.bounds.north;
    const width=image.bounds.east-image.bounds.west, depth=image.bounds.north-image.bounds.south;
    const material=new Material({name:'builder-geographic-terrain',color:'#ffffff',roughness:.92,vertexColors:true,side:'double',textures:{terrainImagery:texture,...landscape.textures},uniforms:{...landscape.uniforms,imageryRect:['vec4f',[west,northZ,width,depth]]},surface:/* wgsl */`
  let imageryUV=(in.P.xz-mat.imageryRect.xy)/mat.imageryRect.zw;
  let imageryDx=dpdx(imageryUV); let imageryDy=dpdy(imageryUV);
  if(all(imageryUV>=vec2f(0.0)) && all(imageryUV<=vec2f(1.0))) {
    let image=textureSampleGrad(terrainImagery,smpAnisoClamp,imageryUV,imageryDx,imageryDy);
    s.albedo=mix(s.albedo,image.rgb,image.a);
  }
`+landscape.surface});
    return {material,diagnostics:{imagery:true,landscape:landscape.diagnostics,pixels:[bitmap.width,bitmap.height],localBounds:{west,northZ,width,depth},sourceName:image.sourceName},dispose(){landscape.dispose();const destroy=()=>texture.destroy();if(GPU.encoder)GPU.onSubmit(null,destroy);else destroy();}};
  } catch(error) {
    if(texture) texture.destroy();
    return {material:fallback(),diagnostics:{imagery:false,landscape:landscape.diagnostics,error:error.message},dispose:landscape.dispose};
  } finally {bitmap?.close();}
}
