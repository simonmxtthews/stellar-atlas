import { ACCENT_COLOR } from '../lib/palette';
import { DoubleSide } from 'three';
import { galacticToScene } from '../lib/coords';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useMapShift } from './useMapShift';

const SPHERE_COLOR = ACCENT_COLOR;

// One translucent sphere around each selected system.
export function RangeSpheres({ catalogue }: { readonly catalogue: Catalogue }) {
  const radiusLy = useUi((state) => state.rangeSphereLy);
  const selectedSystemIds = useUi((state) => state.selectedSystemIds);
  const shift = useMapShift(catalogue.systemsById);
  if (radiusLy === null) return null;
  return selectedSystemIds.flatMap((id) => {
    const system = catalogue.systemsById.get(id);
    if (!system) return [];
    const [x, y, z] = galacticToScene(shift(system.pos, id));
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
