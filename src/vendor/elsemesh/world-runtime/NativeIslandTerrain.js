// Captured cell-centred fields only. This adapter imports no procedural TerrainData.
export function sampleNativeField(field,res,origin,size,x,z,channels=1,channel=0,outside=-90){
 const fx=(x-origin)/size*res-.5,fz=(z-origin)/size*res-.5;
 if(fx<0||fz<0||fx>=res-1||fz>=res-1)return outside;
 const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j,k=(j*res+i)*channels;
 return (field[k+channel]*(1-tx)+field[k+channels+channel]*tx)*(1-tz)+(field[k+res*channels+channel]*(1-tx)+field[k+(res+1)*channels+channel]*tx)*tz;
}
export class NativeIslandTerrain {
 constructor({size,origin,res,coarse}){
  if(!Number.isFinite(size)||!Number.isFinite(origin)||!Number.isInteger(res)||res<4||res>4096)throw Error('Invalid native terrain domain.');
  Object.assign(this,{size,origin,res,texel:size/res});this.coarse=coarse;this.heights=new Float32Array(res*res);this.minHeight=Infinity;this.maxHeight=-Infinity;
  for(let z=0;z<res;z++)for(let x=0;x<res;x++){const h=sampleNativeField(coarse.heights,coarse.res,origin,size,origin+(x+.5)*this.texel,origin+(z+.5)*this.texel);this.heights[z*res+x]=h;this.minHeight=Math.min(this.minHeight,h);this.maxHeight=Math.max(this.maxHeight,h);}
  this.isNativeIsland=true;this.cache=null;
 }
 renderHeightAt(x,z){return sampleNativeField(this.heights,this.res,this.origin,this.size,x,z);}
 heightAt(x,z){return this.cache?.readyAt(x,z)?this.renderHeightAt(x,z):NaN;}
 normalAt(x,z,out){const e=this.texel,hx=this.renderHeightAt(x+e,z)-this.renderHeightAt(x-e,z),hz=this.renderHeightAt(x,z+e)-this.renderHeightAt(x,z-e);return out.set(-hx,2*e,-hz).normalize();}
 boundsFor(){return[this.minHeight-2,this.maxHeight+2];}
 apply(tile,data){const fields=data.fields??data;const heights=fields.heights;const width=tile.width??tile.res,height=tile.height??tile.res;
  if(!heights||heights.length!==width*height)throw Error('Native terrain tile has invalid heights.');
  for(let z=0;z<height;z++){this.heights.set(heights.subarray(z*width,(z+1)*width),(tile.z+z)*this.res+tile.x);for(const h of heights.subarray(z*width,(z+1)*width)){this.minHeight=Math.min(this.minHeight,h);this.maxHeight=Math.max(this.maxHeight,h);}}
 }
}
