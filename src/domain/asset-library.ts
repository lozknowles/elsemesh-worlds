import * as THREE from 'three';
import { sampleTerrain } from './world';
import type { EditorObject, PrimitiveKind, Terrain, Vec3, WorldAsset, WorldProject } from './world';

export type LibraryCategory = 'Nature' | 'Coastal' | 'Building' | 'Wildlife' | 'Primitive' | 'Furniture' | 'Computer';
export type LibraryAsset = {
  id: string;
  name: string;
  category: LibraryCategory;
  description: string;
  kind: PrimitiveKind | 'glb';
  preview: string;
  source: string;
  license: string;
  readiness: string;
  assetUrl?: string;
  thumbnailUrl?: string;
  scale: Vec3;
  materialColor?: string;
  treeSpecies?: EditorObject['treeSpecies'];
  placement?: 'ground' | 'shore' | 'water' | 'air';
  collision?: EditorObject['collision'];
};

export const assetLibrary: LibraryAsset[] = [
  ...([
    ['beach-hut-s1', 'Original beach hut S1', 'beach-hut-s1.glb'],
    ['beach-hut-s2', 'Original beach hut S2', 'beach-hut-s2.glb'],
    ['beach-hut-s3', 'Original beach hut S3', 'beach-hut-s3.glb'],
  ] as const).map(([id,name,file]): LibraryAsset => ({
    id: 'island-'+id, name, category: 'Building', description: 'Original Island beach hut with porch and stairs; static reusable scenery.', kind: 'glb',
    preview: '⌂', source: 'Original Island world repository snapshot 22f071c2 · trusted Village/buildHouse geometry extraction; details in docs/reusable-island-asset-inventory.md',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC and ElseMesh contributors',
    readiness: 'Static model with original geometry and vertex colours. Weathering shaders and game behaviour are not embedded.',
    assetUrl: '/assets/elsemesh/original-island/'+file, scale: [1,1,1], placement: 'shore', collision: 'solid',
  })),
  ...([
    ['timber-pier', 'Original timber pier', 'timber-pier.glb', 'shore'],
    ['boardwalk', 'Original boardwalk', 'boardwalk.glb', 'shore'],
    ['lobster-boat', 'Original lobster boat', 'lobster-boat.glb', 'water'],
  ] as const).map(([id,name,file,placement]): LibraryAsset => ({
    id: 'island-'+id, name, category: 'Coastal', description: placement==='water' ? 'Original Island lobster boat; static moored scenery, not a drivable vehicle.' : 'Original Island coastal structure; static reusable scenery.',
    kind: 'glb', preview: placement==='water'?'⛵':'▤',
    source: 'Original Island world repository snapshot 22f071c2 · trusted Village/BoatModel geometry extraction; details in docs/reusable-island-asset-inventory.md',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC and ElseMesh contributors',
    readiness: 'Static geometry with vertex colours. Boat controls, buoyancy and procedural shader effects require game runtime behaviour and are not included.',
    assetUrl: '/assets/elsemesh/original-island/'+file, scale: [1,1,1], placement, collision: 'solid',
  })),
  { id: 'wildlife-humpback-whale', name: 'Humpback whale', category: 'Wildlife', description: '14.5 m humpback from the original game geometry; place on a world water surface.', kind: 'glb', preview: '◕',
    source: 'ElseMesh src/world/marine/Whale.js · public/models/whale/humpback.bin lod0 and albedo · source commit 6fdb63c5; details in docs/reusable-island-asset-inventory.md',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC and ElseMesh contributors',
    readiness: 'Static rest pose. Swimming, surfacing, blow, rig motion and ocean interaction remain engine behaviours, not embedded in this model.',
    assetUrl: '/assets/elsemesh/wildlife/humpback-whale.glb', scale: [1,1,1], placement: 'water', collision: 'none' },
  ...([
    ['laughing-gull','Laughing gull','laughing-gull.glb'],
    ['royal-tern','Royal tern','royal-tern.glb'],
    ['brown-pelican','Brown pelican','brown-pelican.glb'],
    ['magnificent-frigatebird','Magnificent frigatebird','magnificent-frigatebird.glb'],
    ['sanderling','Sanderling','sanderling.glb'],
  ] as const).map(([id,name,file]): LibraryAsset => ({
    id: 'wildlife-'+id, name, category: 'Wildlife', description: 'Original game bird geometry in a fixed pose; place above terrain and adjust the transform.', kind: 'glb',
    preview: '⌁', source: 'ElseMesh src/world/wildlife/BirdShapes.js and BirdBatch.js · source commit 6fdb63c5; details in docs/reusable-island-asset-inventory.md',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC and ElseMesh contributors',
    readiness: 'Static source-derived pose and simplified PBR palette. Flight, perching, flocking and calls remain engine behaviours.',
    assetUrl: '/assets/elsemesh/wildlife/'+file, scale: [1,1,1], placement: 'air', collision: 'none',
  })),
  ...([
    ['ghost-crab','Ghost crab','ghost-crab.glb'],
    ['hermit-crab','Hermit crab','hermit-crab.glb'],
  ] as const).map(([id,name,file]): LibraryAsset => ({
    id: 'wildlife-'+id, name, category: 'Wildlife', description: 'Original game beach-crab geometry in a stationary pose.', kind: 'glb',
    preview: '❖', source: 'ElseMesh src/world/wildlife/CritterShapes.js and CritterBatch.js · source commit 6fdb63c5; details in docs/reusable-island-asset-inventory.md',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC and ElseMesh contributors',
    readiness: 'Static source-derived pose and simplified PBR palette. Scuttling and burrow behaviour remain engine behaviours.',
    assetUrl: '/assets/elsemesh/wildlife/'+file, scale: [1,1,1], placement: 'shore', collision: 'none',
  })),
  ...([
    ['dining-chair', 'Dining chair', 'Furniture', 'Seat, back and four steel legs. Human scale: 0.51 m wide, 0.48 m seat height.', '♧'],
    ['dining-table', 'Dining table', 'Furniture', 'Tabletop and four steel legs. Human scale: 3.25 × 1.30 m, 0.82 m high.', '▤'],
    ['large-nesting-table', 'Large nesting table', 'Furniture', 'Lounge tabletop and three legs.', '▤'],
    ['small-nesting-table', 'Small nesting table', 'Furniture', 'Lounge tabletop and two legs.', '▤'],
    ['side-table', 'Side table', 'Furniture', 'Side tabletop and central stem.', '▤'],
    ['mezzanine-side-table', 'Mezzanine side table', 'Furniture', 'Reading tabletop and central stem.', '▤'],
    ['potted-plant', 'Potted plant', 'Nature', 'Black pot with nine separate leaf components.', '♣'],
    ['c64-computer', 'C64 computer', 'Computer', 'Period computer, CRT, keyboard and static BASIC screen.', '▣'],
    ['bbc-computer', 'BBC computer', 'Computer', 'Period computer, CRT, keyboard and static BASIC screen.', '▣'],
    ['sun-workstation', 'Sun workstation', 'Computer', 'Period workstation, CRT, keyboard, mouse and static windowed screen.', '▣'],
  ] as const).map(([id, name, category, description, preview]): LibraryAsset => ({
    id: `warehouse-${id}`, name, category, description, preview, kind: 'glb',
    source: 'ElseMesh PortalInteriorRecipe.js · DRG Software Solutions LLC · source commit and component membership in assets/elsemesh/warehouse/provenance.json',
    license: 'MIT · Copyright (c) 2026 DRG Software Solutions LLC',
    readiness: 'Prepared recipe prefab; named component hierarchy and separate PBR material slots. Bottom-centre pivot. Static screens; no game interaction or runtime surface shaders.',
    assetUrl: `/assets/elsemesh/warehouse/${id}.glb`, scale: ['dining-chair', 'dining-table'].includes(id) ? [0.65, 0.8, 0.65] : [1, 1, 1],
  })),
  { id: 'dead-quiver-trunk', name: 'Dead quiver trunk', category: 'Nature', description: 'Scanned fallen tree trunk; the game selects one of three LODs by distance.', kind: 'glb', preview: '▰', source: 'Burning-Horizons/public/models/debris/dead_quiver_trunk.glb · Poly Haven Dead Quiver Trunk', license: 'CC0 1.0', readiness: 'Single LOD0; albedo and normal embedded, ARM omitted, generic PBR factors. Schematic preview.', assetUrl: '/assets/elsemesh/debris/dead_quiver_trunk.glb', thumbnailUrl: '/assets/elsemesh/debris/dead_quiver_trunk.svg', scale: [1, 1, 1] },
  { id: 'dead-quiver-branch-1', name: 'Dead quiver branch 01', category: 'Nature', description: 'Scanned fallen branch; the game selects one of three LODs by distance.', kind: 'glb', preview: '⌁', source: 'Burning-Horizons/public/models/debris/dead_quiver_branch_01.glb · Poly Haven Dead Quiver Branch 01', license: 'CC0 1.0', readiness: 'Single LOD0; albedo and normal embedded, ARM omitted, generic PBR factors. Schematic preview.', assetUrl: '/assets/elsemesh/debris/dead_quiver_branch_01.glb', thumbnailUrl: '/assets/elsemesh/debris/dead_quiver_branch_01.svg', scale: [1, 1, 1] },
  { id: 'dead-quiver-branch-2', name: 'Dead quiver branch 02', category: 'Nature', description: 'Scanned fallen branch; the game selects one of three LODs by distance.', kind: 'glb', preview: '⌁', source: 'Burning-Horizons/public/models/debris/dead_quiver_branch_02.glb · Poly Haven Dead Quiver Branch 02', license: 'CC0 1.0', readiness: 'Single LOD0; albedo and normal embedded, ARM omitted, generic PBR factors. Schematic preview.', assetUrl: '/assets/elsemesh/debris/dead_quiver_branch_02.glb', thumbnailUrl: '/assets/elsemesh/debris/dead_quiver_branch_02.svg', scale: [1, 1, 1] },
  { id: 'lambis-shell', name: 'Lambis shell', category: 'Coastal', description: 'Scanned shell; the game selects one of three LODs by distance.', kind: 'glb', preview: '◕', source: 'Burning-Horizons/public/models/debris/lambis_shell.glb · Poly Haven Lambis Shell', license: 'CC0 1.0', readiness: 'Single LOD0; albedo and normal embedded, ARM omitted, generic PBR factors. Schematic preview.', assetUrl: '/assets/elsemesh/debris/lambis_shell.glb', thumbnailUrl: '/assets/elsemesh/debris/lambis_shell.svg', scale: [1, 1, 1] },
  ...(['broadleaf', 'palm', 'pine'] as const).map((species): LibraryAsset => ({ id: `${species}-tree`, name: `${species[0]!.toUpperCase()}${species.slice(1)} tree`, category: 'Nature', description: 'Seeded editor tree with trunk, branch hierarchy, leaf clusters and animated wind; independently authored geometry.', kind: 'tree', treeSpecies: species, preview: '♣', source: 'ElseMesh Worlds src/domain/trees.ts · independently authored procedural approximation', license: 'Editor approximation · no project licence declared', readiness: 'Active editor and native geometry; choose a point on terrain to plant.', scale: [1, 1, 1] })),
  { id: 'building', name: 'Building block', category: 'Building', description: 'Editor primitive; the game’s village geometry is generated by runtime GeoBuilder emitters.', kind: 'building', preview: '⌂', source: 'ElseMesh Worlds editor primitive · game source: Burning-Horizons/src/world/Village.js, src/world/village/GeoBuilder.js', license: 'Editor approximation · no project licence declared', readiness: 'Editor-native blockout; village materials and detailed prefab are runtime coupled.', scale: [1, 1, 1] },
  { id: 'reef-boulder', name: 'Reef boulder', category: 'Coastal', description: 'Editor primitive; game reef mound geometry is generated deterministically at runtime.', kind: 'sphere', preview: '⬟', source: 'ElseMesh Worlds editor primitive · game source: Burning-Horizons/src/world/reef/ReefGeometry.js', license: 'Editor approximation · no project licence declared', readiness: 'Editor-native approximation; source emitter is not imported directly.', scale: [1.2, 0.8, 1.1] },
  { id: 'crate', name: 'Wooden crate', category: 'Building', description: 'Blockout prop; the detailed scanned crate is packed in the game’s props.bin atlas.', kind: 'box', preview: '▦', source: 'Game source: Burning-Horizons/public/models/props/props.bin · props.json · props/CREDITS.md', license: 'Poly Haven CC0 1.0', readiness: 'Source geometry is atlas-packed, not standalone GLB; editor uses a blockout.', scale: [0.7, 0.7, 0.7] },
  { id: 'barrel-sponge', name: 'Barrel sponge', category: 'Coastal', description: 'Procedural reef sponge represented by a reusable editor primitive.', kind: 'cylinder', preview: '◉', source: 'Editor primitive · game source: Burning-Horizons/src/world/reef/ReefGeometry.js (createBarrel)', license: 'Editor approximation · no project licence declared', readiness: 'Editor primitive; game emitter needs reef runtime and material pipeline.', scale: [0.8, 0.8, 0.8] },
  { id: 'cube', name: 'Cube', category: 'Primitive', description: 'Editable box primitive.', kind: 'box', preview: '◇', source: 'ElseMesh Worlds built-in primitive', license: 'Editor asset · no project licence declared', readiness: 'Ready.', scale: [1, 1, 1] },
  { id: 'cone', name: 'Cone', category: 'Primitive', description: 'Editable cone primitive.', kind: 'cone', preview: '△', source: 'ElseMesh Worlds built-in primitive', license: 'Editor asset · no project licence declared', readiness: 'Ready.', scale: [1, 1, 1] },
  { id: 'sphere', name: 'Sphere', category: 'Primitive', description: 'Editable sphere primitive.', kind: 'sphere', preview: '○', source: 'ElseMesh Worlds built-in primitive', license: 'Editor asset · no project licence declared', readiness: 'Ready.', scale: [1, 1, 1] },
  { id: 'cylinder', name: 'Cylinder', category: 'Primitive', description: 'Editable cylinder primitive.', kind: 'cylinder', preview: '◉', source: 'ElseMesh Worlds built-in primitive', license: 'Editor asset · no project licence declared', readiness: 'Ready.', scale: [1, 1, 1] },
];

