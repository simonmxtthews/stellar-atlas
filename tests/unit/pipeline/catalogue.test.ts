// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { validateCatalogue } from '../../../scripts/lib/schema';
import type { CatalogueMeta, Planet, Star, StarSystem } from '../../../src/types/catalogue';

// Checks the committed output of `npm run data` against stars we know the answers for.
function read<T>(file: string): T {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../public/data', file), 'utf8'),
  );
}

const stars = read<Star[]>('stars.json');
const systems = read<StarSystem[]>('systems.json');
const planets = read<Planet[]>('planets.json');
const meta = read<CatalogueMeta>('meta.json');

function starNamed(name: string): Star {
  const star = stars.find((s) => s.displayName === name || s.names.other.includes(name));
  if (!star) throw new Error(`No star named ${name}`);
  return star;
}

const planetNamed = (name: string) => planets.find((planet) => planet.name === name);
const hostOf = (name: string) => stars.find((s) => s.id === planetNamed(name)?.hostStarId);

describe('generated catalogue', () => {
  it('passes schema and reference validation', () => {
    expect(() => validateCatalogue({ stars, systems, planets, meta })).not.toThrow();
  });

  it('agrees with the counts in meta.json', () => {
    expect(meta.counts).toEqual({
      stars: stars.length,
      systems: systems.length,
      planets: planets.length,
    });
  });

  it('has the Sun at the origin', () => {
    const sol = starNamed('Sol');
    expect(sol.pos).toEqual([0, 0, 0]);
    expect(sol.distLy).toBe(0);
    expect(sol.isPrimary).toBe(true);
  });

  it('places known stars at the right distances', () => {
    expect(Math.abs(starNamed('Rigil Kentaurus').distLy - 4.37)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(starNamed('Sirius').distLy - 8.6)).toBeLessThanOrEqual(0.05);
  });

  it('keeps position and distance consistent, and everything within 100 ly', () => {
    for (const star of stars) {
      expect(Math.hypot(...star.pos)).toBeCloseTo(star.distLy, 1);
      expect(star.distLy).toBeLessThanOrEqual(100);
    }
  });

  it('orients the map galactically: Sirius sits towards the anticentre', () => {
    expect(starNamed('Sirius').pos[0]).toBeLessThan(0);
  });

  it('groups Alpha Centauri, Proxima included, under one name', () => {
    const system = systems.find((s) => s.name === 'Alpha Centauri');
    expect(system?.starIds).toHaveLength(3);
    expect(system?.starIds[0]).toBe(starNamed('Rigil Kentaurus').id);
    expect(starNamed('Proxima Centauri').systemId).toBe(system?.id);
    expect(system?.planetCount).toBeGreaterThan(0);
  });

  it('gives the Sun its eight planets, from the Sun outwards, with only Earth in the zone', () => {
    const ours = starNamed('Sol').planetIds.flatMap((id) => planets.find((p) => p.id === id) ?? []);
    expect(ours.map((planet) => planet.name)).toEqual([
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ]);
    expect(ours.filter((planet) => planet.inHabitableZone).map((planet) => planet.name)).toEqual([
      'Earth',
    ]);
  });

  it('resolves well-known planet hosts', () => {
    expect(hostOf('Proxima Cen b')?.displayName).toBe('Proxima Centauri');
    // The archive retires individual planets, so these only require the host to have some.
    for (const name of ['Tau Ceti', 'Ran', "Barnard's Star", "Teegarden's Star"]) {
      expect(starNamed(name).planetIds.length).toBeGreaterThan(0);
    }
    expect(starNamed("Teegarden's Star").source).toBe('exoplanet-archive');
  });

  it('lists every archive-only host in meta.json', () => {
    const hostnames = meta.unmatchedHosts.map((host) => host.hostname);
    expect(hostnames).toContain("Teegarden's Star");
    expect(hostnames).toHaveLength(stars.filter((s) => s.source === 'exoplanet-archive').length);
  });

  it('flags the famous temperate planets as habitable-zone', () => {
    for (const name of ['Proxima Cen b', 'TRAPPIST-1 e', "Teegarden's Star b"]) {
      expect(planetNamed(name)?.inHabitableZone).toBe(true);
    }
    expect(planetNamed('TRAPPIST-1 b')?.inHabitableZone).toBe(false);
  });

  it('includes the nearby objects HYG lacks', () => {
    expect(starNamed('Luhman 16 A').distLy).toBeCloseTo(6.5, 1);
    expect(starNamed('Luhman 16 A').systemId).toBe(starNamed('Luhman 16 B').systemId);
    expect(starNamed('WISE 0855-0714').spectral.cls).toBe('Y');
    expect(starNamed('Epsilon Indi Ba').systemId).toBe(starNamed('Epsilon Indi').systemId);
  });

  it('keeps every system member close to its primary', () => {
    const byId = new Map(stars.map((star) => [star.id, star]));
    for (const system of systems) {
      for (const id of system.starIds) {
        const star = byId.get(id);
        expect(star?.systemId).toBe(system.id);
        if (star)
          expect(
            Math.hypot(
              star.pos[0] - system.pos[0],
              star.pos[1] - system.pos[1],
              star.pos[2] - system.pos[2],
            ),
          ).toBeLessThan(2);
      }
    }
  });

  it('stays within the 1 MB gzipped load target', () => {
    const raw = readFileSync(resolve(import.meta.dirname, '../../../public/data/stars.json'));
    expect(gzipSync(raw).byteLength).toBeLessThan(1_000_000);
  });
});
