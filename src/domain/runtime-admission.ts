import { describeRuntimeWorld } from './runtime-world';
import type { WorldProject } from './world';
export type VerifiedRuntimeRegion = {worldId:string;regionId:string;ownerNodeId:string;authority:{nodeId:string;epoch:number}};
export type RuntimeAdmissionVerifiers = {
  verifyRegion: (proof: unknown) => VerifiedRuntimeRegion;
  verifyBinding: (proof: unknown) => boolean;
};
const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
/** Verifiers and trust stores are supplied by installed runtime software, never by world data. */
export function admitFederatedRuntimeWorld(project:WorldProject, contentDigest:string, binding:unknown, regionProof:unknown, verifiers:RuntimeAdmissionVerifiers) {
  if (!/^[a-f0-9]{64}$/.test(contentDigest) || !record(binding) || !verifiers.verifyBinding(binding)) throw new Error('World content admission signature is not trusted.');
  const region=verifiers.verifyRegion(regionProof);
  if (binding.kind!=='elsemesh.world-content-admission/1' || binding.authoredWorldId!==project.metadata.worldId || binding.authoredRegionId!==project.metadata.regionId || binding.contentDigest!==contentDigest || binding.federationWorldId!==region.worldId || binding.federationRegionId!==region.regionId || binding.authorityNodeId!==region.authority.nodeId || binding.authorityEpoch!==region.authority.epoch || binding.signer!==region.ownerNodeId) throw new Error('World content admission does not match this content, region or authority.');
  return {runtime:describeRuntimeWorld(project),region,contentDigest};
}
