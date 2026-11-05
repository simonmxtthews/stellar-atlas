import { beforeEach, describe, expect, it } from 'vitest';
import { useUi } from '../../../src/store/ui';

const ui = () => useUi.getState();

beforeEach(() => {
  ui().clearSelection();
});

describe('selection', () => {
  it('select replaces the selection and opens the detail on the clicked star', () => {
    ui().select('a', 'a1');
    ui().select('b', 'b2');
    expect(ui().selectedSystemIds).toEqual(['b']);
    expect(ui().detail).toEqual({ systemId: 'b', starId: 'b2' });
  });

  it('shift-click adds, showing the newest system', () => {
    ui().select('a');
    ui().toggleSelect('b', 'b1');
    expect(ui().selectedSystemIds).toEqual(['a', 'b']);
    expect(ui().detail).toEqual({ systemId: 'b', starId: 'b1' });
  });

  it('shift-click on a selected system removes it and falls back to the latest', () => {
    ui().select('a');
    ui().toggleSelect('b');
    ui().toggleSelect('c');
    ui().toggleSelect('c');
    expect(ui().selectedSystemIds).toEqual(['a', 'b']);
    expect(ui().detail).toEqual({ systemId: 'b', starId: null });
  });

  it('removing a system that is not on show leaves the detail alone', () => {
    ui().select('a');
    ui().toggleSelect('b');
    ui().toggleSelect('a');
    expect(ui().selectedSystemIds).toEqual(['b']);
    expect(ui().detail?.systemId).toBe('b');
  });

  it('removing the last system closes the detail', () => {
    ui().select('a');
    ui().toggleSelect('a');
    expect(ui().selectedSystemIds).toEqual([]);
    expect(ui().detail).toBeNull();
  });

  it('closing the detail keeps the selection; clearing drops both', () => {
    ui().select('a');
    ui().closeDetail();
    expect(ui().selectedSystemIds).toEqual(['a']);
    expect(ui().detail).toBeNull();
    ui().select('a');
    ui().clearSelection();
    expect(ui().selectedSystemIds).toEqual([]);
    expect(ui().detail).toBeNull();
  });

  it('showStar switches star within the shown system', () => {
    ui().select('a', 'a1');
    ui().showStar('a2');
    expect(ui().detail).toEqual({ systemId: 'a', starId: 'a2' });
  });
});
