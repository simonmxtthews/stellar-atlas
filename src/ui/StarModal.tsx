import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useMemo, type ReactNode } from 'react';
import { distanceFromReference, SOL_ID } from '../lib/filters';
import { nearestSystems } from '../lib/neighbours';
import {
  archiveOverviewUrl,
  designations,
  formatSignificant,
  formatValue,
  spectralCode,
  spectralReading,
} from '../lib/starFacts';
import { formatTravelTime, systemTravelTime } from '../lib/travel';
import { customNameOf } from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { Planet, Star, StarSystem } from '../types/catalogue';
import { HzStrip } from './HzStrip';
import { ModalSection } from './ModalSection';
import { RangeSection } from './RangeSection';
import { StarWorldSection } from './StarWorldSection';

const NEIGHBOUR_COUNT = 8;

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-hairline py-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function StarFacts({ star, reference }: { readonly star: Star; readonly reference?: Star }) {
  const [x, y, z] = star.pos;
  return (
    <ModalSection title="Star facts">
      <dl>
        <Fact
          label="Spectral type"
          value={`${spectralCode(star.spectral)} — ${spectralReading(star.spectral)}`}
        />
        <Fact label="Temperature" value={formatValue(star.tempK, 0, 'K')} />
        <Fact label="Luminosity" value={formatSignificant(star.lumSolar, 'L☉')} />
        <Fact
          label="Mass"
          value={`${formatSignificant(star.massSolar, 'M☉')}${
            star.massSolar !== undefined && star.massEstimated ? ' (est.)' : ''
          }`}
        />
        <Fact label="Apparent magnitude" value={formatValue(star.mag, 2)} />
        <Fact label="Absolute magnitude" value={formatValue(star.absMag, 2)} />
        <Fact label="Distance from Sol" value={formatValue(star.distLy, 2, 'ly')} />
        {reference && reference.id !== SOL_ID && (
          <Fact
            label={`Distance from ${reference.displayName}`}
            value={formatValue(distanceFromReference(star, reference), 2, 'ly')}
          />
        )}
        <Fact
          label="Galactic x, y, z"
          value={`${formatValue(x, 2)}, ${formatValue(y, 2)}, ${formatValue(z, 2)} ly`}
        />
      </dl>
    </ModalSection>
  );
}

const SOLAR_FACT_SHEET = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';

