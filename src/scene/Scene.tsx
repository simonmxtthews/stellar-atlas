import { Suspense, useMemo, useReducer } from 'react';
import type { Catalogue } from '../store/catalogue';
import { CameraRig } from './CameraRig';
import { Grid } from './Grid';
import { Highlights } from './Highlights';
import { Labels } from './Labels';
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
  const { stars, systems, starsById, starIndexById } = catalogue;
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
      <Highlights positions={attributes.positions} anchors={anchors} />
      {/* Stars stay up while the label font loads. */}
      <Suspense fallback={null}>
        <Labels
          starsById={starsById}
          positions={attributes.positions}
          anchors={anchors}
          cameraEpoch={cameraEpoch}
        />
      </Suspense>
    </>
  );
}
