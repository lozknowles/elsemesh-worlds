import { useEffect, useRef, useState } from 'react';
import type { NeonRuntimeState } from './NeonRuntime';
import type { WorldProject } from '../domain/world';
import { createThunderAudio } from './thunderAudio';
import './NativePreview.css';

export default function NativePreview({ project, onChange, onClose, neonRuntime, serverOffsetMs = 0 }: {
  project: WorldProject;
  neonRuntime?: Record<string,NeonRuntimeState>;
  serverOffsetMs?: number;
  onChange: (update: (project: WorldProject) => WorldProject) => void;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading native WebGPU engine…');
  const audio = useRef<ReturnType<typeof createThunderAudio> | null>(null);
  const [sound, setSound] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navigation, setNavigation] = useState({ speed: 0, clearance: 0, speedMultiplier: 1, blocked: false });
  const [vegetation, setVegetation] = useState<{ sourceTrees: number; highDetailTrees: number; lowDetailTrees: number } | null>(null);
  useEffect(() => {
    const stopNavigation = () => frame.current?.contentWindow?.postMessage({ type: 'elsemesh-native-navigation', action: 'stop' }, location.origin);
    // Focusing the child canvas also blurs its parent window. The child owns
    // its own blur reset; do not cancel the wheel gesture that just focused it.
    const parentBlur = () => queueMicrotask(() => { if (document.activeElement !== frame.current) stopNavigation(); });
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'elsemesh-native-ready') { setReady(true); setStatus('Native ElseMesh sky and clouds'); }
      if (event.data?.type === 'elsemesh-native-error') setStatus(event.data.message);
      if (event.data?.type === 'elsemesh-native-thunder') audio.current?.play();
      if (event.data?.type === 'elsemesh-native-navigation-state' && event.data.navigation) setNavigation(event.data.navigation);
      if (event.data?.type === 'elsemesh-native-quality' && event.data.trees) setVegetation(event.data.trees);
    };
    window.addEventListener('message', receive);
    window.addEventListener('blur', parentBlur);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('blur', parentBlur); stopNavigation(); audio.current?.close(); audio.current=null; };
  }, []);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ type: 'elsemesh-native-project', project }, location.origin);
  }, [ready, project]);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({type:'elsemesh-native-neon-runtime',states:neonRuntime ?? {},serverOffsetMs},location.origin);
  },[ready,neonRuntime,serverOffsetMs]);
  const change = (key: string, value: number) => onChange(p => ({ ...p, environment: { ...p.environment, [key]: value } }));
  const navigate = (action: string, extra: { value?: number; code?: string } = {}) => frame.current?.contentWindow?.postMessage({ type: 'elsemesh-native-navigation', action, ...extra }, location.origin);
  const controls = [
    { key: 'timeOfDay', label: 'Time of day', min: 0, max: 24, step: .05, value: project.environment.timeOfDay ?? 14, unit: 'h' },
    { key: 'cloudCoverage', label: 'Cloud coverage', min: 0, max: 1, step: .01, value: project.environment.cloudCoverage ?? .49, unit: '' },
    { key: 'mistDensity', label: 'Drifting mist', min: 0, max: .04, step: .001, value: project.environment.mistDensity ?? .004, unit: '' },
    { key: 'mistSpeed', label: 'Mist wind speed', min: 0, max: 15, step: .25, value: project.environment.mistSpeed ?? 2, unit: 'm/s' },
    { key: 'mistHeight', label: 'Mist vertical reach', min: 1, max: 50, step: 1, value: project.environment.mistHeight ?? 9, unit: 'm' },
    { key: 'rainIntensity', label: 'Rain intensity', min: 0, max: 1, step: .05, value: project.environment.rainIntensity ?? .7, unit: '' },
    { key: 'windSpeed', label: 'Weather wind speed', min: 0, max: 30, step: .5, value: project.environment.windSpeed ?? 6, unit: 'm/s' },
  ];
  return <div className="native-preview">
    <iframe ref={frame} src="/native-preview.html" title="ElseMesh native WebGPU preview" />
    <div className="native-controls">
      <div><b>ELSEMESH GRAPHICS</b><button onClick={onClose}>Back to editor ×</button></div>
      <div className="native-navigation-actions"><button onClick={() => navigate('overview')}>Overview</button><button onClick={() => navigate('spawn')}>Return to spawn</button><button onClick={() => navigate('recenter')}>Recenter</button></div>
      <label className="native-flight-speed">Flying speed<select aria-label="Flying speed multiplier" value={navigation.speedMultiplier} onChange={event => { const value = Number(event.target.value); setNavigation(state => ({ ...state, speedMultiplier: value })); navigate('speed', { value }); }}>{[0.25, 0.5, 1, 2, 4, 8].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <output className={`native-flight-telemetry ${navigation.blocked ? 'blocked' : ''}`} aria-label="Flight telemetry">{navigation.speed.toFixed(0)} m/s · {navigation.clearance.toFixed(1)} m above terrain{navigation.blocked ? ' · Terrain stopped movement' : ''}</output>
      <small className="native-flight-help">Drag to look. Wheel zooms along your view. WASD flies where you look; Q/E down/up; Shift boosts. Speed adapts to height above the ground.</small>
      {vegetation && <small className="native-vegetation-quality">Vegetation preview: {vegetation.highDetailTrees} detailed, {vegetation.lowDetailTrees} distant silhouettes · {vegetation.sourceTrees} tree objects.</small>}
      <details className="native-touch-controls"><summary>On-screen movement</summary><div>{[{ code: 'KeyW', name: 'Forward' }, { code: 'KeyS', name: 'Back' }, { code: 'KeyA', name: 'Left' }, { code: 'KeyD', name: 'Right' }, { code: 'KeyE', name: 'Up' }, { code: 'KeyQ', name: 'Down' }].map(control => <button key={control.code} aria-label={`Fly ${control.name.toLowerCase()}`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); navigate('hold', { code: control.code }); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); navigate('release', { code: control.code }); }} onPointerCancel={() => navigate('stop')} onLostPointerCapture={() => navigate('release', { code: control.code })} onBlur={() => navigate('stop')} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); navigate('hold', { code: control.code }); } }} onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') navigate('release', { code: control.code }); }}>{control.name}</button>)}</div></details>
      <button className="native-controls-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value=>!value)}>{collapsed?'Show controls':'Hide controls'}</button>
      {!collapsed && <>
      <p>{status}</p>
      <label>Weather<select aria-label="Weather" value={project.environment.weather ?? 'clear'} onChange={e => onChange(p => ({...p,environment:{...p.environment,weather:e.target.value as 'clear'|'rain'|'storm',...(e.target.value==='storm'?{cloudCoverage:Math.max(.88,p.environment.cloudCoverage??.49)}:{})}}))}><option value="clear">Clear</option><option value="rain">Rain</option><option value="storm">Thunderstorm</option></select></label>
      {controls.map(control => <label key={control.key}>{control.label}<span>{control.value.toFixed(control.step < .01 ? 3 : 2)} {control.unit}</span><input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={control.value} onChange={e => change(control.key, Number(e.target.value))} /></label>)}
      <button aria-pressed={sound} onClick={() => { if(audio.current) {audio.current.close();audio.current=null;setSound(false);} else {audio.current=createThunderAudio();setSound(true);} }}>{sound?'Mute thunder audio':'Enable thunder audio'}</button>
      <small>Sky and clouds use ElseMesh. Mist, rain, lightning and flowing water are builder effects; selecting Thunderstorm initially increases cloud cover; the cloud slider then controls it directly. Mist fades above the lowest terrain elevation; vertical reach controls how far it rises into the valley. Navigation clears on lost focus and stops above terrain; it does not collide with trees or buildings. GLBs preserve material slots, per-object overrides and embedded base-color textures. Normal/ORM/AO/emissive texture maps are omitted; static meshes only.</small>
      </>}
    </div>
  </div>;
}
