import { Box3, BoxGeometry } from 'three';
import type { BufferGeometry } from 'three';
import type { Vec3 } from './world';
export const COMPUTER_SCHEMA='elsemesh.computer/1';
export const MAX_COMPUTERS=32;
export type ComputerConfig={schema:typeof COMPUTER_SCHEMA;targetSignId?:string;screenColor:string};
export function defaultComputer(targetSignId?:string):ComputerConfig{return{schema:COMPUTER_SCHEMA,...(targetSignId?{targetSignId}:{}),screenColor:'#39ff88'};}
export function validateComputer(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return['Computer configuration must be an object.'];
 const c=value as ComputerConfig,errors:string[]=[];
 if(c.schema!==COMPUTER_SCHEMA)errors.push('Unsupported computer configuration schema.');
 if(Object.keys(c).some(k=>!['schema','targetSignId','screenColor'].includes(k)))errors.push('Unknown computer configuration field.');
 if(c.targetSignId!==undefined&&(typeof c.targetSignId!=='string'||!c.targetSignId.trim()||c.targetSignId.length>120))errors.push('Computer sign reference must contain 1–120 characters.');
 if(typeof c.screenColor!=='string'||!/^#[0-9a-f]{6}$/i.test(c.screenColor))errors.push('Computer screen colour must be a six digit hex colour.');
 return errors;
}
export type ComputerGeometry={parts:{name:string;geometry:BufferGeometry;color:string;emissive?:boolean}[];bounds:{min:Vec3;max:Vec3}};
/** Shared metre-scale desk prop. Base Y=0; screen faces +Z. No external resources. */
export function buildComputerGeometry():ComputerGeometry{
 const box=(name:string,size:Vec3,position:Vec3,color:string,emissive=false)=>({name,geometry:new BoxGeometry(...size).translate(...position),color,...(emissive?{emissive:true}:{})});
 const parts=[
  box('base',[.44,.045,.3],[0,.0225,-.1],'#1b2028'),
  box('post',[.075,.27,.075],[0,.18,-.12],'#373e48'),
  box('monitor',[.9,.52,.09],[0,.54,-.1],'#1b2028'),
  box('screen',[.8,.42,.012],[0,.54,-.048],'#39ff88',true),
  box('keyboard',[.64,.045,.19],[0,.0225,.25],'#282e38'),
  ...Array.from({length:3},(_,row)=>box('keys-'+row,[.56,.008,.025],[0,.049,.2+row*.04],'#626d7a'))
 ];
 const bounds=new Box3();for(const part of parts){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox!);}
 return{parts,bounds:{min:bounds.min.toArray() as Vec3,max:bounds.max.toArray() as Vec3}};
}
export function disposeComputerGeometry(value:ComputerGeometry):void{for(const part of value.parts)part.geometry.dispose();}
export const COMPUTER_BOUNDS={min:[-.45,0,-.25] as Vec3,max:[.45,.8,.345] as Vec3};

