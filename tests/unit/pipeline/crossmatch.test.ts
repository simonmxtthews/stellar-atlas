// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { HostQuery, MatchCandidate } from '../../../scripts/lib/crossmatch';
import { matchHosts } from '../../../scripts/lib/crossmatch';

// Real HYG values, with archive names and coordinates to match.
const PROXIMA: MatchCandidate = {
  id: 'hyg:70666',
  hip: '70890',
  gliese: 'Gl 551',
  raDeg: 217.4289,
  decDeg: -62.6795,
  distPc: 1.2959,
};
const TAU_CETI: MatchCandidate = {
  id: 'hyg:8087',
  hip: '8102',
  hd: '10700',
  gliese: 'Gl 71',
  raDeg: 26.0171,
  decDeg: -15.9375,
  distPc: 3.6502,
};
const EPS_ERI: MatchCandidate = {
  id: 'hyg:16496',
  hip: '16537',
  hd: '22049',
  gliese: 'Gl 144',
  raDeg: 53.2327,
  decDeg: -9.4583,
  distPc: 3.2161,
};
const BARNARD: MatchCandidate = {
  id: 'hyg:87665',
  gliese: 'Gl 699',
  raDeg: 269.4541,
  decDeg: 4.6683,
  distPc: 1.8238,
  pmRaMasYr: -797.84,
  pmDecMasYr: 10326.93,
};
const STARS = [PROXIMA, TAU_CETI, EPS_ERI, BARNARD];

const host = (hostname: string, fields: Partial<HostQuery> = {}): HostQuery => ({
  hostname,
  raDeg: 1,
  decDeg: 1,
  distPc: 5,
  ...fields,
});

const matchOne = (query: HostQuery, stars: readonly MatchCandidate[] = STARS) =>
  matchHosts([query], stars).matches[0];

describe('matchHosts', () => {
  it('resolves Proxima Cen b to Proxima Centauri by HIP', () => {
    expect(matchOne(host('Proxima Cen', { hipName: 'HIP 70890' }))).toMatchObject({
      starId: PROXIMA.id,
      method: 'hip',
    });
  });

  it('resolves Tau Ceti by HD when the HIP is absent', () => {
    expect(matchOne(host('tau Cet', { hdName: 'HD 10700' }))).toMatchObject({
      starId: TAU_CETI.id,
      method: 'hd',
    });
  });

  it('prefers HIP over HD', () => {
    const query = host('x', { hipName: 'HIP 16537', hdName: 'HD 10700' });
    expect(matchOne(query)).toMatchObject({ starId: EPS_ERI.id, method: 'hip' });
  });

  it('reads catalogue numbers from the hostname too', () => {
    expect(matchOne(host('HD 22049'))).toMatchObject({ starId: EPS_ERI.id, method: 'hd' });
  });

  it('matches Gliese names across spellings', () => {
    expect(matchOne(host('GJ 699'))).toMatchObject({ starId: BARNARD.id, method: 'gliese' });
    expect(matchOne(host('Gliese 71'))).toMatchObject({ starId: TAU_CETI.id, method: 'gliese' });
  });

  it('matches a bare or A-suffixed Gliese name to the primary, never to a B', () => {
    const a: MatchCandidate = { ...PROXIMA, id: 'a', hip: '1', gliese: 'Gl 15A' };
    const b: MatchCandidate = { ...PROXIMA, id: 'b', hip: '2', gliese: 'Gl 15B' };
    expect(matchOne(host('GJ 15'), [b, a])?.starId).toBe('a');
    expect(matchOne(host('GJ 15 A'), [b, a])?.starId).toBe('a');
    expect(matchOne(host('GJ 15 B'), [a, b])?.starId).toBe('b');
    expect(matchOne(host('GJ 15 B'), [a])).toBeUndefined();
  });

  it('falls back to position within 60 arcsec and 10% distance', () => {
    const near = host('Epsilon Eridani', { raDeg: 53.2327, decDeg: -9.45, distPc: 3.3 });
    const match = matchOne(near);
    expect(match).toMatchObject({ starId: EPS_ERI.id, method: 'position' });
    expect(match?.separationArcsec).toBeCloseTo(30, 0);
  });

  it('rejects a position match that is too far on the sky', () => {
    const query = host('x', { raDeg: 53.2327, decDeg: -9.4583 + 61 / 3600, distPc: 3.2161 });
    expect(matchOne(query)).toBeUndefined();
  });

  it('rejects a position match at the wrong distance', () => {
    const query = host('x', { raDeg: 53.2327, decDeg: -9.4583, distPc: 3.2161 * 1.2 });
    expect(matchOne(query)).toBeUndefined();
  });

  it("carries the HYG position forward, since Barnard's Star moves 165 arcsec in 16 years", () => {
    const query = host("Barnard's star", { raDeg: 269.4486, decDeg: 4.7142, distPc: 1.83 });
    expect(matchOne(query)).toMatchObject({ starId: BARNARD.id, method: 'position' });
    const motionless: MatchCandidate = { ...BARNARD, pmRaMasYr: 0, pmDecMasYr: 0 };
    expect(matchOne(query, [motionless])).toBeUndefined();
  });

  it("reports Teegarden's Star as unmatched, as HYG has no such star", () => {
    const teegarden = host("Teegarden's Star", { raDeg: 43.27, decDeg: 16.86, distPc: 3.83 });
    const result = matchHosts([teegarden], STARS);
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([teegarden]);
  });

  it('never gives one star to two hosts, and names beat positions', () => {
    const byPosition = host('Position', { raDeg: 53.2327, decDeg: -9.4583, distPc: 3.2161 });
    const byName = host('Named', { hipName: 'HIP 16537' });
    const result = matchHosts([byPosition, byName], STARS);
    expect(result.matches).toEqual([{ hostname: 'Named', starId: EPS_ERI.id, method: 'hip' }]);
    expect(result.unmatched).toEqual([byPosition]);
  });

  it('will not give a named component to a star labelled as another', () => {
    const a: MatchCandidate = { ...EPS_ERI, gliese: 'Gl 144A' };
    const query = host('Star B', { raDeg: 53.2327, decDeg: -9.4583, distPc: 3.2161 });
    expect(matchOne(query, [a])).toBeUndefined();
  });
});
