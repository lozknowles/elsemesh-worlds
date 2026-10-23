import { createContext } from 'react';
import type { NeonSignConfig } from '../domain/neon-sign';
export type NeonRuntimeState = { powered: boolean; effectStart: number; effectStartMs?: number; config?: NeonSignConfig };
export type NeonInteractionTarget = { id: string; name: string; kind: 'neon-sign'|'computer'; powered?: boolean };
export const NeonRuntimeContext = createContext<{ states: Record<string,NeonRuntimeState>; worldHour: number; serverOffsetMs?: number }>({states:{},worldHour:14});
