// How many of the shown stars land inside the camera's view: projected through the column-major
// view-projection matrix (projection × world inverse), inside the clip volume on every axis. Stars
// behind the camera or past the far plane don't count. Given `indices`, it also collects which.
export function countInFrame(
  positions: Float32Array,
  mask: Uint8Array,
  viewProjection: readonly number[],
  indices?: number[],
): number {
  const [
    m0 = 0,
    m1 = 0,
    m2 = 0,
    m3 = 0,
    m4 = 0,
    m5 = 0,
    m6 = 0,
    m7 = 0,
    m8 = 0,
    m9 = 0,
    m10 = 0,
    m11 = 0,
    m12 = 0,
    m13 = 0,
    m14 = 0,
    m15 = 1,
  ] = viewProjection;
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = positions[i * 3] ?? 0;
    const y = positions[i * 3 + 1] ?? 0;
    const z = positions[i * 3 + 2] ?? 0;
    const w = m3 * x + m7 * y + m11 * z + m15;
    if (w <= 0) continue;
    const cx = m0 * x + m4 * y + m8 * z + m12;
    const cy = m1 * x + m5 * y + m9 * z + m13;
    const cz = m2 * x + m6 * y + m10 * z + m14;
    if (cx >= -w && cx <= w && cy >= -w && cy <= w && cz >= -w && cz <= w) {
      count++;
      indices?.push(i);
    }
  }
  return count;
}
