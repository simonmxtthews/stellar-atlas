import fontUrl from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import { MathUtils, Matrix4, MeshBasicMaterial, type Group } from 'three';
import { CAMERA_FOV } from '../lib/camera';
import {
  chooseLabels,
  LABEL_GAP_EM,
  LABEL_PX,
  LabelTier,
  labelText,
  SELECTED_LABEL_GAP_EM,
  SELECTED_LABEL_PX,
  type LabelCandidate,
} from '../lib/labels';
import { useUi } from '../store/ui';
import type { Star } from '../types/catalogue';
import { starPosition } from './starAttributes';
import type { SystemAnchor } from './systemAnchors';

// Worlds supply these from M5, once routes and tags exist.
const NO_SYSTEMS: ReadonlySet<string> = new Set();

function tierOf(
  systemId: string,
  proper: boolean,
  selected: ReadonlySet<string>,
  routeEndpoints: ReadonlySet<string>,
  tagged: ReadonlySet<string>,
): LabelTier {
  if (selected.has(systemId)) return LabelTier.Selected;
  if (routeEndpoints.has(systemId)) return LabelTier.RouteEndpoint;
  if (tagged.has(systemId)) return LabelTier.Tagged;
  return proper ? LabelTier.Proper : LabelTier.Other;
}

const SystemLabel = memo(function SystemLabel({
  label,
  material,
}: {
  readonly label: LabelCandidate;
  readonly material: MeshBasicMaterial;
}) {
  const group = useRef<Group>(null);
  const selected = label.tier === LabelTier.Selected;
  const px = selected ? SELECTED_LABEL_PX : LABEL_PX;

  // Faces the camera at a constant pixel size.
  useFrame(({ camera, size }) => {
    const current = group.current;
    if (!current) return;
    current.quaternion.copy(camera.quaternion);
    const worldPerPx =
      (2 *
        current.position.distanceTo(camera.position) *
        Math.tan(MathUtils.degToRad(CAMERA_FOV / 2))) /
      size.height;
    current.scale.setScalar(px * worldPerPx);
  });

  return (
    <group ref={group} position={[label.x, label.y, label.z]}>
      <Text
        font={fontUrl}
        fontSize={1}
        anchorX="left"
        position={[selected ? SELECTED_LABEL_GAP_EM : LABEL_GAP_EM, 0, 0]}
        material={material}
        color={selected ? '#e0f2fe' : '#94a3b8'}
        outlineWidth={0.06}
        outlineColor="#020617"
        renderOrder={3}
      >
        {label.text}
      </Text>
    </group>
  );
});

interface LabelsProps {
  readonly starsById: ReadonlyMap<string, Star>;
  readonly positions: Float32Array;
  readonly anchors: readonly SystemAnchor[];
  readonly cameraEpoch: number; // bumped when the camera comes to rest
}

export function Labels({ starsById, positions, anchors, cameraEpoch }: LabelsProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  const setLabelCount = useUi((state) => state.setLabelCount);
  const material = useMemo(
    () => new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const candidates = useMemo(() => {
    const selected = new Set(selectedSystemIds);
    return anchors.map(({ system, starIndex }): LabelCandidate => {
      const [x, y, z] = starPosition(positions, starIndex);
      const proper = system.starIds.some((id) => starsById.get(id)?.names.proper !== undefined);
      return {
        id: system.id,
        tier: tierOf(system.id, proper, selected, NO_SYSTEMS, NO_SYSTEMS),
        x,
        y,
        z,
        text: labelText(system.name),
      };
    });
  }, [anchors, positions, selectedSystemIds, starsById]);

  // Only on camera rest, a resize or a change of candidates, never per frame.
  const labels = useMemo(() => {
    void cameraEpoch;
    camera.updateMatrixWorld();
    const viewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    const { x, y, z } = camera.position;
    return chooseLabels(candidates, [x, y, z], viewProjection.elements, size);
  }, [camera, cameraEpoch, candidates, size]);

  useEffect(() => setLabelCount(labels.length), [labels, setLabelCount]);

  return labels.map((label) => <SystemLabel key={label.id} label={label} material={material} />);
}
