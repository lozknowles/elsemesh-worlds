import { preflightLandscape } from './landscape-render';
import { freezeLandscapeTerrainPicking } from './landscape-picking';
/* eslint-disable react-hooks/set-state-in-effect -- A cancelled pointer transaction must clear its transient scene preview. */
import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as T from 'three';
import type { WorldProject, Vec3 } from '../domain/world';
import {
  applyLandscapeBrush,
  applyLandscapeArea,
  createLandscapePondBoundary,
  applyLandscapePond,
} from '../domain/landscape';
export type LandscapeTool = {
  enabled: boolean;
  layerId: string;
  shape: 'brush' | 'area' | 'pond';
  irregularity: number;
  gradeBanks: boolean;
  bankWidth: number;
  bedDepth: number;
  mode: 'paint' | 'replace' | 'erase';
  radius: number;
  strength: number;
  falloff: number;
};
export default function LandscapeGesture({
  project,
  tool,
  onDraft,
  onCommit,
  onError,
  finish,
  cancel,
  onBoundary,
}: {
  project: WorldProject;
  tool: LandscapeTool;
  onDraft: (p: WorldProject | null) => void;
  onCommit: (p: WorldProject) => void;
  onError: (s: string) => void;
  finish: number;
  cancel: number;
  onBoundary: (n: number) => void;
}) {
  const { gl, camera, scene } = useThree(),
    latest = useRef({ project, tool, onDraft, onCommit, onError, onBoundary });
  useLayoutEffect(() => {
    latest.current = { project, tool, onDraft, onCommit, onError, onBoundary };
  });
  const boundary = useRef<Vec3[]>([]),
    [points, setPoints] = useState<Vec3[]>([]),
    stroke = useRef<{
      base: WorldProject;
      points: Vec3[];
      id: number;
      tool: LandscapeTool;
      pond?: {
        center: Vec3;
        radius: number;
        irregularity: number;
        onTerrain: boolean;
        picking: ReturnType<typeof freezeLandscapeTerrainPicking>;
      };
    } | null>(null),
    raf = useRef(0);
  const reset = () => {
    boundary.current = [];
    setPoints([]);
    latest.current.onBoundary(0);
    latest.current.onDraft(null);
  };
  const complete = () => {
    const c = latest.current;
    if (boundary.current.length < 3) return;
    try {
      c.onCommit(
        applyLandscapeArea(c.project, {
          layerId: c.tool.layerId,
          boundary: boundary.current,
          strength: c.tool.strength,
          mode: c.tool.mode,
        }),
      );
      reset();
    } catch (e) {
      c.onError(String((e as Error).message));
    }
  };
  const finishRef = useRef(complete);
  useLayoutEffect(() => {
    finishRef.current = complete;
  });
  useEffect(() => {
    if (finish) finishRef.current();
  }, [finish]);
  useEffect(() => {
    reset();
  }, [cancel, tool.layerId, tool.enabled, tool.shape]);
  useEffect(() => {
    if (!tool.enabled) return;
    const canvas = gl.domElement,
      ray = new T.Raycaster(),
      v = new T.Vector2();
    const hit = (
      e: PointerEvent,
      picking?: ReturnType<typeof freezeLandscapeTerrainPicking>,
    ): Vec3 | null => {
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
      ray.setFromCamera(v, camera);
      if (picking) {
        const p = picking.hit(ray);
        return p ? [p.x, p.y, p.z] : null;
      }
      const surfaces: T.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.placementSurface === 'terrain') surfaces.push(o);
      });
      const h = ray.intersectObjects(surfaces, false)[0];
      return h ? [h.point.x, h.point.y, h.point.z] : null;
    };
    const applyStroke = (s: NonNullable<typeof stroke.current>) => {
      if (!s.pond) return applyLandscapeBrush(s.base, { ...s.tool, points: s.points });
      if (!s.pond.onTerrain) throw Error('Move the pointer back onto terrain before releasing the pond.');
      const outline = createLandscapePondBoundary(s.pond.center, s.pond.radius, s.pond.irregularity);
      // Reject the whole outline at world edges; clipping individual points creates flat shores.
      if (
        outline.some(
          (p) => Math.abs(p[0]) >= s.base.terrain.width / 2 || Math.abs(p[2]) >= s.base.terrain.depth / 2,
        )
      )
        throw Error('Pond extends beyond the terrain. Drag a smaller radius or start farther from the edge.');
      if (s.tool.gradeBanks)
        return applyLandscapePond(s.base, {
          layerId: s.tool.layerId,
          center: s.pond.center,
          radius: s.pond.radius,
          irregularity: s.pond.irregularity,
          bankWidth: s.tool.bankWidth,
          bedDepth: s.tool.bedDepth,
          strength: s.tool.strength,
          mode: s.tool.mode,
        });
      return applyLandscapeArea(s.base, {
        layerId: s.tool.layerId,
        boundary: outline,
        strength: s.tool.strength,
        mode: s.tool.mode,
      });
    };
    const preview = () => {
      raf.current = 0;
      const s = stroke.current,
        c = latest.current;
      if (!s) return;
      try {
        const next = applyStroke(s);
        preflightLandscape(next);
        c.onDraft(next);
        c.onError('');
      } catch (e) {
        c.onDraft(null);
        c.onError((e as Error).message);
      }
    };
    const originalTabIndex = canvas.getAttribute('tabindex');
    canvas.tabIndex = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || stroke.current) return;
      const p = hit(e);
      if (!p) return;
      canvas.focus({ preventScroll: true });
      e.preventDefault();
      e.stopImmediatePropagation();
      const c = latest.current;
      if (c.tool.shape === 'area') {
        boundary.current = [...boundary.current, p];
        setPoints(boundary.current);
        c.onBoundary(boundary.current.length);
        return;
      }
      let picking: ReturnType<typeof freezeLandscapeTerrainPicking> | undefined;
      if (c.tool.shape === 'pond') {
        try {
          picking = freezeLandscapeTerrainPicking(scene);
        } catch (error) {
          c.onError((error as Error).message);
          return;
        }
      }
      stroke.current = {
        base: c.project,
        points: [p],
        id: e.pointerId,
        tool: { ...c.tool },
        ...(picking
          ? {
              pond: {
                center: p,
                radius: c.tool.radius,
                irregularity: c.tool.irregularity,
                onTerrain: true,
                picking,
              },
            }
          : {}),
      };
      if (stroke.current.pond) setPoints(createLandscapePondBoundary(p, c.tool.radius, c.tool.irregularity));
      canvas.setPointerCapture(e.pointerId);
      raf.current = requestAnimationFrame(preview);
    };
    const move = (e: PointerEvent) => {
      const s = stroke.current;
      if (!s || e.pointerId !== s.id) return;
      e.stopImmediatePropagation();
      const p = hit(e, s.pond?.picking);
      if (s.pond) s.pond.onTerrain = !!p;
      if (!p && s.pond) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        setPoints([]);
        latest.current.onDraft(null);
        latest.current.onError('Move the pointer back onto terrain before releasing the pond.');
        return;
      }
      if (p && s.pond) {
        s.pond.radius = Math.max(
          0.25,
          Math.min(100, Math.hypot(p[0] - s.pond.center[0], p[2] - s.pond.center[2])),
        );
        setPoints(createLandscapePondBoundary(s.pond.center, s.pond.radius, s.pond.irregularity));
        if (!raf.current) raf.current = requestAnimationFrame(preview);
        return;
      }
      if (
        p &&
        s.points.length < 2048 &&
        Math.hypot(p[0] - s.points.at(-1)![0], p[2] - s.points.at(-1)![2]) > 0.2
      ) {
        s.points.push(p);
        if (!raf.current) raf.current = requestAnimationFrame(preview);
      }
    };
    const end = (commit: boolean) => {
      const s = stroke.current,
        c = latest.current;
      if (!s) return;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      stroke.current = null;
      s.pond?.picking.dispose();
      if (canvas.hasPointerCapture(s.id)) canvas.releasePointerCapture(s.id);
      c.onDraft(null);
      setPoints([]);
      if (commit && c.project === s.base)
        try {
          c.onCommit(applyStroke(s));
          c.onError('');
        } catch (e) {
          c.onError((e as Error).message);
        }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === stroke.current?.id) {
        if (stroke.current.pond && !hit(e, stroke.current.pond.picking))
          stroke.current.pond.onTerrain = false;
        e.stopImmediatePropagation();
        end(true);
      }
    };
    const cancelled = () => {
      end(false);
      reset();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,select,textarea')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelled();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRef.current();
      }
    };
    canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancelled);
    window.addEventListener('blur', cancelled);
    window.addEventListener('keydown', key);
    return () => {
      end(false);
      if (originalTabIndex === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', originalTabIndex);
      canvas.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancelled);
      window.removeEventListener('blur', cancelled);
      window.removeEventListener('keydown', key);
    };
  }, [cancel, project, tool.enabled, tool.layerId, tool.shape, gl, camera, scene]);
  const line = useMemo(
    () =>
      points.length
        ? new T.BufferGeometry().setFromPoints(
            [...points, ...(points.length > 2 ? [points[0]!] : [])].map(
              (p) => new T.Vector3(p[0], p[1] + 0.15, p[2]),
            ),
          )
        : null,
    [points],
  );
  useEffect(() => () => line?.dispose(), [line]);
  return line ? (
    <lineLoop geometry={line} raycast={() => {}}>
      <lineBasicMaterial color="#f0d778" depthTest={false} />
    </lineLoop>
  ) : null;
}
