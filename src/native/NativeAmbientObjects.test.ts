import {describe,expect,it} from 'vitest';
import * as T from 'three';
// @ts-expect-error Engine JavaScript module has no declaration file.
import * as N from '../vendor/elsemesh/engine/index.js';
// @ts-expect-error Native preview JavaScript module has no declaration file.
import {createNativeAmbientObjects} from './NativeAmbientObjects';
import {createWorld} from '../domain/world';

describe('ordinary native preview ambient matrices',()=>{
 it('keeps rotated-child hierarchy shear and the authored transform while moving',()=>{
  const project=createWorld('Nested bird');project.terrain.heights.fill(0);
  const object={id:'bird',kind:'glb',name:'Bird',assetId:'bird-asset',position:[3,5,4],rotation:[.2,.5,.3],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none',ambientBehaviour:{schema:'elsemesh.ambient-behaviour/1',kind:'bird-flight',speed:2,radius:4,seed:9}};
  project.objects=[object] as typeof project.objects;
  const parent=new T.Matrix4().compose(new T.Vector3(0,0,0),new T.Quaternion(),new T.Vector3(2,1,3));
  const child=new T.Matrix4().compose(new T.Vector3(3,5,4),new T.Quaternion().setFromEuler(new T.Euler(.2,.5,.3)),new T.Vector3(1,1,1));
  const base=parent.multiply(child),original=base.elements.slice();
  const item=new N.Group();item.matrixAutoUpdate=false;item.matrix.fromArray(base.elements);
  const controller=createNativeAmbientObjects(project);controller.add(item,object,base);controller.update(3);
  const moved=item.matrix.elements;
  expect(item.matrixAutoUpdate).toBe(false);expect(moved.slice(12,15)).not.toEqual(original.slice(12,15));
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){
   const dot=(values:number[])=>[0,1,2].reduce((sum,k)=>sum+values[a*4+k]!*values[b*4+k]!,0);
   expect(dot(moved)).toBeCloseTo(dot(original),5);
  }
  expect(base.elements).toEqual(original);expect(project.objects[0]?.position).toEqual([3,5,4]);
 });
});
