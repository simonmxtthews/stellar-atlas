import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
import { galacticToScene } from '../lib/coords';
import { MAX_RADIUS_LY } from '../lib/filters';
import { labelText, LABEL_GAP_EM, LABEL_PX } from '../lib/labels';
import { PROBE_COLORS, probePathEnd, probePositionAt } from '../lib/probes';
import { useUi } from '../store/ui';
import type { Position, ProbeData, Pulsar } from '../types/catalogue';
import { Beacons } from './Highlights';
import { ScreenText, useLabelMaterial } from './Labels';
import { Polyline } from './Routes';

const SOL: Position = [0, 0, 0];
const PULSAR_COLOR = '#f0abfc';
const ARROW_LENGTH_FRACTION = 0.12;
const CONE_LENGTH_FRACTION = 0.03;
const UP = new Vector3(0, 1, 0);

function ProbePaths({ probeData }: { readonly probeData: ProbeData }) {
  const yearsAhead = useUi((state) => state.probeYearsAhead);
  const material = useLabelMaterial();
  const { probes, epochYear } = probeData;
  const paths = useMemo(
    () => probes.map((probe) => [SOL, probe.pos, probePathEnd(probe, MAX_RADIUS_LY)] as const),
    [probes],
  );
  const year = new Date().getFullYear() + yearsAhead;
  const markers = useMemo(
    () =>
      probes.map((probe, i) => ({
        pos: probePositionAt(probe, epochYear, year),
        color: PROBE_COLORS[i] ?? PROBE_COLORS[0],
      })),
    [epochYear, probes, year],
  );
  return (
    <>
      {probes.map((probe, i) => (
        <Polyline
          key={probe.id}
          positions={paths[i] ?? []}
          color={PROBE_COLORS[i] ?? PROBE_COLORS[0]}
          width={1.5}
          dashed={false}
        />
      ))}
      <Beacons beacons={markers} />
      {probes.map((probe, i) => {
        const [x, y, z] = galacticToScene(markers[i]?.pos ?? SOL);
        return (
          <ScreenText
            key={probe.id}
            x={x}
            y={y}
            z={z}
            px={LABEL_PX}
            offset={[LABEL_GAP_EM, 0]}
            text={labelText(probe.name)}
            color={PROBE_COLORS[i] ?? PROBE_COLORS[0]}
            material={material}
          />
        );
      })}
    </>
  );
}

function PulsarArrow({ pulsar, edgeLy }: { readonly pulsar: Pulsar; readonly edgeLy: number }) {
  const material = useLabelMaterial();
  const direction = new Vector3(...galacticToScene(pulsar.direction));
  const coneLength = edgeLy * CONE_LENGTH_FRACTION;
  const tip = edgeLy * (1 + ARROW_LENGTH_FRACTION);
  const cone = direction.clone().multiplyScalar(tip - coneLength / 2);
  const label = direction.clone().multiplyScalar(tip);
  const quaternion = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(UP, new Vector3(...galacticToScene(pulsar.direction))),
    [pulsar],
  );
  return (
    <>
      <mesh position={cone} quaternion={quaternion}>
        <coneGeometry args={[coneLength / 3, coneLength, 12]} />
        <meshBasicMaterial color={PULSAR_COLOR} />
      </mesh>
      <ScreenText
        x={label.x}
        y={label.y}
        z={label.z}
        px={LABEL_PX}
        offset={[LABEL_GAP_EM, 0]}
        text={labelText(`${pulsar.id} ${pulsar.plaquePeriodS.toFixed(4)} s`)}
        color={PULSAR_COLOR}
        material={material}
      />
    </>
  );
}

// Too far off to place at any real distance, so they point outward from the map's edge.
function PulsarMap({ pulsars }: { readonly pulsars: readonly Pulsar[] }) {
  const edgeLy = useUi((state) => state.filters.radiusLy);
  const geometry = useMemo(() => {
    const vertices = pulsars.flatMap(({ direction }) => {
      const [x, y, z] = galacticToScene(direction);
      const tip = edgeLy * (1 + ARROW_LENGTH_FRACTION);
      return [x * edgeLy, y * edgeLy, z * edgeLy, x * tip, y * tip, z * tip];
    });
    return new BufferGeometry().setAttribute(
      'position',
      new BufferAttribute(Float32Array.from(vertices), 3),
    );
  }, [edgeLy, pulsars]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial color={PULSAR_COLOR} transparent opacity={0.8} depthWrite={false} />
      </lineSegments>
      {pulsars.map((pulsar) => (
        <PulsarArrow key={pulsar.id} pulsar={pulsar} edgeLy={edgeLy} />
      ))}
    </>
  );
}

export function ProbeOverlay({ probeData }: { readonly probeData: ProbeData }) {
  const probes = useUi((state) => state.overlays.probes);
  const pulsars = useUi((state) => state.overlays.pulsars);
  return (
    <>
      {probes && <ProbePaths probeData={probeData} />}
      {pulsars && <PulsarMap pulsars={probeData.pulsars} />}
    </>
  );
}
