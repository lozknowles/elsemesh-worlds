import { srgb } from './TerrainShading.js';

// Lower-cost terrain appearance: two terrain data-map lookups and one shared
// detail lookup. Shore wetness (terWetFoam) retains its own existing fetch cost.
// Macro normals/AO and the material's lighting/shadow hooks remain authoritative.
export const SIMPLE_TERRAIN_SURFACE = /* wgsl */`
	let p = in.P;
	// The only exterior terrain cutout: an elliptical sea-level opening on the
	// western headland. The procedural heightfield remains authoritative elsewhere.
	let caveMouth = vec2f( ( p.x + 344.0 ) / 2.0, ( p.z - 80.0 ) / 7.0 );
	if ( dot( caveMouth, caveMouth ) < 1.0 && p.y < 5.5 ) { discard; }
	let xz = p.xz;
	let h = p.y;
	let nr = terrainNormalRock( xz );
	let N0 = normalize( vec3f( nr.x, sqrt( max( 1.0 - nr.x * nr.x - nr.y * nr.y, 0.0025 ) ), nr.y ) );
	let sp = terrainSplat( xz );
	let detail = terDetail( xz / 6.7 );
	let slope = 1.0 - N0.y;
	let underW = smoothstep( 0.12, -0.6, h );
	let landW = 1.0 - underW;
	let rockW = sat( max( smoothstep( 0.06, 0.55, nr.z ), smoothstep( 0.28, 0.65, slope ) ) );
	let sandW = smoothstep( 0.3, 0.72, sp.x + ( detail.z - 0.5 ) * 0.25 ) * ( 1.0 - rockW );
	let pathW = smoothstep( 0.28, 0.62, sp.y + ( detail.y - 0.5 ) * 0.2 ) * landW * ( 1.0 - rockW );
	let jungleW = sat( smoothstep( 9.0, 24.0, h ) + smoothstep( 0.18, 0.5, slope ) * 0.65 + sp.z * 0.35 );
	var grass = mix( ${ srgb( 0.25, 0.32, 0.1 ) }, ${ srgb( 0.13, 0.2, 0.05 ) }, detail.y );
	grass = mix( grass, ${ srgb( 0.17, 0.12, 0.08 ) }, jungleW * 0.6 );
	let sand = mix( ${ srgb( 0.84, 0.78, 0.64 ) }, ${ srgb( 0.72, 0.7, 0.58 ) }, detail.z );
	let dirt = mix( ${ srgb( 0.36, 0.29, 0.19 ) }, ${ srgb( 0.24, 0.18, 0.12 ) }, detail.y );
	let rock = mix( ${ srgb( 0.2, 0.19, 0.15 ) }, ${ srgb( 0.36, 0.33, 0.26 ) }, detail.x );
	var albedo = mix( grass, sand, sandW );
	albedo = mix( albedo, dirt, pathW );
	albedo = mix( albedo, rock, rockW );
	let seabed = mix( sand, ${ srgb( 0.27, 0.29, 0.15 ) }, smoothstep( 0.3, 0.7, sp.z ) * 0.55 );
	albedo = mix( albedo, mix( seabed, rock, rockW ), underW );
	let wetFoam = terWetFoam( xz, h );
	let damp = smoothstep( 1.7, 0.5, h ) * sandW * 0.35;
	let wet = sat( wetFoam.x ) * landW;
	let wetK = max( wet, damp );
	albedo = mix( albedo, albedo * mat.wetDarken, wetK );
	albedo = mix( albedo, ${ srgb( 0.88, 0.9, 0.9 ) }, sat( wetFoam.y ) * landW * ( 1.0 - rockW ) );
	terMeadowW = landW * ( 1.0 - sandW ) * ( 1.0 - pathW ) * ( 1.0 - rockW ) * ( 1.0 - jungleW );
	s.albedo = albedo;
	s.roughness = mix( mix( 0.9, 0.8, rockW ), mix( 0.42, 0.16, wet ), wetK );
	s.normal = N0;
	s.ao = sat( nr.w );
`;
