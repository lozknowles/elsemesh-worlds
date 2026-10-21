import { useRef, useState } from 'react';
import type { WorldProject } from '../domain/world';
import { openWorldRepositoryFolder, saveWorldRepositoryFolder } from './repository-files';
import type { RepositoryBinding } from './repository-files';
import './RepositoryPanel.css';

export default function RepositoryPanel({ getProject, getGeneration, onOpen }: {
  getProject: () => WorldProject;
  getGeneration: () => number;
  onOpen: (project: WorldProject, generation: number) => boolean;
}) {
  const binding = useRef<{ value: RepositoryBinding; generation: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Save your world into its own local Git checkout, separate from the builder and engine.');
  const [folderName, setFolderName] = useState('');
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  async function run(mode: 'open' | 'save' | 'copy') {
    if (busy) return;
    const generation = getGeneration();
    const snapshot = getProject();
    setBusy(true);
    try {
      if (mode === 'open') {
        const result = await openWorldRepositoryFolder();
        if (getProject() !== snapshot || !onOpen(result.project, generation)) { setStatus('World changed while opening. Repository was not loaded.'); return; }
        binding.current = { value: result.binding, generation: getGeneration() };
        setFolderName(result.binding.handle.name);
        setStatus('Repository opened. All existing terrain, asset and weather tools are available.');
      } else {
        const previous = mode === 'save' && binding.current?.generation === generation ? binding.current.value : undefined;
        const next = await saveWorldRepositoryFolder(snapshot, previous);
        if (generation !== getGeneration()) { setStatus('The earlier world snapshot was saved; the current world is unchanged.'); return; }
        binding.current = { value: next, generation };
        setFolderName(next.handle.name);
        setStatus('World snapshot saved to folder. Commit and push it using GitHub Desktop or Git. Later edits need another Save to repository.');
      }
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'Folder selection cancelled.' : error instanceof Error ? error.message : 'Repository operation failed. Your active world is unchanged.');
    } finally { setBusy(false); }
  }
  return <section className="repository-panel" aria-label="World repository">
    <h3>World repository</h3>
    <p>Keep one world per repository. Terrain and scene settings are JSON; models and imagery are separate files with their source and licence metadata.</p>
    {folderName && <p className="repository-folder">Last repository folder: {folderName}</p>}
    <div className="repository-actions">
      <button disabled={busy || !supported} onClick={() => void run('open')}>Open repository folder</button>
      <button disabled={busy || !supported} onClick={() => void run('save')}>Save to repository</button>
      <button disabled={busy || !supported} onClick={() => void run('copy')}>Save repository as…</button>
    </div>
    <p role="status" aria-live="polite">{busy ? 'Working on repository files…' : status}</p>
    {!supported && <p>Folder access requires Edge or Chrome on localhost or HTTPS. Use Open and Save project for portable .emw files in this browser.</p>}
    <details><summary>Put this world on GitHub</summary>
      <ol><li>Save into an empty folder, or open an existing world repository checkout.</li><li>In GitHub Desktop, add that folder and create a repository. Publish it to your GitHub account.</li><li>After editing, save to the repository, review the changed files, then commit and push.</li><li>Other authors clone the repository and open its folder in this builder.</li></ol>
      <p>No GitHub token is needed by the builder. It writes content files; Git manages branches, commits and publishing. Asset licences remain your responsibility. Repository format support does not yet prove that the existing game can load this world.</p>
    </details>
  </section>;
}
