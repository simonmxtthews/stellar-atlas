import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  ShaderMaterial,
} from 'three';
import { CAMERA_FOV } from '../lib/camera';
import {
  FLAG_SUN,
  FLAG_VISIBLE,
  usePositionAttribute,
  writeStarFlags,
  type StarAttributes,
} from './starAttributes';

const MIN_POINT_PX = 3;
const MAX_POINT_PX = 40;
const MIN_SUN_PX = 22;

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aFlags;
  uniform float uPixelsPerLy; // sprite pixels per light-year of size, at unit view distance
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSun;

  void main() {
    int flags = int(aFlags);
    if ((flags & ${FLAG_VISIBLE}) == 0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
      gl_PointSize = 0.0;
      return;
    }
    vColor = aColor;
    vSun = (flags & ${FLAG_SUN}) != 0 ? 1.0 : 0.0;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float minPx = vSun > 0.5 ? ${MIN_SUN_PX.toFixed(1)} : ${MIN_POINT_PX.toFixed(1)};
    gl_PointSize = clamp(
      aSize * uPixelsPerLy / -viewPosition.z,
      minPx * uPixelRatio,
      ${MAX_POINT_PX.toFixed(1)} * uPixelRatio
    );
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vSun;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float brightness;
    if (vSun > 0.5) {
      // The Sun is a small disc inside a thin ring, so it reads differently from any star.
      float disc = 1.0 - smoothstep(0.26, 0.34, r);
      float ring = smoothstep(0.76, 0.82, r) * (1.0 - smoothstep(0.88, 0.94, r));
      brightness = disc + ring;
    } else {
      float core = 1.0 - smoothstep(0.3, 0.55, r);
      float glow = (1.0 - r) * (1.0 - r);
      // Capped at the star's own colour; summing past 1 would clip it to white.
      brightness = min(core + 0.6 * glow, 1.0);
    }
    gl_FragColor = vec4(vColor * brightness, 1.0);
  }
`;

interface ScaleUniforms {
  readonly uPixelsPerLy: { value: number };
  readonly uPixelRatio: { value: number };
}

function updateScale(uniforms: ScaleUniforms, heightPx: number, dpr: number): void {
  uniforms.uPixelRatio.value = dpr;
  uniforms.uPixelsPerLy.value =
    (heightPx * dpr) / (2 * Math.tan(MathUtils.degToRad(CAMERA_FOV / 2)));
}

interface StarFieldProps {
  readonly attributes: StarAttributes;
  readonly mask: Uint8Array;
}

export function StarField({ attributes, mask }: StarFieldProps) {
  const flags = useMemo(
    () => new BufferAttribute(new Float32Array(attributes.sizes.length), 1),
    [attributes.sizes.length],
  );
  const position = usePositionAttribute(attributes.positions);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', position);
    result.setAttribute('aColor', new BufferAttribute(attributes.colors, 3));
    result.setAttribute('aSize', new BufferAttribute(attributes.sizes, 1));
    result.setAttribute('aFlags', flags);
    return result;
  }, [attributes.colors, attributes.sizes, flags, position]);
  const uniforms = useMemo(() => ({ uPixelsPerLy: { value: 1 }, uPixelRatio: { value: 1 } }), []);
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

  // Filters only touch this attribute; the rest of the geometry is never rebuilt.
  useEffect(() => {
    writeStarFlags(flags, mask, attributes.sunIndex);
  }, [flags, mask, attributes.sunIndex]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ size, viewport }) => updateScale(uniforms, size.height, viewport.dpr));

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}
