import { useState, type FormEvent } from 'react';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { Star } from '../types/catalogue';
import { BUTTON_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS } from './controlStyles';
import { ModalSection } from './ModalSection';

export function StarWorldSection({ star }: { readonly star: Star }) {
  const meta = useWorld((state) => state.world.starMeta[star.id]);
  const tags = useWorld((state) => state.world.tags);
  const setCustomName = useWorld((state) => state.setCustomName);
  const setNotes = useWorld((state) => state.setNotes);
  const toggleStarTag = useWorld((state) => state.toggleStarTag);
  const addTag = useWorld((state) => state.addTag);
  const startRoute = useUi((state) => state.startRoute);
  const [newTag, setNewTag] = useState('');

  const createTag = (event: FormEvent) => {
    event.preventDefault();
    const label = newTag.trim();
    if (!label) return;
    toggleStarTag(star.id, addTag(label));
    setNewTag('');
  };

  return (
    <ModalSection title="World">
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Custom name</span>
        <input
          type="text"
          value={meta?.customName ?? ''}
          onChange={(event) => setCustomName(star.id, event.target.value)}
          className={INPUT_CLASS}
        />
      </label>

      <div className="mt-2">
        <span className={FIELD_LABEL_CLASS}>Tags</span>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              aria-pressed={meta?.tagIds.includes(tag.id) ?? false}
              onClick={() => toggleStarTag(star.id, tag.id)}
              className={`${BUTTON_CLASS} flex items-center gap-1`}
            >
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ background: tag.color }}
              />
              {tag.label}
            </button>
          ))}
        </div>
        <form onSubmit={createTag} className="mt-1 flex gap-1">
          <input
            type="text"
            aria-label="New tag"
            placeholder="New tag"
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            className={INPUT_CLASS}
          />
          <button type="submit" className={BUTTON_CLASS}>
            Add
          </button>
        </form>
      </div>

      <label className="mt-2 block">
        <span className={FIELD_LABEL_CLASS}>Notes</span>
        <textarea
          rows={3}
          value={meta?.notes ?? ''}
          onChange={(event) => setNotes(star.id, event.target.value)}
          className={INPUT_CLASS}
        />
      </label>

      <button
        type="button"
        onClick={() => startRoute(star.systemId)}
        className={`${BUTTON_CLASS} mt-2`}
      >
        Start route here
      </button>
    </ModalSection>
  );
}
