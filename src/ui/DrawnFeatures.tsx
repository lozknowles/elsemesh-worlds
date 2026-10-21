import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildFeatureGeometry } from '../domain/features';
import type { DrawnFeature, WorldProject } from '../domain/world';
import { isSimpleOutline } from '../domain/world';

function Feature({ feature, project, selected, onSelect, passive }: { feature: DrawnFeature; project: WorldProject; selected: boolean; onSelect: () => void; passive: boolean }) {
  const parts = useMemo(() => {
    const minimum = feature.kind === 'waterfall' ? 1 : ['shape', 'lake'].includes(feature.kind) ? 3 : 2;
    return feature.points.length >= minimum && (!['shape', 'lake'].includes(feature.kind) || isSimpleOutline(feature.points)) ? buildFeatureGeometry(feature, project) : [];
  }, [feature, project]);
  const materials = useMemo(() => parts.map((part) => {
    if (part.semantic !== 'water' && part.semantic !== 'foam') return new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.85, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(part.color) }, falling: { value: feature.kind === 'waterfall' ? 1 : 0 }, foam: { value: part.semantic === 'foam' ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float time; uniform vec3 tint; uniform float falling; uniform float foam; varying vec2 vUv;
        void main(){float flow=vUv.y-time*(falling>0.5?2.8:0.24); float ripple=sin(vUv.x*23.0+sin(flow*8.0))*sin(flow*19.0+vUv.x*6.0); float streak=pow(max(0.0,sin(vUv.x*65.0+flow*5.0)),5.0); vec3 color=tint+vec3(ripple*0.055+streak*(falling>0.5?0.25:0.07)); if(foam>0.5)color=mix(tint,vec3(1.0),0.25+0.2*ripple); gl_FragColor=vec4(color,1.0);}`,
      side: THREE.DoubleSide,
    });
  }), [parts, feature.kind]);
  useFrame(({ clock }) => materials.forEach((material) => { if (material instanceof THREE.ShaderMaterial) material.uniforms.time!.value = clock.elapsedTime; }));
  useEffect(() => () => { parts.forEach((part) => part.geometry.dispose()); materials.forEach((material) => material.dispose()); }, [parts, materials]);
  return <group>
    {parts.map((part, i) => <mesh key={i} geometry={part.geometry} material={materials[i]} receiveShadow onPointerDown={passive ? undefined : (event) => { event.stopPropagation(); onSelect(); }} raycast={passive ? () => {} : undefined} />)}
    {selected && feature.points.map((point, i) => <mesh key={i} position={point} raycast={() => {}} renderOrder={5}><sphereGeometry args={[0.28, 10, 8]} /><meshBasicMaterial color="#ffe5a0" depthTest={false} /></mesh>)}
    {selected && feature.points.length > 1 && <Line points={['shape', 'lake'].includes(feature.kind) ? [...feature.points, feature.points[0]!] : feature.points} color="#ffe5a0" lineWidth={1.5} raycast={() => {}} />}
  </group>;
}

export default function DrawnFeatures({ project, draft, selectedId, onSelect, editing }: { project: WorldProject; draft: DrawnFeature | null; selectedId: string | null; onSelect: (id: string) => void; editing: boolean }) {
  return <>
    {(project.features ?? []).map((feature) => <Feature key={feature.id} feature={feature} project={project} selected={editing && selectedId === feature.id} onSelect={() => onSelect(feature.id)} passive={!!draft || !editing} />)}
    {draft && <Feature feature={draft} project={project} selected onSelect={() => {}} passive />}
  </>;
}
