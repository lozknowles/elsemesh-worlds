import { preflightLandscape } from './landscape-render';
/* eslint-disable react-hooks/set-state-in-effect -- A cancelled pointer transaction must clear its transient scene preview. */
import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as T from 'three';
import type { WorldProject, Vec3 } from '../domain/world';
import { applyLandscapeBrush, applyLandscapeArea } from '../domain/landscape';
export type LandscapeTool = {
  enabled: boolean;
  layerId: string;
  shape: 'brush' | 'area';
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
    stroke = useRef<{ base: WorldProject; points: Vec3[]; id: number } | null>(null),
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
    const hit = (e: PointerEvent): Vec3 | null => {
      const r = canvas.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
      ray.setFromCamera(v, camera);
      const surfaces: T.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.placementSurface === 'terrain') surfaces.push(o);
      });
      const h = ray.intersectObjects(surfaces, false)[0];
      return h ? [h.point.x, h.point.y, h.point.z] : null;
    };
    const preview = () => {
      raf.current = 0;
      const s = stroke.current,
        c = latest.current;
      if (!s) return;
      try {
        const next = applyLandscapeBrush(s.base, { ...c.tool, points: s.points });
        preflightLandscape(next);
        c.onDraft(next);
      } catch (e) {
        c.onError((e as Error).message);
      }
    };
    const originalTabIndex = canvas.getAttribute('tabindex');
    canvas.tabIndex = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
      stroke.current = { base: c.project, points: [p], id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      raf.current = requestAnimationFrame(preview);
    };
    const move = (e: PointerEvent) => {
      const s = stroke.current;
      if (!s || e.pointerId !== s.id) return;
      e.stopImmediatePropagation();
      const p = hit(e);
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
      if (canvas.hasPointerCapture(s.id)) canvas.releasePointerCapture(s.id);
      c.onDraft(null);
      if (commit)
        try {
          c.onCommit(applyLandscapeBrush(s.base, { ...c.tool, points: s.points }));
        } catch (e) {
          c.onError((e as Error).message);
        }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === stroke.current?.id) {
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
  }, [tool.enabled, gl, camera, scene]);
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
