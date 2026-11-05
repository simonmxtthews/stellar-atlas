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

// One LineSegments for every link, coloured by connected component.
function networkGeometry(graph: JumpGraph): BufferGeometry {
  const { componentOf } = connectedComponents(graph);
  const pairs = linkPairs(graph);
  const positions = new Float32Array(pairs.length * 6);
  const colors = new Float32Array(pairs.length * 6);
  const color = new Color();
  pairs.forEach(([a, b], i) => {
    color.setStyle(componentColor(componentOf[a] ?? 0), '');
    [a, b].forEach((node, end) => {
      const offset = i * 6 + end * 3;
      positions.set(galacticToScene(graph.nodes[node]?.pos ?? [0, 0, 0]), offset);
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
}: {
  readonly systems: readonly GraphNode[];
  readonly maxJumpLy: number;
}) {
  // Recomputed only when the max jump or the visible set changes.
  const geometry = useMemo(
    () => networkGeometry(cachedJumpGraph(systems, maxJumpLy)),
    [maxJumpLy, systems],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  );
}

export function JumpNetwork({ systems }: { readonly systems: readonly GraphNode[] }) {
  const shown = useUi((state) => state.overlays.jumpNetwork);
  const drive = useWorld((state) => state.world.drive);
  if (!shown || drive.type !== 'jump') return null;
  return <NetworkLines systems={systems} maxJumpLy={drive.maxJumpLy} />;
}
