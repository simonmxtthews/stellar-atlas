import { Suspense, useMemo, useReducer } from 'react';
import type { Catalogue } from '../store/catalogue';
import { SOL_ID } from '../lib/filters';
import { movedScenePositions } from '../lib/mapTime';
import { useUi } from '../store/ui';
import type { Position, StarSystem } from '../types/catalogue';
import { CameraRig } from './CameraRig';
import { Grid } from './Grid';
import { Beacons, Highlights, RegionHalos, TagHalos } from './Highlights';
import { JumpNetwork } from './JumpNetwork';
import { Labels, TagBadges } from './Labels';
import { ProbeOverlay } from './ProbeOverlay';
import { RangeSpheres } from './RangeSpheres';
import { Routes } from './Routes';
import { SPACE_COLOR, WARN_COLOR } from '../lib/palette';
import { buildStarAttributes } from './starAttributes';
import { StarField } from './StarField';
import { StarPointer } from './StarPointer';
import type { SystemAnchor } from './systemAnchors';
import { useMapShift, useMapYears } from './useMapShift';

const REFERENCE_COLOR = WARN_COLOR;
const ORIGIN: Position = [0, 0, 0];

export function Scene({
  catalogue,
  mask,
  anchors,
  visibleSystems,
}: {
  readonly catalogue: Catalogue;
  readonly mask: Uint8Array;
  readonly anchors: readonly SystemAnchor[];
  readonly visibleSystems: readonly StarSystem[];
}) {
  const { stars, starsById, starIndexById, systemsById } = catalogue;
  const todaysAttributes = useMemo(() => buildStarAttributes(stars), [stars]);
  const years = useMapYears();
  const shift = useMapShift(systemsById);
  const attributes = useMemo(
    () => ({
      ...todaysAttributes,
      positions: movedScenePositions(todaysAttributes.positions, stars, systemsById, years),
    }),
    [stars, systemsById, todaysAttributes, years],
  );
  const referenceStarId = useUi((state) => state.referenceStarId);
  const reference = starsById.get(referenceStarId);
  const referencePos = useMemo(
    () => (reference ? shift(reference.pos, reference.systemId) : ORIGIN),
    [reference, shift],
  );
  const referenceBeacons = useMemo(
    () =>
      reference && reference.id !== SOL_ID ? [{ pos: referencePos, color: REFERENCE_COLOR }] : [],
    [reference, referencePos],
  );
  const [cameraEpoch, onCameraRest] = useReducer((epoch: number) => epoch + 1, 0);
  return (
    <>
      {/* Opaque rather than the page showing through, or a snapshot has no background. */}
      <color attach="background" args={[SPACE_COLOR]} />
      <CameraRig
        stars={stars}
        positions={attributes.positions}
        mask={mask}
        onCameraRest={onCameraRest}
      />
      <StarPointer stars={stars} positions={attributes.positions} mask={mask} />
      <Grid positions={attributes.positions} mask={mask} center={referencePos} />
      <JumpNetwork systems={visibleSystems} systemsById={systemsById} />
      <StarField attributes={attributes} mask={mask} />
      <Routes catalogue={catalogue} visibleSystems={visibleSystems} />
      <RangeSpheres catalogue={catalogue} />
      <Beacons beacons={referenceBeacons} />
      <RegionHalos positions={attributes.positions} anchors={anchors} />
      <TagHalos positions={attributes.positions} mask={mask} starIndexById={starIndexById} />
      <Highlights positions={attributes.positions} anchors={anchors} />
      {/* Stars stay up while the label font loads. */}
      <Suspense fallback={null}>
        <Labels
          catalogue={catalogue}
          positions={attributes.positions}
          anchors={anchors}
          visibleSystems={visibleSystems}
          cameraEpoch={cameraEpoch}
        />
        <TagBadges positions={attributes.positions} mask={mask} starIndexById={starIndexById} />
        <ProbeOverlay probeData={catalogue.probeData} />
      </Suspense>
    </>
  );
}
