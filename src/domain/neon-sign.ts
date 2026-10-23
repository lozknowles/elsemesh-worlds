import { Color } from 'three';
export const NEON_SIGN_SCHEMA='elsemesh.neon-sign/1';
export const NEON_FONTS=['helvetiker','optimer'] as const;
export const NEON_EFFECTS=['steady','flicker','pulse','flash','sequence','colour-cycle','faulty','timed'] as const;
export type NeonSignConfig={
 schema:typeof NEON_SIGN_SCHEMA;text:string;font:typeof NEON_FONTS[number];size:number;depth:number;tubeThickness:number;letterSpacing:number;lineHeight:number;align:'left'|'center'|'right';
 color:string;secondaryColor:string;brightness:number;glow:number;backing:'none'|'panel';backingColor:string;frame:boolean;doubleSided:boolean;
 mounting:'wall'|'hanging'|'freestanding';quality:'low'|'medium'|'high';powered:boolean;
 effect:{mode:typeof NEON_EFFECTS[number];speed:number;intensity:number;dutyCycle:number;seed:number;startHour:number;endHour:number};
};
export function defaultNeonSign(text='THE RED LION'):NeonSignConfig{return{schema:NEON_SIGN_SCHEMA,text,font:'helvetiker',size:1,depth:.06,tubeThickness:.025,letterSpacing:.04,lineHeight:1.4,align:'center',color:'#ff3ea5',secondaryColor:'#35ddff',brightness:2,glow:.6,backing:'panel',backingColor:'#10101c',frame:true,doubleSided:false,mounting:'wall',quality:'medium',powered:true,effect:{mode:'steady',speed:1,intensity:1,dutyCycle:.5,seed:7319,startHour:18,endHour:6}};}
export function validateNeonSign(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return['Neon configuration must be an object.'];
 const c=value as NeonSignConfig,errors:string[]=[];
 const allowed=['schema','text','font','size','depth','tubeThickness','letterSpacing','lineHeight','align','color','secondaryColor','brightness','glow','backing','backingColor','frame','doubleSided','mounting','quality','powered','effect'];
 if(Object.keys(c).some(key=>!allowed.includes(key)))errors.push('Unknown neon configuration field.');
 if(c.schema!==NEON_SIGN_SCHEMA)errors.push('Unsupported neon configuration schema.');
 if(typeof c.text!=='string'||!c.text.trim()||[...c.text].length>80||c.text.split('\n').length>3||[...c.text].some(character=>{const point=character.codePointAt(0)!;return(point<32&&point!==10)||point===127;}))errors.push('Neon text needs 1–80 codepoints and at most 3 lines.');
 if(!NEON_FONTS.includes(c.font))errors.push('Choose a bundled neon font.');
 const limits={size:[.1,5],depth:[.01,.5],tubeThickness:[.01,.15],letterSpacing:[0,1],lineHeight:[1,3],brightness:[0,8],glow:[0,2]} as const;
 for(const [k,[min,max]]of Object.entries(limits)){const n=c[k as keyof typeof limits];if(!Number.isFinite(n)||n<min||n>max)errors.push('Invalid neon '+k+'.');}
 for(const k of ['color','secondaryColor','backingColor'] as const)if(typeof c[k]!=='string'||!/^#[0-9a-f]{6}$/i.test(c[k]))errors.push('Invalid neon '+k+'.');
 for(const k of ['frame','doubleSided','powered'] as const)if(typeof c[k]!=='boolean')errors.push('Invalid neon '+k+'.');
 if(!['left','center','right'].includes(c.align)||!['none','panel'].includes(c.backing)||!['wall','hanging','freestanding'].includes(c.mounting)||!['low','medium','high'].includes(c.quality))errors.push('Invalid neon style.');
 const e=c.effect;
 if(!e||typeof e!=='object'||!NEON_EFFECTS.includes(e.mode))errors.push('Invalid neon effect.');
 else {
  if(Object.keys(e).some(key=>!['mode','speed','intensity','dutyCycle','seed','startHour','endHour'].includes(key)))errors.push('Unknown neon effect field.');
  for(const [k,min,max]of [['speed',.1,10],['intensity',0,1],['dutyCycle',.05,.95],['seed',0,0xffffffff],['startHour',0,24],['endHour',0,24]] as const){const n=e[k];if(!Number.isFinite(n)||n<min||n>max)errors.push('Invalid neon effect '+k+'.');}
  if(!Number.isInteger(e.seed))errors.push('Neon effect seed must be an integer.');
 }
 return errors;
}
export type NeonEffectSample={brightness:number;color:string;litGlyphs?:number};
const noise=(step:number,seed:number)=>{let n=(Math.imul(step|0,374761393)^seed)>>>0;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
/** Pure simulation: caller supplies elapsed seconds and world hour; no authored mutation. */
export function sampleNeonEffect(c:NeonSignConfig,timeSeconds:number,worldHour:number):NeonEffectSample{
 const time=Number.isFinite(timeSeconds)?Math.max(0,timeSeconds):0,hour=Number.isFinite(worldHour)?((worldHour%24)+24)%24:12,e=c.effect,phase=time*e.speed,fraction=phase%1;
 let brightness=c.powered?c.brightness:0,color=c.color,litGlyphs:number|undefined;
 switch(e.mode){
  case'pulse':brightness*=.2+.8*(.5-.5*Math.cos(phase*Math.PI*2));break;
  case'flash':brightness*=fraction<e.dutyCycle?1:0;break;
  case'flicker':brightness*=noise(Math.floor(phase*12),e.seed)<.12?.08:.8+.2*noise(Math.floor(phase*20),e.seed+1);break;
  case'faulty':brightness*=noise(Math.floor(phase*3),e.seed)<.3?noise(Math.floor(phase*24),e.seed+2)<.5?0:.18:1;break;
  case'sequence':litGlyphs=Math.min([...c.text].filter(x=>x!=='\n').length,Math.floor(fraction*([...c.text].filter(x=>x!=='\n').length+1)));break;
  case'colour-cycle':{const amount=.5-.5*Math.cos(phase*Math.PI*2);color='#'+new Color(c.color).lerp(new Color(c.secondaryColor),amount).getHexString();break;}
  case'timed':{const start=e.startHour%24,end=e.endHour%24;brightness*=start===end|| (start<end?hour>=start&&hour<end:hour>=start||hour<end)?1:0;break;}
 }
 if(['pulse','flash','flicker','faulty'].includes(e.mode))brightness=(c.powered?c.brightness:0)*(1-e.intensity)+brightness*e.intensity;
 return{brightness,color,...(litGlyphs!==undefined?{litGlyphs}:{})};
}

export const NEON_PRESETS:{id:string;name:string;config:NeonSignConfig}[]=['OPEN','CLOSED','WELCOME','BAR','PUB','CAFE','HOTEL','RESTAURANT','SHOP','VACANCIES','EXIT','Custom Text'].map((text,i)=>({id:text.toLowerCase().replace(' ','-'),name:text,config:{...defaultNeonSign(i===11?'YOUR TEXT':text),font:i%3===0?'optimer':'helvetiker',color:['#ff3ea5','#35ddff','#ffd166'][i%3]!}}));
export const NEON_PREFAB_SCHEMA='elsemesh.neon-prefab/1';
export function createNeonPrefab(config:NeonSignConfig){const errors=validateNeonSign(config);if(errors.length)throw new Error(errors.join(' '));return{schema:NEON_PREFAB_SCHEMA,config:structuredClone(config)};}
export function parseNeonPrefab(value:unknown):NeonSignConfig{if(!value||typeof value!=='object'||(value as {schema?:unknown}).schema!==NEON_PREFAB_SCHEMA)throw new Error('Unsupported neon prefab.');const config=(value as {config:unknown}).config,errors=validateNeonSign(config);if(errors.length)throw new Error(errors.join(' '));return structuredClone(config) as NeonSignConfig;}
