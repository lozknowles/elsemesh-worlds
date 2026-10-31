# Lint-tool dependency audit fix

The 2026-10-31 audit reported twelve moderate findings from one installed
`minimatch@10.2.6` and its dependent lint tools. The affected path is ESLint,
`@eslint/config-array`, and `@typescript-eslint/typescript-estree`.
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
affects versions before 11.0.1.

At the time of this fix, even the newest parent releases still require minimatch
10.x: ESLint 10.14.0 uses `^10.2.6`, config-array 0.23.5 uses `^10.2.4`, and
typescript-estree 8.72.1 uses `^10.2.2`. A compatible lockfile refresh therefore
cannot select the patched major version.

The package overrides pin minimatch 11.0.1 only beneath those three parents.
Parent versions and application dependencies stay unchanged. The lockfile adds
the patched matcher's development-only `@isaacs/nonrecursive-glob-match`
dependency. No audit exception or threshold change is used. Remove these scoped
overrides when all three parent ranges accept a patched version normally.

Compatibility evidence: the patched package retains the CommonJS/ESM exports,
`Minimatch` class and named `minimatch` function used by the installed parents.
Its Node range remains `18 || 20 || >=22`. Validation used Node 24.19.0 and a clean
`npm ci`, followed by the unchanged audit threshold, lint, TypeScript/Vite build,
and all 247 tests across 33 files. All passed; audit reports zero vulnerabilities.
Lint retains one nonfatal existing React-hook warning in App.tsx.
An ESLint API coverage check selected 168 files, including all 120 expected
TypeScript/TSX source and script files; configured generated, dependency and
vendor paths remained ignored. No expected files were silently excluded.

## Review gates

- PLAN: architect required fresh advisory/range evidence, the smallest dependency
  resolution change, full CI-equivalent checks, and no audit suppression. The
  compatible-resolution route was ruled out by the three current parent ranges.
  Primary decision: use three scoped overrides and verify their actual APIs and
  complete lint/build/test behavior.
- COMPLETION: architect inspected the diff and installed tree and approved this
  scoped fix, requiring file-selection coverage and exact-commit remote CI.
  Coverage passed as described above. Primary decision: commit and push normally,
  retaining the audit policy and immutable engine provenance. The GitHub CI result
  is recorded with the change handoff; local checks alone are not remote CI proof.

This is a lint-tool dependency change. The game engine's already-generated
contract remains correctly pinned to its immutable source revision; this fix
does not regenerate or relabel that existing bundle.
