import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { galacticToScene } from '../lib/coords';
import { useUi } from '../store/ui';
import type { Position } from '../types/catalogue';
import { usePositionAttribute } from './starAttributes';
import {
  dropLineVertices,
  gridVertices,
  ringRadii,
  ringVertices,
  writeDropLineVisibility,
} from './gridGeometry';

function PlaneLines({
  vertices,
  color,
  opacity,
  renderOrder = 0,
}: {
  readonly vertices: Float32Array;
  readonly color: string;
  readonly opacity: number;
  readonly renderOrder?: number;
}) {
  const geometry = useMemo(
    () => new BufferGeometry().setAttribute('position', new BufferAttribute(vertices, 3)),
    [vertices],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={renderOrder}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

// Always under the rings: blended lines look different drawn in another order, and a toggled-on
// grid would otherwise draw last.
function GalacticGrid({ radiusLy }: { readonly radiusLy: number }) {
  const vertices = useMemo(() => gridVertices(radiusLy), [radiusLy]);
  return <PlaneLines vertices={vertices} color="#55607a" opacity={0.28} renderOrder={-1} />;
}

// Rings count distance from the reference star, on a plane through it parallel to the galaxy's.
function RangeRings({
  radiusLy,
  center,
}: {
  readonly radiusLy: number;
  readonly center: Position;
}) {
  const { minor, major } = useMemo(() => {
    const radii = ringRadii(radiusLy);
    // Every fifth ring (25 ly) is brighter, to count distance from at a glance.
    return {
      minor: ringVertices(radii.filter((radius) => radius % 25 !== 0)),
      major: ringVertices(radii.filter((radius) => radius % 25 === 0)),
    };
  }, [radiusLy]);
  const [x, y, z] = galacticToScene(center);
  return (
    <group position={[x, y, z]}>
      <PlaneLines vertices={minor} color="#66728f" opacity={0.35} />
      <PlaneLines vertices={major} color="#9aa8c8" opacity={0.6} />
    </group>
  );
}

const dropLineVertexShader = /* glsl */ `
  attribute float aVisible;

  void main() {
    gl_Position = aVisible > 0.5
      ? projectionMatrix * modelViewMatrix * vec4(position, 1.0)
      : vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
  }
`;

const dropLineFragmentShader = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.45, 0.6, 0.8, 0.13);
  }
`;

function DropLines({
  positions,
  mask,
}: {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
}) {
  const visibility = useMemo(
    () => new BufferAttribute(new Float32Array((positions.length / 3) * 2), 1),
    [positions.length],
  );
  const vertices = useMemo(() => dropLineVertices(positions), [positions]);
  const position = usePositionAttribute(vertices);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', position);
    result.setAttribute('aVisible', visibility);
    return result;
  }, [position, visibility]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: dropLineVertexShader,
        fragmentShader: dropLineFragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    writeDropLineVisibility(visibility, mask);
  }, [visibility, mask]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

export function Grid({
  positions,
  mask,
  center,
}: {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
  readonly center: Position; // the reference star's position on the map
}) {
  const overlays = useUi((state) => state.overlays);
  const radiusLy = useUi((state) => state.filters.radiusLy);
  return (
    <>
      {overlays.grid && <GalacticGrid radiusLy={radiusLy} />}
      {overlays.rings && <RangeRings radiusLy={radiusLy} center={center} />}
      {overlays.dropLines && <DropLines positions={positions} mask={mask} />}
    </>
  );
}
