import { describe,it,expect } from 'vitest';
import { Box3,Vector3 } from 'three';
import {resolvePlayerMotion} from './player-contact';
import type {EditorObject} from './world';
const object:EditorObject={id:'floor',name:'Floor',kind:'box',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,color:'#ffffff',collision:'walkable'};
const collider=(min:[number,number,number],max:[number,number,number])=>({object,bounds:new Box3(new Vector3(...min),new Vector3(...max))});
describe('player directional contact',()=>{
 it('does not snap someone standing under an upper floor onto it',()=>{const result=resolvePlayerMotion({previous:[0,1.65,0],position:[.1,1.64,0],velocityY:-.1,terrainHeight:0,colliders:[collider([-2,3,-2],[2,3.2,2])]});expect(result.position[1]).toBe(1.65);expect(result.grounded).toBe(true);});
 it('lands only while descending across a floor top from above',()=>{const floor=collider([-2,3,-2],[2,3.2,2]),result=resolvePlayerMotion({previous:[0,5,0],position:[0,4.7,0],velocityY:-2,terrainHeight:0,colliders:[floor]});expect(result.position[1]).toBeCloseTo(4.85);expect(result.velocityY).toBe(0);expect(result.grounded).toBe(true);});
 it('clips a jump against the underside without teleporting onto the floor',()=>{const result=resolvePlayerMotion({previous:[0,2.8,0],position:[0,3.1,0],velocityY:3,terrainHeight:0,colliders:[collider([-2,3,-2],[2,3.2,2])]});expect(result.position[1]).toBeCloseTo(2.9);expect(result.velocityY).toBe(0);expect(result.grounded).toBe(false);});
 it('steps up bounded stairs and descends by downward crossing',()=>{const step=collider([.5,0,-1],[1.5,.4,1]);const up=resolvePlayerMotion({previous:[0,1.65,0],position:[.8,1.64,0],velocityY:-.1,terrainHeight:0,colliders:[step]});expect(up.position).toEqual([.8,2.05,0]);expect(up.grounded).toBe(true);const down=resolvePlayerMotion({previous:[.8,2.05,0],position:[0,1.6,0],velocityY:-2,terrainHeight:0,colliders:[step]});expect(down.position).toEqual([0,1.65,0]);});
 it('rejects a step without head clearance and blocks tall side walls',()=>{const step=collider([.5,0,-1],[1.5,.4,1]),ceiling=collider([.5,1.9,-1],[1.5,2.1,1]);const blocked=resolvePlayerMotion({previous:[0,1.65,0],position:[.8,1.64,0],velocityY:-.1,terrainHeight:0,colliders:[step,ceiling]});expect(blocked.position[0]).toBe(0);const tall=resolvePlayerMotion({previous:[0,1.65,0],position:[.8,1.64,0],velocityY:-.1,terrainHeight:0,colliders:[collider([.5,0,-1],[1.5,2,1])]});expect(tall.position[0]).toBe(0);});
});



it('samples terrain at the resolved position after wall rollback',()=>{
 const wall={object:{collision:'solid'} as EditorObject,bounds:new Box3(new Vector3(.5,0,-2),new Vector3(1,5,2))};
 const result=resolvePlayerMotion({previous:[0,1.65,0],position:[.7,1.6,0],velocityY:-1,colliders:[wall],terrainHeight:3,terrainHeightAt:x=>x>.4?3:0});
 expect(result.position[0]).toBe(0);expect(result.position[1]).toBeCloseTo(1.65);
});

import {collisionWorldBounds} from './object-hierarchy';
import {createWorld} from './world';
it('climbs the ten-tread browser fixture and reaches its upper floor',()=>{
 const box=(id:string,size:[number,number,number],position:[number,number,number]):EditorObject=>({...object,id,position,scale:size.map(n=>n/1.6) as [number,number,number]});
 const world=createWorld();world.terrain.heights.fill(0);world.objects=[...Array.from({length:10},(_,i)=>box('Step '+(i+1),[1.8,.2,.5],[0,.2*(i+1)-.1,3-i*.5])),box('Upper floor',[8,.2,4],[0,1.9,-3.75])];
 const colliders=collisionWorldBounds(world);let position:[number,number,number]=[0,1.65,3.8],velocityY=0;
 for(let frame=0;frame<110;frame++){const previous=position;velocityY-=12/60;const proposed:[number,number,number]=[position[0],position[1]+velocityY/60,position[2]-4.5/60];const result=resolvePlayerMotion({previous,position:proposed,velocityY,terrainHeight:0,colliders});position=result.position;velocityY=result.velocityY;}
 expect(position[1]).toBeCloseTo(3.65,6);expect(position[2]).toBeLessThan(-2);
});

