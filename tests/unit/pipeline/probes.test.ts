// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLAQUE_PULSARS,
  parseAtnfEphemerides,
  parseHorizonsVectors,
  plaquePulsars,
} from '../../../scripts/lib/probes';
import { probeDataSchema } from '../../../scripts/lib/schema';
import { closestApproaches } from '../../../src/lib/probes';
import type { ProbeData, StarSystem } from '../../../src/types/catalogue';

function read<T>(file: string): T {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../public/data', file), 'utf8'),
  );
}

const LY_PER_AU = 1.58125074e-5;

describe('Horizons parsing', () => {
  const text = `header
$$SOE
2460676.500000000, A.D. 2025-Jan-01 00:00:00.0000,  1.0E+02, -2.0E+01,  3.0E+00,  4.0E-03, -5.0E-03,  6.0E-03,
2460677.500000000, A.D. 2025-Jan-02 00:00:00.0000,  9.0E+02,  9.0E+01,  9.0E+00,  9.0E-03,  9.0E-03,  9.0E-03,
$$EOE
footer`;

  it('reads the first row of the vector table', () => {
    expect(parseHorizonsVectors(text)).toEqual({
      posAu: [100, -20, 3],
      velAuPerDay: [0.004, -0.005, 0.006],
    });
  });

  it('fails loudly on anything else', () => {
    expect(() => parseHorizonsVectors('No ephemeris for target')).toThrow(/no vector table/);
    expect(() => parseHorizonsVectors('$$SOE\nx, y, a, b, c, d, e, f,\n$$EOE')).toThrow(
      /unreadable/,
    );
  });
});

describe('ATNF parsing', () => {
  const html = `<html><pre>PSRJ            J0534+2200
RAJ             05:34:31.93   7.0e-05
DECJ            +22:00:52.19  1.0e-03
F0              29.9469230    1.0e-06
@-----------------------
PSRJ            J1243-6423
RAJ             12:43:17.1
DECJ            -64:23:23.8
P0              0.388
@-----------------------
</pre></html>`;

  it('reads position and period, by F0 or P0, and southern declinations', () => {
    const entries = parseAtnfEphemerides(html);
    const crab = entries.get('J0534+2200');
    expect(crab?.raDeg).toBeCloseTo(83.633, 2);
    expect(crab?.decDeg).toBeCloseTo(22.015, 2);
    expect(crab?.periodS).toBeCloseTo(0.03339, 4);
    const south = entries.get('J1243-6423');
    expect(south?.decDeg).toBeCloseTo(-64.39, 2);
    expect(south?.periodS).toBe(0.388);
  });

  it('rejects a plaque period far from the catalogue’s, as from a mispaired name', () => {
    const entries = new Map(
      PLAQUE_PULSARS.map(({ jName, plaqueConstant }) => [
        jName,
        { raDeg: 0, decDeg: 0, periodS: plaqueConstant / 1420405752 },
      ]),
    );
    expect(plaquePulsars(entries)).toHaveLength(14);
    entries.set('J0534+2200', { raDeg: 0, decDeg: 0, periodS: 3.7 });
    expect(() => plaquePulsars(entries)).toThrow(/B0531\+21/);
    entries.delete('J0534+2200');
    expect(() => plaquePulsars(entries)).toThrow(/J0534\+2200/);
  });

  it('holds exactly the plaque constants published in OEIS A350136', () => {
    const oeis = [
      550675372, 321746104, 509549854, 792520205, 764842161, 1014906390, 5320116676, 47057538,
      753751947, 359455043, 126726823, 551117432, 374101871, 1178486506,
    ];
    // OEIS runs counterclockwise round the map, and this list clockwise.
    expect(PLAQUE_PULSARS.map((pulsar) => pulsar.plaqueConstant)).toEqual([...oeis].reverse());
  });
});

describe('committed probes.json', () => {
  const data = read<ProbeData>('probes.json');
  const probe = (id: string) => {
    const found = data.probes.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`No probe ${id}`);
    return found;
  };

  it('passes its schema', () => {
    expect(() => probeDataSchema.parse(data)).not.toThrow();
  });

  it('has Voyager 1 where JPL has it in 2025: about 166 AU out at 16.9 km/s', () => {
    const voyager = probe('voyager-1');
    expect(Math.hypot(...voyager.pos) / LY_PER_AU).toBeCloseTo(165.7, 0);
    expect(voyager.speedKmS).toBeCloseTo(16.9, 1);
  });

  it('has velocities that agree with the stated speeds', () => {
    for (const { velLyPerYear, speedKmS } of data.probes) {
      expect(Math.hypot(...velLyPerYear) / (speedKmS / 299792.458)).toBeCloseTo(1, 3);
    }
  });

  it('heads each probe outward', () => {
    for (const { pos, velLyPerYear } of data.probes) {
      const cosine =
        (pos[0] * velLyPerYear[0] + pos[1] * velLyPerYear[1] + pos[2] * velLyPerYear[2]) /
        (Math.hypot(...pos) * Math.hypot(...velLyPerYear));
      expect(cosine).toBeGreaterThan(0.98);
    }
  });

  it('points to the Crab at its known galactic coordinates', () => {
    const crab = data.pulsars.find((pulsar) => pulsar.id === 'B0531+21');
    if (!crab) throw new Error('No Crab');
    const [x, y, z] = crab.direction;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    const longitude = (Math.atan2(y, x) * 180) / Math.PI;
    expect(longitude).toBeCloseTo(184.56 - 360, 1);
    expect((Math.asin(z) * 180) / Math.PI).toBeCloseTo(-5.78, 1);
  });

  it('runs clockwise round the plaque: longitude falls from the galactic centre', () => {
    const longitudes = data.pulsars.map(({ direction: [x, y] }) => {
      const degrees = (Math.atan2(y, x) * 180) / Math.PI;
      return degrees < 0 ? degrees + 360 : degrees;
    });
    expect(longitudes).toEqual([...longitudes].sort((a, b) => b - a));
  });

  it('finds approaches on the real catalogue, none behind the probe', () => {
    const systems = read<StarSystem[]>('systems.json');
    const voyager = probe('voyager-1');
    const found = closestApproaches(voyager, data.epochYear, systems, 5);
    expect(found.length).toBeGreaterThan(0);
    for (const { distanceLy, year } of found) {
      expect(distanceLy).toBeLessThanOrEqual(5);
      expect(year).toBeGreaterThan(data.epochYear);
    }
  });
});
