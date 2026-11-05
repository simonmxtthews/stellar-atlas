import { DoubleSide } from 'three';
import { galacticToScene } from '../lib/coords';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';

const SPHERE_COLOR = '#38bdf8';

// One translucent sphere around each selected system.
export function RangeSpheres({ catalogue }: { readonly catalogue: Catalogue }) {
  const radiusLy = useUi((state) => state.rangeSphereLy);
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  if (radiusLy === null) return null;
  return selectedSystemIds.flatMap((id) => {
    const system = catalogue.systemsById.get(id);
    if (!system) return [];
    const [x, y, z] = galacticToScene(system.pos);
    return (
      <mesh key={id} position={[x, y, z]} scale={radiusLy} renderOrder={1}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial
          color={SPHERE_COLOR}
          transparent
          opacity={0.1}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    );
  });
}
