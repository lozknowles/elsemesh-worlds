import {describe,it,expect} from 'vitest';
import {validateSurfaceExclusions} from './surface-exclusions';
const box={id:'warehouse:surface:interior-01',min:[-14.5,3.1,-90.5],max:[14.5,8.5,-63.5]};
describe('authored rendered-water exclusion volumes',()=>{
 it('accepts stable bounded ordered volumes without collision or physics semantics',()=>{expect(validateSurfaceExclusions([])).toEqual([]);expect(validateSurfaceExclusions([box])).toEqual([]);});
 it('rejects malformed bounds, arbitrary fields, duplicate IDs and excessive count',()=>{for(const bad of [null,[{...box,id:''}],[{...box,id:'../unsafe'}],[{...box,min:[0,0,0],max:[0,1,1]}],[{...box,min:[NaN,0,0]}],[{...box,max:[100001,8.5,-63.5]}],[{...box,script:'x'}],[box,box],Array.from({length:17},(_,i)=>({...box,id:'volume:'+i}))])expect(validateSurfaceExclusions(bad).length).toBeGreaterThan(0);});
});
