import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { galacticToScene } from '../lib/coords';
import {
  cachedJumpGraph,
  componentColor,
  connectedComponents,
  linkPairs,
  type GraphNode,
  type JumpGraph,
} from '../lib/graph';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { StarSystem } from '../types/catalogue';
import { useMapShift, type MapShift } from './useMapShift';

// One LineSegments for every link, coloured by connected component. The links are today's, drawn
// between wherever their stars are on the map.
function networkGeometry(graph: JumpGraph, shift: MapShift): BufferGeometry {
  const { componentOf } = connectedComponents(graph);
  const pairs = linkPairs(graph);
  const positions = new Float32Array(pairs.length * 6);
  const colors = new Float32Array(pairs.length * 6);
  const color = new Color();
  pairs.forEach(([a, b], i) => {
    color.setStyle(componentColor(componentOf[a] ?? 0), '');
    [a, b].forEach((node, end) => {
      const offset = i * 6 + end * 3;
      const system = graph.nodes[node];
      positions.set(galacticToScene(system ? shift(system.pos, system.id) : [0, 0, 0]), offset);
      colors.set([color.r, color.g, color.b], offset);
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function NetworkLines({
  systems,
  maxJumpLy,
  shift,
}: {
  readonly systems: readonly GraphNode[];
  readonly maxJumpLy: number;
  readonly shift: MapShift;
}) {
  // Recomputed only when the max jump, the visible set or the map's year changes.
  const geometry = useMemo(
    () => networkGeometry(cachedJumpGraph(systems, maxJumpLy), shift),
    [maxJumpLy, shift, systems],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  );
}

export function JumpNetwork({
  systems,
  systemsById,
}: {
  readonly systems: readonly GraphNode[];
  readonly systemsById: ReadonlyMap<string, StarSystem>;
}) {
  const shown = useUi((state) => state.overlays.jumpNetwork);
  const drive = useWorld((state) => state.world.drive);
  const shift = useMapShift(systemsById);
  if (!shown || drive.type !== 'jump') return null;
  return <NetworkLines systems={systems} maxJumpLy={drive.maxJumpLy} shift={shift} />;
}
