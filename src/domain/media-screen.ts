import {BoxGeometry} from 'three';
import type {BufferGeometry} from 'three';
export const MEDIA_SCREEN_SCHEMA='elsemesh.media-screen/1' as const;
export type MediaScreenConfig={schema:typeof MEDIA_SCREEN_SCHEMA;provider:'youtube';videoId:string;width:number};
export const YOUTUBE_VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
export function defaultMediaScreen(videoId='N-V7VpmoPkU'):MediaScreenConfig{return{schema:MEDIA_SCREEN_SCHEMA,provider:'youtube',videoId,width:6.4};}
export function validateMediaScreen(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return ['Media screen configuration must be an object.'];
 const c=value as MediaScreenConfig;
 return c.schema===MEDIA_SCREEN_SCHEMA&&c.provider==='youtube'&&typeof c.videoId==='string'&&YOUTUBE_VIDEO_ID.test(c.videoId)&&Number.isFinite(c.width)&&c.width>=.5&&c.width<=12&&Object.keys(c).every(k=>['schema','provider','videoId','width'].includes(k))?[]:['Media screen requires a fixed YouTube video ID and a width between 0.5 and 12 metres.'];
}
export function mediaScreenLayout(config:MediaScreenConfig){const errors=validateMediaScreen(config);if(errors.length)throw Error(errors[0]);const width=config.width,height=width*9/16,bezel=.09,depth=.2;return{width,height,bezel,depth,screenZ:depth/2+.012,bounds:{min:[-width/2-bezel,-height/2-bezel,-depth/2] as [number,number,number],max:[width/2+bezel,height/2+bezel,depth/2+.014] as [number,number,number]}};}
export function buildMediaScreenGeometry(config:MediaScreenConfig){
 const s=mediaScreenLayout(config),parts:{name:string;geometry:BufferGeometry;color:string;emissive?:boolean}[]=[
 {name:'TV housing',geometry:new BoxGeometry(s.width+2*s.bezel,s.height+2*s.bezel,s.depth),color:'#11151b'},
 {name:'TV screen',geometry:new BoxGeometry(s.width,s.height,.012).translate(0,0,s.screenZ),color:'#05090d',emissive:true},
 {name:'TV wall mount',geometry:new BoxGeometry(s.width*.26,s.height*.35,.12).translate(0,0,-s.depth/2-.05),color:'#252a30'}];
 return{parts,bounds:{...s.bounds,min:[s.bounds.min[0],s.bounds.min[1],-s.depth/2-.11] as [number,number,number]}};
}
export function disposeMediaScreenGeometry(value:ReturnType<typeof buildMediaScreenGeometry>){for(const part of value.parts)part.geometry.dispose();}
