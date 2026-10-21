import { describe, expect, it } from 'vitest';
import { createWorld, validateWorld } from './world';
import type { DrawnFeature } from './world';
import { buildFeatureGeometry, featureFlowWarnings } from './features';
const feature = (kind: DrawnFeature['kind']): DrawnFeature => ({ id: kind, name: kind, kind, points: [[-8,2,-8],[8,1,-8],[8,0,8],[-8,0,8]], width: 3, elevation: 1, drop: 5 });
describe('authored landscape water and drawing', () => {
  it('clips lake water to terrain below its level and removes water over dry terrain', () => {
    const project=createWorld(); project.terrain.heights.fill(0);
    const lake=feature('lake'); const wet=buildFeatureGeometry(lake,project);
    const p=wet[0]!.geometry.getAttribute('position'); expect(p.count).toBeGreaterThan(0);
    for(let i=0;i<p.count;i++){expect(p.getY(i)).toBeCloseTo(1.035);expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(8.001);expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(8.001);}
    wet.forEach(part=>part.geometry.dispose()); project.terrain.heights.fill(3);
    const dry=buildFeatureGeometry(lake,project); expect(dry[0]!.geometry.getAttribute('position').count).toBe(0); dry.forEach(part=>part.geometry.dispose());
  });
  it('generates finite geometry for every authored feature',()=>{
    const project=createWorld();
    for(const kind of ['river','lake','path','bridge','shape','waterfall'] as const){const parts=buildFeatureGeometry(feature(kind),project);expect(parts.length).toBeGreaterThan(0);for(const part of parts){expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);part.geometry.dispose();}}
  });
  it('warns about uphill rivers and disconnected lake levels',()=>{
    const project=createWorld();const lake=feature('lake'),river=feature('river');river.points=[[0,1,0],[3,4,0]];river.startLakeId=lake.id;river.endLakeId=lake.id;project.features=[lake,river];const warnings=featureFlowWarnings(river,project);expect(warnings.some(w=>w.includes('rises downstream'))).toBe(true);expect(warnings.some(w=>w.includes('lake level'))).toBe(true);
  });
  it('normalizes legacy projects and preserves valid features in JSON round trips',()=>{
    const project=createWorld();delete project.features;const legacy=validateWorld(project);expect(legacy.project?.features).toEqual([]);
    project.features=[feature('lake'),feature('river')];expect(validateWorld(JSON.parse(JSON.stringify(project))).valid).toBe(true);
    project.features[1]!.points[0]![1]=Infinity;expect(validateWorld(project).valid).toBe(false);
  });
});



