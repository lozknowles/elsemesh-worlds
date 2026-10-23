import { describe, expect, it } from 'vitest';
import {
  createTerrain,
  createWorld,
  createPlayerWorldPackage,
  paintTerrain,
  sampleTerrain,
  sculptTerrain,
  validateWorld,
} from './world';
import type { WorldProject } from './world';

describe('world authoring document', () => {
  it('creates and validates a new persisted project shape', () => {
    const project = createWorld('Test coast');
    expect(validateWorld(project).valid).toBe(true);
    expect(project.terrain.heights).toHaveLength(project.terrain.resolution ** 2);
    expect(project.metadata.worldId).toMatch(/^elsemesh\.world:/);
  });

  it('generates reproducible terrain for a seed and changes the shape for another seed', () => {
    const first = createTerrain();
    const repeat = createTerrain();
    expect(first.heights).toEqual(repeat.heights);
    const different = createTerrain(128, 128, 65, 2050);
    expect(different.heights).not.toEqual(first.heights);
  });

  it('rejects unsupported schemas, invalid terrain sizes and duplicate object IDs', () => {
    const project = createWorld();
    expect(validateWorld({ ...project, schema: 'future' }).errors[0]).toContain('Unsupported project schema');
    expect(validateWorld({ ...project, terrain: { ...project.terrain, heights: [1] } }).errors).toContain(
      'Terrain height samples do not match the grid or contain invalid heights.',
    );
    const object = {
      id: 'same',
      name: 'A',
      kind: 'box' as const,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      color: '#ffffff',
      visible: true,
      collision: 'solid' as const,
    };
    expect(validateWorld({ ...project, objects: [object, object] }).errors.join(' ')).toContain(
      'duplicate ID',
    );
  });

  it('round-trips JSON without losing terrain samples or object transforms', () => {
    const source = createWorld();
    const project: WorldProject = {
      ...source,
      objects: [
        {
          id: 'tree-1',
          name: 'Oak',
          kind: 'tree',
          position: [3, 1, -4],
          rotation: [0, 0.4, 0],
          scale: [1.5, 1.5, 1.5],
          color: '#607d45',
          visible: true,
          collision: 'solid',
        },
      ],
    };
    const result = validateWorld(JSON.parse(JSON.stringify(project)));
    expect(result.valid).toBe(true);
    expect(result.project?.terrain.heights).toEqual(project.terrain.heights);
    expect(result.project?.objects[0]?.position).toEqual([3, 1, -4]);
    expect(result.project?.objects[0]?.rotation).toEqual([0, 0.4, 0]);
  });

  it('exports a bounded player package with explicit units, axes and exact project samples', () => {
    const project = createWorld('Round trip');
    project.terrain.heights[32 * 65 + 32] = 12.75;
    const exported = createPlayerWorldPackage(project);
    expect(exported).toMatchObject({
      schema: 'elsemesh.player-world/2',
      units: 'metres',
      axes: 'right-handed-y-up-minus-z-forward',
      project: { terrain: { heights: expect.arrayContaining([12.75]) } },
    });
    expect(() => createPlayerWorldPackage({ ...project, schema: 'elsemesh.worlds.project/99' })).toThrow(/Unsupported project schema/);
  });

  it('uses one height field for visual edits and ground queries', () => {
    const terrain = {
      width: 32,
      depth: 32,
      resolution: 9,
      seed: 1,
      heights: Array(81).fill(0) as number[],
      materials: Array(81).fill(0) as number[],
    };
    const raised = sculptTerrain(terrain, 0, 0, 9, 3, 'raise');
    expect(sampleTerrain(raised, 0, 0)).toBeCloseTo(3);
    expect(sampleTerrain(terrain, 0, 0)).toBe(0);
    expect(raised.heights[40]).toBeCloseTo(3);
  });

  it('samples the same diagonal triangles used by the rendered terrain mesh', () => {
    const terrain = {
      width: 2,
      depth: 2,
      resolution: 3,
      seed: 3,
      heights: [0, 0, 0, 0, 0, 0, 0, 0, 12],
      materials: Array(9).fill(0) as number[],
    };
    expect(sampleTerrain(terrain, 0.75, 0.75)).toBeCloseTo(6);
    expect(sampleTerrain(terrain, -0.5, -0.5)).toBe(0);
  });

  it('flattens, smooths and lowers within the brush boundary', () => {
    const flat = {
      width: 32,
      depth: 32,
      resolution: 9,
      seed: 1,
      heights: Array(81).fill(2) as number[],
      materials: Array(81).fill(0) as number[],
    };
    const raised = sculptTerrain(flat, 0, 0, 10, 2, 'raise');
    const flattened = sculptTerrain(raised, 0, 0, 10, 1, 'flatten');
    const smoothed = sculptTerrain(flattened, 0, 0, 10, 0.5, 'smooth');
    const lowered = sculptTerrain(raised, 0, 0, 10, 1, 'lower');
    expect(flattened.heights[40]).toBeCloseTo(4);
    expect(smoothed.heights).toHaveLength(81);
    expect(lowered.heights[40]).toBeCloseTo(3);
    expect(raised.heights[0]).toBe(2);
  });

  it('rejects oversized and malformed terrain', () => {
    expect(() =>
      sculptTerrain(
        {
          width: 32,
          depth: 32,
          resolution: 9,
          seed: 1,
          heights: Array(81).fill(0),
          materials: Array(81).fill(0),
        },
        0,
        0,
        0,
        1,
        'raise',
      ),
    ).toThrow();
    expect(() => createWorld('bad').terrain.resolution).not.toThrow();
  });

  it('paints bounded terrain material samples without changing collision height', () => {
    const terrain = {
      width: 32,
      depth: 32,
      resolution: 9,
      seed: 1,
      heights: Array(81).fill(2) as number[],
      materials: Array(81).fill(0) as number[],
    };
    const painted = paintTerrain(terrain, 0, 0, 5, 2);
    expect(painted.materials[40]).toBe(2);
    expect(painted.materials[0]).toBe(0);
    expect(sampleTerrain(painted, 0, 0)).toBe(2);
  });
});