export function createLibraryObject(asset: LibraryAsset, position: Vec3, id: string): EditorObject {
  return {
    id,
    name: asset.name,
    kind: asset.kind,
    position,
    rotation: [0, 0, 0],
    scale: [...asset.scale],
    color: asset.materialColor ?? (asset.kind === 'tree' ? '#577854' : asset.kind === 'building' ? '#d3c2a0' : '#a8b87b'),
    visible: true,
    collision: asset.collision ?? 'solid',
    ...(asset.treeSpecies ? { treeSpecies: asset.treeSpecies, treeSeed: Math.floor(Math.random() * 0xffffffff) } : {}),
    ...(asset.assetUrl ? { assetId: asset.id } : {}),
  };
}

/** Ground the transformed model's full source bounds, including rotations and non-uniform scaling. */
export function groundObject(object: EditorObject, asset: WorldAsset | undefined, terrain: Terrain): EditorObject {
  const bounds = asset?.bounds ?? { min: [-0.8, object.kind === 'tree' || object.kind === 'building' ? 0 : -0.8, -0.8], max: [0.8, 0.8, 0.8] };
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)), new THREE.Vector3(...object.scale));
  let bottom = Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) bottom = Math.min(bottom, new THREE.Vector3(x, y, z).applyMatrix4(transform).y);
  return { ...object, position: [object.position[0], sampleTerrain(terrain, object.position[0], object.position[2]) - bottom, object.position[2]] };
}

