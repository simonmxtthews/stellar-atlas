import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { useUi } from '../store/ui';
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
}: {
  readonly vertices: Float32Array;
  readonly color: string;
  readonly opacity: number;
}) {
  const geometry = useMemo(
    () => new BufferGeometry().setAttribute('position', new BufferAttribute(vertices, 3)),
    [vertices],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

function GalacticGrid({ radiusLy }: { readonly radiusLy: number }) {
  const vertices = useMemo(() => gridVertices(radiusLy), [radiusLy]);
  return <PlaneLines vertices={vertices} color="#3f6f9f" opacity={0.25} />;
}

function RangeRings({ radiusLy }: { readonly radiusLy: number }) {
  const { minor, major } = useMemo(() => {
    const radii = ringRadii(radiusLy);
    // Every fifth ring (25 ly) is brighter, to count distance from at a glance.
    return {
      minor: ringVertices(radii.filter((radius) => radius % 25 !== 0)),
      major: ringVertices(radii.filter((radius) => radius % 25 === 0)),
    };
  }, [radiusLy]);
  return (
    <>
      <PlaneLines vertices={minor} color="#5b9bd5" opacity={0.35} />
      <PlaneLines vertices={major} color="#8ec5f5" opacity={0.7} />
    </>
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
    [positions],
  );
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(dropLineVertices(positions), 3));
    result.setAttribute('aVisible', visibility);
    return result;
  }, [positions, visibility]);
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
}: {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
}) {
  const overlays = useUi((state) => state.overlays);
  const radiusLy = useUi((state) => state.filters.radiusLy);
  return (
    <>
      {overlays.grid && <GalacticGrid radiusLy={radiusLy} />}
      {overlays.rings && <RangeRings radiusLy={radiusLy} />}
      {overlays.dropLines && <DropLines positions={positions} mask={mask} />}
    </>
  );
}
