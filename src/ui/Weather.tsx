import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldProject } from '../domain/world';
import { RAIN_PARTICLES, quadIndices, stormState, writeLightningQuad, writeRainQuads } from '../domain/weather';

// Builder weather, deliberately separate from the pristine ElseMesh snapshot.
export default function Weather({ environment }: { environment: WorldProject['environment'] }) {
  const { scene, camera } = useThree();
  const rain = useRef<THREE.Mesh>(null);
  const lightning = useRef<THREE.Mesh>(null);
  const flashLight = useRef<THREE.AmbientLight>(null);
  const weatherEpoch=useRef({mode:environment.weather,time:0});
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RAIN_PARTICLES*12),3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(quadIndices(RAIN_PARTICLES));
    geo.setDrawRange(0,0);
    return geo;
  }, []);
  const bolt = useMemo(() => {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*12),3).setUsage(THREE.DynamicDrawUsage));geo.setIndex(quadIndices(12));return geo;
  }, []);
  useEffect(() => () => { geometry.dispose(); bolt.dispose(); }, [geometry,bolt]);
  useEffect(() => {
    if(environment.weather !== 'storm') return;
    const background=scene.background, fog=scene.fog;
    scene.background=new THREE.Color('#344650');
    scene.fog=new THREE.Fog('#657782',35,180);
    return () => { scene.background=background;scene.fog=fog; };
  }, [environment.weather,scene]);
  useFrame(({ clock }) => {
    const time=clock.elapsedTime;
    const positions=geometry.getAttribute('position') as THREE.BufferAttribute;
    const count=writeRainQuads(positions.array as Float32Array,time,camera.position.toArray(),environment);
    geometry.setDrawRange(0,count*6); positions.needsUpdate=true;
    if(weatherEpoch.current.mode!==environment.weather) weatherEpoch.current={mode:environment.weather,time};
    const state=stormState(time-weatherEpoch.current.time,environment);
    if(rain.current) rain.current.visible=count>0;
    if(lightning.current) {
      lightning.current.visible=state.flash>.02;
      const attribute=bolt.getAttribute('position') as THREE.BufferAttribute;
      const yaw=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ').y;
      writeLightningQuad(attribute.array as Float32Array,camera.position.toArray(),yaw,environment.weatherSeed??7341,state.event);
      attribute.needsUpdate=true;
      (lightning.current.material as THREE.MeshBasicMaterial).opacity=state.flash;
    }
    if(flashLight.current) flashLight.current.intensity=state.flash*5;
  });
  return <>
    <mesh ref={rain} geometry={geometry} frustumCulled={false} renderOrder={20}>
      <meshBasicMaterial color="#c4e3ef" transparent opacity={.55} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
    <mesh ref={lightning} geometry={bolt} frustumCulled={false} renderOrder={21}>
      <meshBasicMaterial color="#e2ebff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
    <ambientLight ref={flashLight} color="#dbe5ff" intensity={0} />
  </>;
}
