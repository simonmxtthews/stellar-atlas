import { useState, type FormEvent } from 'react';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import { BUTTON_CLASS, INPUT_CLASS } from './controlStyles';

export function RegionManager() {
  const regions = useWorld((state) => state.world.regions);
  const addRegion = useWorld((state) => state.addRegion);
  const updateRegion = useWorld((state) => state.updateRegion);
  const deleteRegion = useWorld((state) => state.deleteRegion);
  const addSystemsToRegion = useWorld((state) => state.addSystemsToRegion);
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  const [name, setName] = useState('');

  const create = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    addRegion(trimmed);
    setName('');
  };

  return (
    <section aria-label="Regions" className="mt-3">
      <h3 className="mb-1 section-label">Regions</h3>
      <p className="text-xs text-muted">
        Add the selected systems here, or one at a time from a star's detail panel.
      </p>
      <ul>
        {regions.map((region) => (
          <li key={region.id} className="flex items-center gap-1 py-0.5">
            <input
              type="color"
              aria-label={`Colour of ${region.name}`}
              value={region.color}
              onChange={(event) => updateRegion(region.id, { color: event.target.value }, 'color')}
              className="h-7 w-8 shrink-0 rounded-md border border-line bg-field"
            />
            <input
              type="text"
              aria-label={`Name of ${region.name}`}
              value={region.name}
              onChange={(event) => updateRegion(region.id, { name: event.target.value }, 'name')}
              className={INPUT_CLASS}
            />
            <span className="text-xs text-muted tabular-nums">{region.systemIds.length}</span>
            <button
              type="button"
              aria-label={`Add selected systems to ${region.name}`}
              disabled={selectedSystemIds.length === 0}
              onClick={() => addSystemsToRegion(region.id, selectedSystemIds)}
              className={BUTTON_CLASS}
            >
              +{selectedSystemIds.length}
            </button>
            <button
              type="button"
              aria-label={`Delete ${region.name}`}
              onClick={() => deleteRegion(region.id)}
              className={BUTTON_CLASS}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="mt-1 flex gap-1">
        <input
          type="text"
          aria-label="New region name"
          placeholder="New region"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
        <button type="submit" className={BUTTON_CLASS}>
          Add
        </button>
      </form>
    </section>
  );
}
