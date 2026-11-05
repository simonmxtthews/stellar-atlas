import { useRef, useState, type ChangeEvent } from 'react';
import { routesCsv } from '../lib/csv';
import { downloadText, downloadUrl } from '../lib/download';
import {
  exportFileName,
  parseWorldFile,
  serialiseWorld,
  unknownIds,
  worldFileName,
} from '../lib/io';
import type { Catalogue } from '../store/catalogue';
import { useWorld } from '../store/world';
import type { World } from '../types/world';
import { BUTTON_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS } from './controlStyles';
import { RegionManager } from './RegionManager';
import { TagManager } from './TagManager';

interface PendingImport {
  readonly world: World;
  readonly unknown: readonly string[];
}

function ImportChoice({
  pending,
  onDone,
}: {
  readonly pending: PendingImport;
  readonly onDone: () => void;
}) {
  const replaceWorld = useWorld((state) => state.replaceWorld);
  const mergeWorld = useWorld((state) => state.mergeWorld);
  const { world, unknown } = pending;
  return (
    <div
      role="group"
      aria-label="Import"
      className="mt-2 rounded border border-slate-700 p-2 text-xs"
    >
      <p>
        “{world.name}”: {world.routes.length} routes, {world.tags.length} tags,{' '}
        {world.regions.length} regions, {Object.keys(world.starMeta).length} annotated stars.
      </p>
      {unknown.length > 0 && (
        <p data-testid="unknown-ids" className="mt-1 break-words text-amber-300">
          {unknown.length} ID{unknown.length === 1 ? '' : 's'} not in this catalogue, kept but not
          shown: {unknown.join(', ')}
        </p>
      )}
      <p className="mt-1 text-slate-400">
        Merge keeps this world's version of anything both share.
      </p>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => {
            replaceWorld(world);
            onDone();
          }}
          className={BUTTON_CLASS}
        >
          Replace this world
        </button>
        <button
          type="button"
          onClick={() => {
            mergeWorld(world);
            onDone();
          }}
          className={BUTTON_CLASS}
        >
          Merge
        </button>
        <button type="button" onClick={onDone} className={BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function WorldPanel({ catalogue }: { readonly catalogue: Catalogue }) {
  const world = useWorld((state) => state.world);
  const worldId = useWorld((state) => state.worldId);
  const otherWorlds = useWorld((state) => state.otherWorlds);
  const renameWorld = useWorld((state) => state.renameWorld);
  const createWorld = useWorld((state) => state.createWorld);
  const switchWorld = useWorld((state) => state.switchWorld);
  const deleteWorld = useWorld((state) => state.deleteWorld);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const others = Object.entries(otherWorlds);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still fires
    if (!file) return;
    setPending(null);
    setImportError(null);
    try {
      const imported = parseWorldFile(await file.text());
      const unknown = unknownIds(imported, catalogue.starsById, catalogue.systemsById);
      setPending({ world: imported, unknown });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>World name</span>
        <input
          type="text"
          value={world.name}
          onChange={(event) => renameWorld(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>

      <label className="mt-2 block">
        <span className={FIELD_LABEL_CLASS}>Switch world</span>
        <select
          value={worldId}
          onChange={(event) => switchWorld(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value={worldId}>{world.name}</option>
          {others.map(([id, other]) => (
            <option key={id} value={id}>
              {other.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => createWorld(`World ${others.length + 2}`)}
          className={BUTTON_CLASS}
        >
          New world
        </button>
        <button
          type="button"
          disabled={others.length === 0}
          onClick={() => {
            if (window.confirm(`Delete “${world.name}”? This can't be undone.`)) deleteWorld();
          }}
          className={BUTTON_CLASS}
        >
          Delete world
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(
              exportFileName(world, new Date()),
              serialiseWorld(world),
              'application/json',
            )
          }
          className={BUTTON_CLASS}
        >
          Export JSON
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={BUTTON_CLASS}>
          Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="World file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void onFile(event)}
        />
        <button
          type="button"
          onClick={() =>
            downloadText(
              worldFileName('routes', 'csv', world, new Date()),
              // The byte order mark is how Excel knows the file is UTF-8.
              `\uFEFF${routesCsv(world, catalogue.systems, catalogue.systemsById)}`,
              'text/csv',
            )
          }
          className={BUTTON_CLASS}
        >
          Export routes CSV
        </button>
        <button
          type="button"
          onClick={() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              downloadUrl(
                worldFileName('snapshot', 'png', world, new Date()),
                canvas.toDataURL('image/png'),
              );
            }
          }}
          className={BUTTON_CLASS}
        >
          Snapshot PNG
        </button>
      </div>
      {importError && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {importError}
        </p>
      )}
      {pending && <ImportChoice pending={pending} onDone={() => setPending(null)} />}

      <TagManager />
      <RegionManager />
    </>
  );
}
