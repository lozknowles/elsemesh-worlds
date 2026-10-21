import { Group, Mesh, BufferGeometry, BufferAttribute } from '../vendor/elsemesh/engine/index.js';
import { Material } from '../vendor/elsemesh/engine/render/Material.js';
import { RAIN_PARTICLES, quadIndices, stormState, writeLightningQuad, writeRainQuads } from '../domain/weather.ts';

export class NativeWeather {
  constructor() {
    this.group=new Group();
    const create=(count,color)=>{
      const geometry=new BufferGeometry();
      geometry.setAttribute('position',new BufferAttribute(new Float32Array(count*12),3));
      geometry.setIndex(quadIndices(count));
      const material=new Material({name:'builder-weather',color,lit:false,transparent:true,opacity:.55,depthWrite:false,side:'double',receiveShadows:false});
      const mesh=new Mesh(geometry,material);mesh.layers.set(2);mesh.frustumCulled=false;mesh.castShadow=false;mesh.visible=false;this.group.add(mesh);return mesh;
    };
    this.rain=create(RAIN_PARTICLES,'#c4e3ef');
    this.bolt=create(12,'#e2ebff');
    this.lastThunder=-1;
    this.lastWeather='clear';
    this.weatherStarted=0;
  }
  update(time,camera,yaw,settings,onThunder) {
    const attribute=this.rain.geometry.getAttribute('position');
    const count=writeRainQuads(attribute.array,time,camera.position.toArray(),settings);
    attribute.needsUpdate=true;this.rain.geometry.setDrawRange(0,count*6);this.rain.visible=count>0;
    if(settings.weather!==this.lastWeather) {this.lastThunder=-1;this.lastWeather=settings.weather;this.weatherStarted=time;}
    const state=stormState(time-this.weatherStarted,settings);
    this.bolt.visible=state.flash>.02;
    this.bolt.material.opacity=state.flash;
    const boltAttribute=this.bolt.geometry.getAttribute('position');
    writeLightningQuad(boltAttribute.array,camera.position.toArray(),yaw,settings.weatherSeed??7341,state.event);
    boltAttribute.needsUpdate=true;
    if(state.event>=0 && state.event!==this.lastThunder) {this.lastThunder=state.event;onThunder(state.event);}
    return { ...state, particles:count };
  }
}
