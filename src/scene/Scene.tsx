import { Suspense, useMemo, useReducer } from 'react';
import type { Catalogue } from '../store/catalogue';
import { CameraRig } from './CameraRig';
import { Grid } from './Grid';
import { Highlights, TagHalos } from './Highlights';
import { Labels, TagBadges } from './Labels';
import { Routes } from './Routes';
import { buildStarAttributes } from './starAttributes';
import { StarField } from './StarField';
import { StarPointer } from './StarPointer';
import { systemAnchors } from './systemAnchors';

export function Scene({
  catalogue,
  mask,
}: {
  readonly catalogue: Catalogue;
  readonly mask: Uint8Array;
}) {
  const { stars, systems, starIndexById } = catalogue;
  const attributes = useMemo(() => buildStarAttributes(stars), [stars]);
  const anchors = useMemo(
    () => systemAnchors(systems, starIndexById, mask),
    [mask, starIndexById, systems],
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
      <Grid positions={attributes.positions} mask={mask} />
      <StarField attributes={attributes} mask={mask} />
      <Routes catalogue={catalogue} />
      <TagHalos positions={attributes.positions} mask={mask} starIndexById={starIndexById} />
      <Highlights positions={attributes.positions} anchors={anchors} />
      {/* Stars stay up while the label font loads. */}
      <Suspense fallback={null}>
        <Labels
          catalogue={catalogue}
          positions={attributes.positions}
          anchors={anchors}
          cameraEpoch={cameraEpoch}
        />
        <TagBadges positions={attributes.positions} mask={mask} starIndexById={starIndexById} />
      </Suspense>
    </>
  );
}
