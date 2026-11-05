import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { useUi } from '../store/ui';
import type { SystemAnchor } from './systemAnchors';

const RING_PX = 44;

const vertexShader = /* glsl */ `
  attribute float aSelected;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vPulse;

  void main() {
    if (aSelected < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
      gl_PointSize = 0.0;
      return;
    }
    vPulse = 0.5 + 0.5 * sin(uTime * 3.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (${RING_PX.toFixed(1)} + 8.0 * vPulse) * uPixelRatio;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vPulse;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float ring = smoothstep(0.74, 0.8, r) * (1.0 - smoothstep(0.88, 0.94, r));
    if (ring <= 0.0) discard;
    gl_FragColor = vec4(vec3(0.5, 0.85, 1.0) * ring * (0.6 + 0.4 * vPulse), 1.0);
  }
`;

interface PulseUniforms {
  readonly uTime: { value: number };
  readonly uPixelRatio: { value: number };
}

function updatePulse(uniforms: PulseUniforms, time: number, dpr: number): void {
  uniforms.uTime.value = time;
  uniforms.uPixelRatio.value = dpr;
}

function writeSelected(
  attribute: BufferAttribute,
  anchors: readonly SystemAnchor[],
  selectedSystemIds: readonly string[],
): void {
  const ids = new Set(selectedSystemIds);
  attribute.array.fill(0);
  for (const { system, starIndex } of anchors) {
    if (ids.has(system.id)) attribute.setX(starIndex, 1);
  }
  attribute.needsUpdate = true;
}

interface HighlightsProps {
  readonly positions: Float32Array;
  readonly anchors: readonly SystemAnchor[];
}

// Selection rings: a constant screen size whatever the zoom. Selecting only touches the
// aSelected attribute; the geometry is never rebuilt.
export function Highlights({ positions, anchors }: HighlightsProps) {
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  const selected = useMemo(
    () => new BufferAttribute(new Float32Array(positions.length / 3), 1),
    [positions],
  );
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    result.setAttribute('aSelected', selected);
    return result;
  }, [positions, selected]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [uniforms],
  );

  useEffect(() => {
    writeSelected(selected, anchors, selectedSystemIds);
  }, [anchors, selected, selectedSystemIds]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock, viewport }) => updatePulse(uniforms, clock.elapsedTime, viewport.dpr));

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
