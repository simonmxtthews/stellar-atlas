import { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { galacticToScene } from '../../../src/lib/coords';
import {
  dropLineVertices,
  gridVertices,
  ringRadii,
  ringVertices,
  writeDropLineVisibility,
} from '../../../src/scene/gridGeometry';
import {
  buildStarAttributes,
  FLAG_SUN,
  FLAG_VISIBLE,
  sizeForAbsMag,
  writeStarFlags,
} from '../../../src/scene/starAttributes';
import { sol, starOf } from './fixtures';

describe('galacticToScene', () => {
  it('keeps the galactic centre on +X, north up and the plane horizontal', () => {
    expect(galacticToScene([1, 0, 0])).toEqual([1, 0, -0]);
    expect(galacticToScene([0, 0, 1])).toEqual([0, 1, -0]);
    expect(galacticToScene([0, 1, 0])).toEqual([0, 0, -1]);
  });
});

describe('sizeForAbsMag', () => {
  it('grows with brightness and clamps at both ends', () => {
    expect(sizeForAbsMag(-2)).toBeGreaterThan(sizeForAbsMag(5));
    expect(sizeForAbsMag(5)).toBeGreaterThan(sizeForAbsMag(12));
    expect(sizeForAbsMag(-20)).toBe(sizeForAbsMag(-2));
    expect(sizeForAbsMag(30)).toBe(sizeForAbsMag(12));
    expect(sizeForAbsMag(undefined)).toBe(sizeForAbsMag(12));
  });
});

describe('buildStarAttributes', () => {
  const star = starOf({ id: 'hyg:7', pos: [1, 2, 3], colorHex: '#ff8000', absMag: 12 });
  const attributes = buildStarAttributes([star, sol]);

  it('stores scene positions and finds the Sun', () => {
    expect([...attributes.positions.slice(0, 3)]).toEqual([1, 3, -2]);
    expect(attributes.sunIndex).toBe(1);
    expect(attributes.sizes[1]).toBeGreaterThan(attributes.sizes[0] ?? Infinity);
  });

  it('keeps colours as authored, because the shaders write straight to the screen', () => {
    expect(attributes.colors[0]).toBeCloseTo(1);
    expect(attributes.colors[1]).toBeCloseTo(0x80 / 255);
    expect(attributes.colors[2]).toBeCloseTo(0);
  });
});

describe('flag writers', () => {
  it('marks visible stars and the Sun, and clears hidden ones', () => {
    const flags = new BufferAttribute(new Float32Array(3), 1);
    writeStarFlags(flags, new Uint8Array([1, 0, 1]), 2);
    expect([...flags.array]).toEqual([FLAG_VISIBLE, 0, FLAG_VISIBLE | FLAG_SUN]);
  });

  it('writes drop-line visibility for both ends of each line', () => {
    const visibility = new BufferAttribute(new Float32Array(4), 1);
    writeDropLineVisibility(visibility, new Uint8Array([0, 1]));
    expect([...visibility.array]).toEqual([0, 0, 1, 1]);
  });
});

describe('plane overlays', () => {
  it('places a ring every 5 ly up to the radius', () => {
    expect(ringRadii(5)).toEqual([5]);
    expect(ringRadii(23)).toEqual([5, 10, 15, 20]);
    expect(ringRadii(100)).toHaveLength(20);
  });

  it('draws rings on the plane at their radius', () => {
    const vertices = ringVertices([5, 10]);
    for (let i = 0; i < vertices.length; i += 3) {
      expect(vertices[i + 1]).toBe(0);
      const r = Math.hypot(vertices[i] ?? 0, vertices[i + 2] ?? 0);
      expect(Math.min(Math.abs(r - 5), Math.abs(r - 10))).toBeLessThan(1e-4);
    }
  });

  it('clips the grid to the radius, on the plane', () => {
    const vertices = gridVertices(50);
    expect(vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < vertices.length; i += 3) {
      expect(vertices[i + 1]).toBe(0);
      expect(Math.hypot(vertices[i] ?? 0, vertices[i + 2] ?? 0)).toBeLessThanOrEqual(50 + 1e-3);
    }
  });

  it('drops each star straight to the plane', () => {
    expect([...dropLineVertices(new Float32Array([1, 2, 3, 4, -5, 6]))]).toEqual([
      1, 2, 3, 1, 0, 3, 4, -5, 6, 4, 0, 6,
    ]);
  });
});
