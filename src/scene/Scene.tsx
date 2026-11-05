import { useMemo } from 'react';
import type { Star } from '../types/catalogue';
import { CameraRig } from './CameraRig';
import { Grid } from './Grid';
import { buildStarAttributes } from './starAttributes';
import { StarField } from './StarField';

export function Scene({
  stars,
  mask,
}: {
  readonly stars: readonly Star[];
  readonly mask: Uint8Array;
}) {
  const attributes = useMemo(() => buildStarAttributes(stars), [stars]);
  return (
    <>
      <CameraRig stars={stars} positions={attributes.positions} mask={mask} />
      <Grid positions={attributes.positions} mask={mask} />
      <StarField attributes={attributes} mask={mask} />
    </>
  );
}