function PlanetsTable({ planets }: { readonly planets: readonly Planet[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs whitespace-nowrap">
        <thead className="text-muted">
          <tr>
            {[
              'Name',
              'Mass (M⊕)',
              'Radius (R⊕)',
              'Period (d)',
              'SMA (AU)',
              'Eq. temp (K)',
              'Discovery',
              'HZ',
            ].map((heading) => (
              <th key={heading} scope="col" className="py-1 pr-3 font-normal">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {planets.map((planet) => (
            <tr key={planet.id} className="border-t border-hairline">
              <th scope="row" className="py-1 pr-3 font-medium">
                {planet.name}
              </th>
              <td className="pr-3">{formatValue(planet.massEarth, 2)}</td>
              <td className="pr-3">{formatValue(planet.radiusEarth, 2)}</td>
              <td className="pr-3">{formatValue(planet.periodDays, 2)}</td>
              <td className="pr-3">{formatValue(planet.semiMajorAu, 3)}</td>
              <td className="pr-3">{formatValue(planet.eqTempK, 0)}</td>
              <td className="pr-3">
                {planet.discoveryMethod}
                {planet.discoveryYear !== undefined && `, ${planet.discoveryYear}`}
              </td>
              <td>
                {planet.inHabitableZone === undefined
                  ? '—'
                  : planet.inHabitableZone
                    ? 'In zone'
                    : 'No'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Planets({ star, catalogue }: { readonly star: Star; readonly catalogue: Catalogue }) {
  const planets = star.planetIds.flatMap((id) => catalogue.planetsById.get(id) ?? []);
  const first = planets[0];
  return (
    <ModalSection title="Planets">
      {first ? (
        <PlanetsTable planets={planets} />
      ) : (
        <p className="text-muted">No confirmed exoplanets</p>
      )}
      <HzStrip star={star} planets={planets} />
      {first && (
        <a
          href={
            star.id === SOL_ID ? SOLAR_FACT_SHEET : archiveOverviewUrl(first.name, first.letter)
          }
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-accent hover:underline"
        >
          {star.id === SOL_ID ? 'NASA Planetary Fact Sheet' : 'NASA Exoplanet Archive overview'}
        </a>
      )}
    </ModalSection>
  );
}

function Neighbours({
  system,
  catalogue,
}: {
  readonly system: StarSystem;
  readonly catalogue: Catalogue;
}) {
  const select = useUi((state) => state.select);
  const drive = useWorld((state) => state.world.drive);
  const neighbours = useMemo(
    () => nearestSystems(system, catalogue.systems, NEIGHBOUR_COUNT),
    [catalogue, system],
  );
  return (
    <ModalSection title="Nearest neighbours">
      <ol>
        {neighbours.map(({ system: neighbour, distanceLy }) => (
          <li key={neighbour.id}>
            <button
              type="button"
              onClick={() => select(neighbour.id)}
              className="flex w-full justify-between gap-3 rounded px-1 py-0.5 text-left hover:bg-raised"
            >
              <span className="truncate">{neighbour.name}</span>
              <span data-testid="neighbour-distance" className="text-right text-muted tabular-nums">
                {formatValue(distanceLy, 2, 'ly')} ·{' '}
                {formatTravelTime(
                  systemTravelTime(drive, catalogue.systems, system.id, neighbour.id, distanceLy),
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </ModalSection>
  );
}

function planetCountLabel(star: Star): string {
  const count = star.planetIds.length;
  if (count === 0) return star.displayName;
  return `${star.displayName} · ${count} planet${count === 1 ? '' : 's'}`;
}

export function StarModal({ catalogue }: { readonly catalogue: Catalogue }) {
  const detail = useUi((state) => state.detail);
  const closeDetail = useUi((state) => state.closeDetail);
  const showStar = useUi((state) => state.showStar);
  const starMeta = useWorld((state) => state.world.starMeta);
  const referenceStarId = useUi((state) => state.referenceStarId);

  const system = detail && catalogue.systemsById.get(detail.systemId);
  const members = system?.starIds.flatMap((id) => catalogue.starsById.get(id) ?? []) ?? [];
  const star = members.find((member) => member.id === detail?.starId) ?? members[0];
  if (!system || !star) return null;
  const names = designations(star);
  const customName = customNameOf(starMeta, star.id);

  return (
    // Non-modal: the map stays interactive behind it and keeps the keyboard. Esc is handled with
    // the other map keys, since it also clears the selection once this is closed.
    <Dialog.Root open modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed top-3 right-3 bottom-3 z-10 w-[26rem] overflow-y-auto rounded-xl border border-line shadow-panel bg-panel p-4 text-sm text-ink backdrop-blur max-md:inset-0 max-md:w-auto max-md:rounded-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-medium">{star.displayName}</Dialog.Title>
              {customName && (
                <p data-testid="custom-name" className="text-sm text-accent-soft">
                  {customName}
                </p>
              )}
              {system.name !== star.displayName && (
                <p className="text-xs text-muted">{system.name} system</p>
              )}
            </div>
            <Dialog.Close
              onClick={closeDetail}
              aria-label="Close"
              className="rounded px-2 py-0.5 text-muted hover:bg-raised"
            >
              ✕
            </Dialog.Close>
          </div>
          {names.length > 0 && (
            <p data-testid="designations" className="mt-1 text-xs text-muted">
              {names.join(' · ')}
            </p>
          )}

          {members.length > 1 && (
            <Tabs.Root value={star.id} onValueChange={showStar} className="mt-3">
              <Tabs.List aria-label="Stars in this system" className="flex flex-wrap gap-1">
                {members.map((member) => (
                  <Tabs.Trigger
                    key={member.id}
                    value={member.id}
                    className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-soft transition-colors hover:bg-raised data-[state=active]:border-accent/50 data-[state=active]:bg-accent/15 data-[state=active]:text-accent-soft"
                  >
                    {planetCountLabel(member)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs.Root>
          )}

          <StarFacts star={star} reference={catalogue.starsById.get(referenceStarId)} />
          <Planets star={star} catalogue={catalogue} />
          <Neighbours system={system} catalogue={catalogue} />
          <StarWorldSection star={star} />
          <RangeSection system={system} catalogue={catalogue} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
