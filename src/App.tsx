import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, HOME_POSITION } from './lib/camera';
import { computeVisibleMask, countVisible } from './lib/filters';
import { Scene } from './scene/Scene';
import { useCatalogue, type Catalogue } from './store/catalogue';
import { useUi } from './store/ui';
import { FilterPanel } from './ui/FilterPanel';

const CAMERA = {
  fov: CAMERA_FOV,
  near: CAMERA_NEAR,
  far: CAMERA_FAR,
  position: [...HOME_POSITION] as [number, number, number],
};

function Map({ catalogue }: { readonly catalogue: Catalogue }) {
  const filters = useUi((state) => state.filters);
  const mask = useMemo(
    () => computeVisibleMask(catalogue.stars, catalogue.systemsById, filters),
    [catalogue, filters],
  );
  const visible = useMemo(() => countVisible(catalogue.stars, mask), [catalogue, mask]);
  return (
    <>
      <Canvas camera={CAMERA}>
        <Scene stars={catalogue.stars} mask={mask} />
      </Canvas>
      <FilterPanel stars={catalogue.stars} visible={visible} />
    </>
  );
}

export default function App() {
  const catalogue = useCatalogue((state) => state.catalogue);
  const error = useCatalogue((state) => state.error);
  const load = useCatalogue((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (catalogue) return <Map catalogue={catalogue} />;
  return (
    <div role="status" className="flex h-full items-center justify-center text-sm text-slate-400">
      {error ? `Could not load the star catalogue (${error}).` : 'Loading star catalogue…'}
    </div>
  );
}
