import * as T from 'three';

// Detached CPU-only meshes: graded preview renders may replace live terrain.
export function freezeLandscapeTerrainPicking(scene: T.Object3D) {
  const surfaces: T.Mesh[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // Materials are borrowed from the renderer.
    for (const surface of surfaces) surface.geometry.dispose();
    surfaces.length = 0;
  };
  try {
    scene.traverse((object) => {
      if (!(object instanceof T.Mesh) || object.userData.placementSurface !== 'terrain') return;
      object.updateWorldMatrix(true, false);
      const surface = new T.Mesh(object.geometry.clone(), object.material);
      surfaces.push(surface);
      surface.matrixAutoUpdate = false;
      surface.matrixWorldAutoUpdate = false;
      surface.matrix.copy(object.matrixWorld);
      surface.matrixWorld.copy(object.matrixWorld);
      surface.layers.mask = object.layers.mask;
    });
    if (!surfaces.length) throw Error('No terrain surface is available for this pond.');
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    hit(ray: T.Raycaster): T.Vector3 | null {
      if (disposed) return null;
      return ray.intersectObjects(surfaces, false)[0]?.point ?? null;
    },
    dispose,
  };
}
