import { Suspense, useMemo, useReducer } from 'react';
import type { Catalogue } from '../store/catalogue';
import { SOL_ID } from '../lib/filters';
import { useUi } from '../store/ui';
import type { StarSystem } from '../types/catalogue';
import { CameraRig } from './CameraRig';
import { Grid } from './Grid';
import { Beacons, Highlights, TagHalos } from './Highlights';
import { JumpNetwork } from './JumpNetwork';
import { Labels, TagBadges } from './Labels';
import { ProbeOverlay } from './ProbeOverlay';
import { RangeSpheres } from './RangeSpheres';
import { Routes } from './Routes';
import { buildStarAttributes } from './starAttributes';
import { StarField } from './StarField';
import { StarPointer } from './StarPointer';
import type { SystemAnchor } from './systemAnchors';

const REFERENCE_COLOR = '#fcd34d';

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
  const { stars, starsById, starIndexById } = catalogue;
  const attributes = useMemo(() => buildStarAttributes(stars), [stars]);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const reference = starsById.get(referenceStarId);
  const referenceBeacons = useMemo(
    () =>
      reference && reference.id !== SOL_ID ? [{ pos: reference.pos, color: REFERENCE_COLOR }] : [],
    [reference],
  );
  const [cameraEpoch, onCameraRest] = useReducer((epoch: number) => epoch + 1, 0);
  return (
    <>
      <CameraRig
        stars={stars}
        positions={attributes.positions}
        mask={mask}
        onCameraRest={onCameraRest}
      />
      <StarPointer stars={stars} positions={attributes.positions} mask={mask} />
      <Grid positions={attributes.positions} mask={mask} reference={reference} />
      <JumpNetwork systems={visibleSystems} />
      <StarField attributes={attributes} mask={mask} />
      <Routes catalogue={catalogue} visibleSystems={visibleSystems} />
      <RangeSpheres catalogue={catalogue} />
      <Beacons beacons={referenceBeacons} />
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
