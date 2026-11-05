import { Color, type BufferAttribute } from 'three';
import { galacticToScene } from '../lib/coords';
import { SOL_ID } from '../lib/filters';
import type { Position, Star } from '../types/catalogue';

export const FLAG_VISIBLE = 1;
export const FLAG_SUN = 2;

const MIN_SIZE_LY = 0.5;
const MAX_SIZE_LY = 2;
const SUN_SIZE_LY = 3;
const DIM_ABS_MAG = 12; // and fainter: smallest sprite, so dim M dwarfs stay visible
const BRIGHT_ABS_MAG = -2; // and brighter: largest sprite

// World-space sprite diameter from absolute magnitude. Stars without one draw at the minimum.
export function sizeForAbsMag(absMag: number | undefined): number {
  if (absMag === undefined) return MIN_SIZE_LY;
  const t = (DIM_ABS_MAG - absMag) / (DIM_ABS_MAG - BRIGHT_ABS_MAG);
  return MIN_SIZE_LY + Math.min(Math.max(t, 0), 1) * (MAX_SIZE_LY - MIN_SIZE_LY);
}

export interface StarAttributes {
  readonly positions: Float32Array; // scene coordinates, 3 per star
  readonly colors: Float32Array; // 3 per star
  readonly sizes: Float32Array; // 1 per star
  readonly sunIndex: number;
}

export function buildStarAttributes(stars: readonly Star[]): StarAttributes {
  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 3);
  const sizes = new Float32Array(stars.length);
  const color = new Color();
  let sunIndex = -1;
  stars.forEach((star, i) => {
    positions.set(galacticToScene(star.pos), i * 3);
    // The shaders write straight to the screen, so keep the hex values as authored (sRGB).
    color.setStyle(star.colorHex, '');
    colors.set([color.r, color.g, color.b], i * 3);
    if (star.id === SOL_ID) sunIndex = i;
    sizes[i] = star.id === SOL_ID ? SUN_SIZE_LY : sizeForAbsMag(star.absMag);
  });
  return { positions, colors, sizes, sunIndex };
}

export function starPosition(positions: Float32Array, index: number): Position {
  return [positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0];
}

export function writeStarFlags(flags: BufferAttribute, mask: Uint8Array, sunIndex: number): void {
  for (let i = 0; i < mask.length; i++) {
    const sun = i === sunIndex ? FLAG_SUN : 0;
    flags.setX(i, mask[i] ? FLAG_VISIBLE | sun : 0);
  }
  flags.needsUpdate = true;
}
