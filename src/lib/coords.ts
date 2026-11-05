import type { Position } from '../types/catalogue';

// Galactic (x, y, z) to three.js (x, z, -y): galactic plane horizontal, galactic north up.
export function galacticToScene([x, y, z]: Position): Position {
  return [x, z, -y];
}
