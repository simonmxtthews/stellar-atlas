import { useState, type FormEvent } from 'react';
import { useWorld } from '../store/world';
import { BUTTON_CLASS, INPUT_CLASS } from './controlStyles';

export function TagManager() {
  const tags = useWorld((state) => state.world.tags);
  const starMeta = useWorld((state) => state.world.starMeta);
  const addTag = useWorld((state) => state.addTag);
  const updateTag = useWorld((state) => state.updateTag);
  const deleteTag = useWorld((state) => state.deleteTag);
  const [label, setLabel] = useState('');

  const create = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    addTag(trimmed);
    setLabel('');
  };

  const uses = (tagId: string) =>
    Object.values(starMeta).filter(({ tagIds }) => tagIds.includes(tagId)).length;

  return (
    <section aria-label="Tags" className="mt-3">
      <h3 className="mb-1 section-label">Tags</h3>
      <ul>
        {tags.map((tag) => (
          <li key={tag.id} className="flex items-center gap-1 py-0.5">
            <input
              type="color"
              aria-label={`Colour of ${tag.label}`}
              value={tag.color}
              onChange={(event) => updateTag(tag.id, { color: event.target.value }, 'color')}
              className="h-7 w-8 shrink-0 rounded-md border border-line bg-field"
            />
            <input
              type="text"
              aria-label={`Name of ${tag.label}`}
              value={tag.label}
              onChange={(event) => updateTag(tag.id, { label: event.target.value }, 'label')}
              className={INPUT_CLASS}
            />
            <span className="text-xs text-muted tabular-nums">{uses(tag.id)}</span>
            <button
              type="button"
              aria-label={`Delete ${tag.label}`}
              onClick={() => deleteTag(tag.id)}
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
          aria-label="New tag name"
          placeholder="New tag"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={INPUT_CLASS}
        />
        <button type="submit" className={BUTTON_CLASS}>
          Add
        </button>
      </form>
    </section>
  );
}