/** Choose an authored starting transform; subsequent edits remain explicit world-object data. */
export function placeLibraryObject(entry: LibraryAsset, object: EditorObject, asset: WorldAsset | undefined, project: WorldProject): EditorObject {
  const mode = entry.placement ?? 'ground';
  if (mode === 'ground') return groundObject(object, asset, project.terrain);
  const terrain = project.terrain, spawn = project.spawn.position;
  const within = (x: number, z: number) => Math.abs(x) < terrain.width / 2 - 8 && Math.abs(z) < terrain.depth / 2 - 8;
  if (mode === 'water') {
    const level = project.nativeIsland?.sea.level ?? project.water?.level;
    if (level === undefined || !Number.isFinite(level)) throw new Error('Add a sea or world water surface before placing this model.');
    const previous = project.objects.filter(item => item.name === entry.name).length;
    const boat = project.objects.find(item => !item.parentId && /boat/i.test(item.name));
    const anchors: Array<[number, number]> = boat ? [[boat.position[0] + 32 + previous * 18, boat.position[2] + 12]] : [];
    for (let radius = 24; radius < Math.min(terrain.width, terrain.depth) * .46; radius += 24)
      for (let step = 0; step < 16; step++) {
        const angle = step * Math.PI / 8;
        anchors.push([spawn[0] + Math.cos(angle) * radius, spawn[2] + Math.sin(angle) * radius]);
      }
    const point = anchors.find(([x,z]) => within(x,z) && sampleTerrain(terrain,x,z) <= level - (entry.id.includes('whale') ? 3 : 1));
    if (!point) throw new Error('No suitable water location was found. Add water or move to a deeper shoreline.');
    return { ...object, position: [point[0], level, point[1]] };
  }
  if (mode === 'air') {
    const count = project.objects.filter(item => item.name === entry.name).length;
    const x = Math.max(-terrain.width / 2 + 8, Math.min(terrain.width / 2 - 8, spawn[0] + 8 + count * 3));
    const z = Math.max(-terrain.depth / 2 + 8, Math.min(terrain.depth / 2 - 8, spawn[2] - 6));
    return { ...object, position: [x, sampleTerrain(terrain,x,z) + 7, z] };
  }
  const isHut = entry.id.startsWith('island-beach-hut');
  const huts = project.objects.filter(item => !item.parentId && /beach hut/i.test(item.name));
  const count = project.objects.filter(item => item.name === entry.name).length;
  const x = isHut && huts.length ? Math.max(...huts.map(item => item.position[0])) + 11 : spawn[0] + (isHut ? 9 : 2 + count * .8);
  const z = isHut && huts.length ? huts[huts.length - 1]!.position[2] : spawn[2] + (isHut ? 1 : 2);
  if (!within(x,z)) throw new Error('No shoreline placement fits inside this world; move an existing object or use the transform controls.');
  return groundObject({ ...object, position: [x,0,z] }, asset, terrain);
}
