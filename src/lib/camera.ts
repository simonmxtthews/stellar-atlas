import type { Position } from '../types/catalogue';

export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
export const MIN_CAMERA_DISTANCE = 0.5;
export const MAX_CAMERA_DISTANCE = 400;

// Frames the default 50 ly radius with Sol at the centre, tilted to show the galactic plane.
export const HOME_POSITION: Position = [0, 60, 110];
export const HOME_TARGET: Position = [0, 0, 0];

// Flights end no further than this from the star, so it fills out its neighbourhood.
const FLY_DISTANCE_LY = 20;

export interface CameraPose {
  readonly position: Position;
  readonly target: Position;
}

// Keeps the current viewing direction, moving in if the camera is further than FLY_DISTANCE_LY.
export function flyPose(star: Position, position: Position, orbitTarget: Position): CameraPose {
  const offset = [
    position[0] - orbitTarget[0],
    position[1] - orbitTarget[1],
    position[2] - orbitTarget[2],
  ] as const;
  const distance = Math.hypot(...offset);
  const scale = Math.min(distance, FLY_DISTANCE_LY) / distance;
  return {
    position: [
      star[0] + offset[0] * scale,
      star[1] + offset[1] * scale,
      star[2] + offset[2] * scale,
    ],
    target: star,
  };
}
