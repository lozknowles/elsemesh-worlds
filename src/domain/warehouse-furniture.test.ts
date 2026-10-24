import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {assetLibrary,createLibraryObject} from './asset-library';
import {inspectGlbJson} from './asset-glb';

const provenance=JSON.parse(readFileSync('public/assets/elsemesh/warehouse/provenance.json','utf8'));
const furniture=['dining-chair','dining-table','large-nesting-table','small-nesting-table','side-table','mezzanine-side-table'];
describe('portable warehouse furniture',()=>{
 it.each(furniture)('%s has a valid reusable model, provenance and solid placement',id=>{
  const entry=assetLibrary.find(asset=>asset.id==='warehouse-'+id);
  expect(entry?.category).toBe('Furniture');
  const file=readFileSync('public'+entry!.assetUrl!);
  const model=inspectGlbJson(Uint8Array.from(file).buffer);
  const source=provenance.prefabs.find((item:{id:string})=>item.id===id);
  expect(source?.bytes).toBe(file.length);
  expect(source?.components).toBeGreaterThanOrEqual(2);
  expect(model.bounds.min[1]).toBeCloseTo(0,3);
  expect(createLibraryObject(entry!,[1,2,3],'object-1').collision).toBe('solid');
 });
 it('sizes dining furniture against an adult avatar',()=>{
  const chair=assetLibrary.find(item=>item.id==='warehouse-dining-chair')!;
  const table=assetLibrary.find(item=>item.id==='warehouse-dining-table')!;
  expect(chair.scale).toEqual([.65,.8,.65]);
  expect(table.scale).toEqual([.65,.8,.65]);
  const chairBounds=inspectGlbJson(Uint8Array.from(readFileSync('public'+chair.assetUrl!)).buffer).bounds;
  const tableBounds=inspectGlbJson(Uint8Array.from(readFileSync('public'+table.assetUrl!)).buffer).bounds;
  expect((chairBounds.max[1]-chairBounds.min[1])*.8).toBeCloseTo(1.196,1);
  expect((tableBounds.max[1]-tableBounds.min[1])*.8).toBeCloseTo(.816,1);
 });
});
