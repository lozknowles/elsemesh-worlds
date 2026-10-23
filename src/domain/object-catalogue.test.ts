import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseObjectCatalogue, filterCatalogue, surfacePlacement, commitCataloguePlacement, fetchCatalogueModel } from './object-catalogue';
import { createWorld, validateWorld } from './world';
import type { WorldAsset, EditorObject } from './world';
import { inspectGlbJson } from './asset-glb';
const manifest=JSON.parse(readFileSync('public/assets/catalogue/manifest.json','utf8'));
const fixture=()=>structuredClone({...manifest,assets:manifest.assets.slice(0,2)});
function assetFixture(): WorldAsset {
 const file=readFileSync('public/assets/elsemesh/warehouse/dining-chair.glb'),buffer=Uint8Array.from(file).buffer,inspection=inspectGlbJson(buffer);
 return {id:'chair',name:'Chair',mediaType:'model/gltf-binary',bytes:file.length,dataUrl:'data:application/octet-stream;base64,'+file.toString('base64'),bounds:inspection.bounds,materialCount:inspection.materialCount};
}
const object=(id: string):EditorObject=>({id,name:'Chair',kind:'glb',assetId:'chair',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'solid'});
afterEach(()=>vi.unstubAllGlobals());
describe('versioned object catalogue',()=>{
 it('admits the pinned complete local distribution and filters interiors, pack and tag words',()=>{
  const catalogue=parseObjectCatalogue(manifest);expect(catalogue.assets.length).toBe(1775);
  const interiors=filterCatalogue(catalogue.assets,'','All','Interiors');expect(interiors.length).toBe(359);
  const first=interiors[0]!;
  expect(filterCatalogue(catalogue.assets,first.name,first.sourcePack.id,'Interiors')).toContain(first);
  expect(filterCatalogue(catalogue.assets,'impossible-no-such-model','All','All')).toEqual([]);
 });
 it.each(['../coin.glb','https://evil.example/coin.glb','/assets/catalogue/7be9b573/a.glb','assets/catalogue/7be9b573/../a.glb','assets/catalogue/7be9b573/%2e%2e/a.glb','assets/catalogue/7be9b573/a.glb?redirect=1'])('rejects uncontrolled model path %s',path=>{
  const value=fixture();value.assets[0].model=path;expect(()=>parseObjectCatalogue(value)).toThrow();
 });
 it('rejects schema, duplicate identity, unverified licence, wrong provenance and excessive metadata',()=>{
  for(const mutate of [
   (v:typeof manifest)=>{v.schema='other/1';},
   (v:typeof manifest)=>{v.assets[1].id=v.assets[0].id;},
   (v:typeof manifest)=>{v.assets[0].sha256='bad';},
   (v:typeof manifest)=>{v.assets[0].license.id='unknown';},
   (v:typeof manifest)=>{v.assets[0].sourcePack.url='https://example.com/assets/pack';},
   (v:typeof manifest)=>{v.assets[0].triangleCount=Infinity;},
   (v:typeof manifest)=>{v.assets[0].bounds.min[0]=Infinity;},
   (v:typeof manifest)=>{v.assets[0].dimensions[0]=999;},
   (v:typeof manifest)=>{v.assets[0].defaultScale[0]=0;},
   (v:typeof manifest)=>{v.assets[0].components=['Transform','ExecuteScript'];},
   (v:typeof manifest)=>{v.assets=Array(2501).fill(v.assets[0]);},
  ]){const value=fixture();mutate(value);expect(()=>parseObjectCatalogue(value)).toThrow();}
 });
});
describe('transactional upright placement',()=>{
 it('aligns an off-centre model bottom to a raised surface with yaw and nonuniform scale',()=>{
  const asset=assetFixture();asset.bounds={min:[1,-2,3],max:[5,4,9]};
  const placed=surfacePlacement(asset,[10,12,20],Math.PI/2,[2,3,4]);
  expect(placed.position[0]).toBeCloseTo(-14);expect(placed.position[1]).toBe(18);expect(placed.position[2]).toBeCloseTo(26);
  expect(placed.rotation).toEqual([0,Math.PI/2,0]);
 });
 it('commits once, deduplicates bytes with independent IDs and survives serialization',()=>{
  const baseline=createWorld('Placement'),asset=assetFixture();
  const first=commitCataloguePlacement(baseline,asset,object('first'));
  expect(baseline.assets).toHaveLength(0);expect(baseline.objects).toHaveLength(0);
  const second=commitCataloguePlacement(first,{...asset,id:'another-id'},object('second'));
  expect(second.objects).toHaveLength(2);expect(second.assets).toHaveLength(1);
  expect(second.objects.map(o=>o.assetId)).toEqual(['chair','chair']);
  expect(validateWorld(JSON.parse(JSON.stringify(second))).valid).toBe(true);
 });
 it('rejects invalid or over-budget placement atomically',()=>{
  const baseline=createWorld('Placement'),asset=assetFixture();
  expect(()=>commitCataloguePlacement(baseline,asset,{...object('bad'),scale:[0,1,1]})).toThrow();
  const full={...baseline,objects:Array.from({length:2000},(_,i)=>({...object('o'+i),kind:'box' as const,assetId:undefined}))};
  expect(()=>commitCataloguePlacement(full,asset,object('overflow'))).toThrow();
  expect(baseline.assets).toEqual([]);expect(baseline.objects).toEqual([]);
 });
 it('verifies fetched bytes against declared size and SHA256 before admission',async()=>{
  vi.stubGlobal('document',{baseURI:'http://localhost/'});
  const entry=parseObjectCatalogue(manifest).assets[0]!,bytes=readFileSync('public/'+entry.model);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)));
  expect((await fetchCatalogueModel(entry)).byteLength).toBe(entry.bytes);
  const wrong=Buffer.from(bytes);wrong[wrong.length-1]=wrong[wrong.length-1]!^1;
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(wrong)));
  await expect(fetchCatalogueModel(entry)).rejects.toThrow('content hash');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('missing',{status:404})));
  await expect(fetchCatalogueModel(entry)).rejects.toThrow('404');
 });
});
