import type { ChangeEvent } from 'react';
import { NEON_PRESETS,NEON_FONTS,NEON_EFFECTS,parseNeonPrefab,createNeonPrefab } from '../domain/neon-sign';
import type { NeonSignConfig } from '../domain/neon-sign';
import { getNeonBounds } from '../domain/neon-geometry';
import './NeonDesigner.css';
const COLOURS={red:'#ff3030',pink:'#ff3ea5',blue:'#3399ff',amber:'#ffbf47',green:'#36ff82',purple:'#ba5cff',white:'#f4fbff'};
export default function NeonDesigner({config,onChange,onError,captureImportGuard}:{config:NeonSignConfig;onChange:(next:NeonSignConfig)=>void;onError:(message:string)=>void;captureImportGuard:()=>()=>boolean}){
 const set=(patch:Partial<NeonSignConfig>)=>onChange({...config,...patch});
 const effect=(patch:Partial<NeonSignConfig['effect']>)=>set({effect:{...config.effect,...patch}});
 const number=(label:string,key:'size'|'depth'|'tubeThickness'|'letterSpacing'|'lineHeight'|'brightness'|'glow',min:number,max:number,step=.01)=><label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={config[key]} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=min&&value<=max)set({[key]:value});}}/></label>;
 const effectNumber=(label:string,key:'speed'|'intensity'|'dutyCycle'|'seed'|'startHour'|'endHour',min:number,max:number,step=.1)=><label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={config.effect[key]} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=min&&value<=max)effect({[key]:value});}}/></label>;
 let dimensions:string,geometryError='';try{const b=getNeonBounds(config);dimensions=b.max.map((n,i)=>(n-b.min[i]!).toFixed(2)).join(' × ')+' m';}catch(error){geometryError=error instanceof Error?error.message:'Neon geometry unavailable';dimensions='Bounds unavailable';}
 const exportPreset=()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify(createNeonPrefab(config),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='neon-sign.neon.json';link.click();URL.revokeObjectURL(url);}catch(error){onError(error instanceof Error?error.message:'Could not export neon preset');}};
 const importPreset=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const canApply=captureImportGuard();try{if(file.size>64*1024)throw new Error('Neon presets are limited to 64 KiB.');const config=parseNeonPrefab(JSON.parse(await file.text()));if(!canApply())throw new Error('Neon preset import cancelled because the world or selection changed.');onChange(config);}catch(error){onError(error instanceof Error?error.message:'Invalid neon preset');}};
 return <section className="neon-designer" aria-label="Neon sign designer">
  <h3>Neon sign designer</h3>{geometryError&&<p role="alert">{geometryError}</p>}
  <label>Text preset<select aria-label="Neon text preset" value="" onChange={event=>{const preset=NEON_PRESETS.find(preset=>preset.id===event.target.value);if(preset)onChange(structuredClone(preset.config));}}><option value="">Choose a preset</option>{NEON_PRESETS.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
  <label>Sign text<textarea aria-label="Neon sign text" maxLength={80} rows={3} value={config.text} onChange={event=>{if(event.target.value.trim())set({text:event.target.value});}}/></label>
  <label>Visual style<select aria-label="Neon visual style" value="" onChange={event=>{
   const style=event.target.value;
   if(style==='traditional')set({font:'helvetiker',backing:'panel',frame:true,tubeThickness:.025});
   if(style==='retro-diner')set({font:'helvetiker',color:COLOURS.pink,secondaryColor:COLOURS.blue,backing:'panel',backingColor:'#151b2a',frame:true,tubeThickness:.04});
   if(style==='vintage-pub')set({font:'optimer',color:COLOURS.amber,backing:'panel',backingColor:'#14251b',frame:true,tubeThickness:.025});
   if(style==='minimalist')set({font:'helvetiker',backing:'none',frame:false,tubeThickness:.01});
   if(style==='multicolour')set({color:COLOURS.pink,secondaryColor:COLOURS.blue,effect:{...config.effect,mode:'colour-cycle'}});
  }}><option value="">Choose a supported style</option>{['traditional','retro-diner','vintage-pub','minimalist','multicolour'].map(style=><option key={style}>{style}</option>)}</select></label>
  <label>Colour preset<select aria-label="Neon colour preset" value={Object.entries(COLOURS).find(([,value])=>value===config.color)?.[0]??'custom'} onChange={event=>{const color=COLOURS[event.target.value as keyof typeof COLOURS];if(color)set({color});}}><option value="custom">Custom</option>{Object.keys(COLOURS).map(name=><option key={name}>{name}</option>)}</select></label>
  <label>Font<select aria-label="Neon font" value={config.font} onChange={event=>set({font:event.target.value as NeonSignConfig['font']})}>{NEON_FONTS.map(font=><option key={font}>{font}</option>)}</select></label>
  <label>Alignment<select aria-label="Neon alignment" value={config.align} onChange={event=>set({align:event.target.value as NeonSignConfig['align']})}>{['left','center','right'].map(value=><option key={value}>{value}</option>)}</select></label>
  <div className="neon-fields">{number('Letter size m','size',.1,5)}{number('Extrusion depth m','depth',.01,.5)}{number('Tube thickness m','tubeThickness',.01,.15)}{number('Letter spacing m','letterSpacing',0,1)}{number('Line height','lineHeight',1,3)}</div>
  <small>Front face is local +Z. Rotate the object or enable double sided. Unscaled bounds including mounts: {dimensions}. Use object transforms to position, rotate and scale the sign.</small>
  <div className="neon-fields"><label>Tube colour<input aria-label="Neon tube colour" type="color" value={config.color} onChange={event=>set({color:event.target.value})}/></label><label>Second colour<input aria-label="Neon second colour" type="color" value={config.secondaryColor} onChange={event=>set({secondaryColor:event.target.value})}/></label>{number('Neon brightness','brightness',0,8,.1)}{number('Neon glow','glow',0,2,.1)}</div>
  <label>Backing<select aria-label="Neon backing" value={config.backing} onChange={event=>set({backing:event.target.value as NeonSignConfig['backing']})}><option value="none">None</option><option value="panel">Panel</option></select></label>
  <label>Backing colour<input aria-label="Neon backing colour" type="color" value={config.backingColor} onChange={event=>set({backingColor:event.target.value})}/></label>
  <label>Mounting<select aria-label="Neon mounting" value={config.mounting} onChange={event=>set({mounting:event.target.value as NeonSignConfig['mounting']})}>{['wall','hanging','freestanding'].map(value=><option key={value}>{value}</option>)}</select></label>
  <label><input aria-label="Neon frame" type="checkbox" checked={config.frame} onChange={event=>set({frame:event.target.checked})}/> Frame</label><label><input aria-label="Double sided neon" type="checkbox" checked={config.doubleSided} onChange={event=>set({doubleSided:event.target.checked})}/> Double sided</label>
  <label>Quality<select aria-label="Neon quality" value={config.quality} onChange={event=>set({quality:event.target.value as NeonSignConfig['quality']})}>{['low','medium','high'].map(value=><option key={value}>{value}</option>)}</select></label>
  <label><input aria-label="Neon authored power" type="checkbox" checked={config.powered} onChange={event=>set({powered:event.target.checked})}/> Authored power on</label>
  <label>Effect<select aria-label="Neon effect" value={config.effect.mode} onChange={event=>effect({mode:event.target.value as NeonSignConfig['effect']['mode']})}>{NEON_EFFECTS.map(value=><option key={value}>{value}</option>)}</select></label>
  <div className="neon-fields">{effectNumber('Effect speed','speed',.1,10)}{effectNumber('Effect intensity','intensity',0,1)}{effectNumber('Effect duty cycle','dutyCycle',.05,.95,.05)}{effectNumber('Effect seed','seed',0,4294967295,1)}{effectNumber('Start hour','startHour',0,24)}{effectNumber('End hour','endHour',0,24)}</div>
  <p>Timed mode uses the world's authored hour. In local first-person preview, aim at the sign within 3 m and press E to toggle it. Walls block the interaction. Runtime toggles do not change the saved power setting.</p>
  <div className="neon-preset-actions"><button onClick={exportPreset}>Export neon preset</button><label className="button subdued">Import neon preset<input aria-label="Import neon preset" hidden type="file" accept=".json,.neon.json,application/json" onChange={event=>void importPreset(event)}/></label></div>
  <small>Reusable single-sign preset v1; no general behaviour graph, ownership or network authority. WebGL glow is a bounded, depth-tested shell fallback; it does not cast light on nearby surfaces.</small>
 </section>;
}
