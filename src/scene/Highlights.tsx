import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three';
import { galacticToScene } from '../lib/coords';
import { starHalos, type StarHalo } from '../lib/worldView';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { Position } from '../types/catalogue';
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

const HALO_PX = 30;

const haloVertexShader = /* glsl */ `
  attribute vec4 aHalo; // colour, then alpha: 0 for no halo
  uniform float uPixelRatio;
  varying vec3 vColor;

  void main() {
    if (aHalo.a < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume
      gl_PointSize = 0.0;
      return;
    }
    vColor = aHalo.rgb;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = ${HALO_PX.toFixed(1)} * uPixelRatio;
  }
`;

const haloFragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float halo = smoothstep(0.35, 0.7, r) * (1.0 - smoothstep(0.7, 1.0, r));
    if (halo <= 0.0) discard;
    gl_FragColor = vec4(vColor * halo, 1.0);
  }
`;

function updateHaloScale(uniforms: { readonly uPixelRatio: { value: number } }, dpr: number): void {
  uniforms.uPixelRatio.value = dpr;
}

function writeHalos(
  attribute: BufferAttribute,
  halos: readonly StarHalo[],
  starIndexById: ReadonlyMap<string, number>,
  mask: Uint8Array,
): void {
  const color = new Color();
  attribute.array.fill(0);
  for (const { starId, color: hex } of halos) {
    const index = starIndexById.get(starId);
    if (index === undefined || !mask[index]) continue;
    color.setStyle(hex, '');
    attribute.setXYZW(index, color.r, color.g, color.b, 1);
  }
  attribute.needsUpdate = true;
}

interface TagHalosProps {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
  readonly starIndexById: ReadonlyMap<string, number>;
}

// Tagged stars glow in their first tag's colour. As with the rings, tagging only touches an
// attribute; the geometry is never rebuilt.
export function TagHalos({ positions, mask, starIndexById }: TagHalosProps) {
  const starMeta = useWorld((state) => state.world.starMeta);
  const tags = useWorld((state) => state.world.tags);
  const halo = useMemo(
    () => new BufferAttribute(new Float32Array((positions.length / 3) * 4), 4),
    [positions],
  );
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    result.setAttribute('aHalo', halo);
    return result;
  }, [halo, positions]);
  const uniforms = useMemo(() => ({ uPixelRatio: { value: 1 } }), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: haloVertexShader,
        fragmentShader: haloFragmentShader,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [uniforms],
  );

  useEffect(() => {
    writeHalos(halo, starHalos(starMeta, tags), starIndexById, mask);
  }, [halo, mask, starIndexById, starMeta, tags]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ viewport }) => updateHaloScale(uniforms, viewport.dpr));

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}

export interface Beacon {
  readonly pos: Position; // galactic
  readonly color: string;
}

// Halos at arbitrary points, for things that aren't tagged stars. Few, and rebuilt as they move.
export function Beacons({ beacons }: { readonly beacons: readonly Beacon[] }) {
  const geometry = useMemo(() => {
    const color = new Color();
    const result = new BufferGeometry();
    result.setAttribute(
      'position',
      new BufferAttribute(Float32Array.from(beacons.flatMap(({ pos }) => galacticToScene(pos))), 3),
    );
    result.setAttribute(
      'aHalo',
      new BufferAttribute(
        Float32Array.from(
          beacons.flatMap(({ color: hex }) => {
            color.setStyle(hex, '');
            return [color.r, color.g, color.b, 1];
          }),
        ),
        4,
      ),
    );
    return result;
  }, [beacons]);
  const uniforms = useMemo(() => ({ uPixelRatio: { value: 1 } }), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: haloVertexShader,
        fragmentShader: haloFragmentShader,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [uniforms],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ viewport }) => updateHaloScale(uniforms, viewport.dpr));

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}
