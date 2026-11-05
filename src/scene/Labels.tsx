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
import { galacticToScene } from '../lib/coords';
import { distanceLy, routeLegs, type RouteLeg } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import {
  routeEndpointIds,
  starHalos,
  systemCustomName,
  taggedSystemIds,
  withCustomName,
} from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import { DRAFT_COLOR, RULER_COLOR } from './Routes';
import { starPosition } from './starAttributes';
import type { SystemAnchor } from './systemAnchors';

const BADGE_PX = 13;
const BADGE_COLOR = '#f8fafc'; // a tag colour would vanish against its own halo
const BADGE_OFFSET_EM: readonly [number, number] = [1, 1];

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

// Text that faces the camera at a constant pixel size, offset from its anchor in ems.
const ScreenText = memo(function ScreenText({
  x,
  y,
  z,
  px,
  offset,
  text,
  color,
  material,
}: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly px: number;
  readonly offset: readonly [number, number];
  readonly text: string;
  readonly color: string;
  readonly material: MeshBasicMaterial;
}) {
  const group = useRef<Group>(null);

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
    <group ref={group} position={[x, y, z]}>
      <Text
        font={fontUrl}
        fontSize={1}
        anchorX="left"
        position={[offset[0], offset[1], 0]}
        material={material}
        color={color}
        outlineWidth={0.06}
        outlineColor="#020617"
        renderOrder={3}
      >
        {text}
      </Text>
    </group>
  );
});

function useLabelMaterial(): MeshBasicMaterial {
  const material = useMemo(
    () => new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function legLabels(
  prefix: string,
  legs: readonly RouteLeg[],
  color: string,
): readonly LabelCandidate[] {
  return legs.map((leg, i) => {
    const [x, y, z] = galacticToScene([
      (leg.from[0] + leg.to[0]) / 2,
      (leg.from[1] + leg.to[1]) / 2,
      (leg.from[2] + leg.to[2]) / 2,
    ]);
    return {
      id: `leg:${prefix}:${i}`,
      tier: LabelTier.RouteEndpoint,
      color,
      x,
      y,
      z,
      text: formatValue(leg.distanceLy, 2, 'ly'),
    };
  });
}

interface LabelsProps {
  readonly catalogue: Catalogue;
  readonly positions: Float32Array;
  readonly anchors: readonly SystemAnchor[];
  readonly cameraEpoch: number; // bumped when the camera comes to rest
}

export function Labels({ catalogue, positions, anchors, cameraEpoch }: LabelsProps) {
  const { starsById, systemsById } = catalogue;
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  const setLabelCount = useUi((state) => state.setLabelCount);
  const hiddenRouteIds = useUi((state) => state.hiddenRouteIds);
  const routeDraft = useUi((state) => state.routeDraft);
  const rulerStarIds = useUi((state) => state.rulerStarIds);
  const routes = useWorld((state) => state.world.routes);
  const starMeta = useWorld((state) => state.world.starMeta);
  const material = useLabelMaterial();

  const shownRoutes = useMemo(
    () => routes.filter((route) => !hiddenRouteIds.includes(route.id)),
    [hiddenRouteIds, routes],
  );

  const systemCandidates = useMemo(() => {
    const selected = new Set(selectedSystemIds);
    const endpoints = new Set([...routeEndpointIds(shownRoutes), ...routeDraft]);
    for (const starId of rulerStarIds) {
      const systemId = starsById.get(starId)?.systemId;
      if (systemId !== undefined) endpoints.add(systemId);
    }
    const tagged = taggedSystemIds(starMeta, starsById);
    return anchors.map(({ system, starIndex }): LabelCandidate => {
      const [x, y, z] = starPosition(positions, starIndex);
      const proper = system.starIds.some((id) => starsById.get(id)?.names.proper !== undefined);
      return {
        id: system.id,
        tier: tierOf(system.id, proper, selected, endpoints, tagged),
        x,
        y,
        z,
        text: labelText(withCustomName(system.name, systemCustomName(starMeta, system))),
      };
    });
  }, [
    anchors,
    positions,
    routeDraft,
    rulerStarIds,
    selectedSystemIds,
    shownRoutes,
    starMeta,
    starsById,
  ]);

  const candidates = useMemo(() => {
    const legs = shownRoutes.flatMap((route) =>
      legLabels(route.id, routeLegs(route.waypoints, systemsById), route.color),
    );
    const draft = legLabels('draft', routeLegs(routeDraft, systemsById), DRAFT_COLOR);
    const [rulerFrom, rulerTo] = rulerStarIds.map((id) => starsById.get(id));
    const ruler: readonly LabelCandidate[] =
      rulerFrom && rulerTo
        ? legLabels(
            'ruler',
            [
              {
                fromId: rulerFrom.id,
                toId: rulerTo.id,
                from: rulerFrom.pos,
                to: rulerTo.pos,
                distanceLy: distanceLy(rulerFrom.pos, rulerTo.pos),
              },
            ],
            RULER_COLOR,
          ).map((label) => ({ ...label, tier: LabelTier.Selected }))
        : [];
    return [...systemCandidates, ...legs, ...draft, ...ruler];
  }, [routeDraft, rulerStarIds, shownRoutes, starsById, systemCandidates, systemsById]);

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

  return labels.map((label) => {
    const selected = label.tier === LabelTier.Selected;
    return (
      <ScreenText
        key={label.id}
        x={label.x}
        y={label.y}
        z={label.z}
        px={selected ? SELECTED_LABEL_PX : LABEL_PX}
        offset={[selected ? SELECTED_LABEL_GAP_EM : LABEL_GAP_EM, 0]}
        text={label.text}
        color={label.color ?? (selected ? '#e0f2fe' : '#94a3b8')}
        material={material}
      />
    );
  });
}

interface TagBadgesProps {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
  readonly starIndexById: ReadonlyMap<string, number>;
}

// A star with several tags shows only the first's halo, plus this count.
export function TagBadges({ positions, mask, starIndexById }: TagBadgesProps) {
  const starMeta = useWorld((state) => state.world.starMeta);
  const tags = useWorld((state) => state.world.tags);
  const material = useLabelMaterial();
  const badges = useMemo(
    () => starHalos(starMeta, tags).filter(({ count }) => count > 1),
    [starMeta, tags],
  );
  return badges.flatMap(({ starId, count }) => {
    const index = starIndexById.get(starId);
    if (index === undefined || !mask[index]) return [];
    const [x, y, z] = starPosition(positions, index);
    return (
      <ScreenText
        key={starId}
        x={x}
        y={y}
        z={z}
        px={BADGE_PX}
        offset={BADGE_OFFSET_EM}
        text={String(count)}
        color={BADGE_COLOR}
        material={material}
      />
    );
  });
}
