import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, HOME_POSITION } from './lib/camera';
import { planetTraitsBySystem } from './lib/exoplanets';
import { computeVisibleMask, countVisible } from './lib/filters';
import { taggedStarIds } from './lib/worldView';
import { Scene } from './scene/Scene';
import { systemAnchors } from './scene/systemAnchors';
import { useCatalogue, type Catalogue } from './store/catalogue';
import { useUi } from './store/ui';
import { useWorld } from './store/world';
import { CornerControls } from './ui/CornerControls';
import { FilterPanel } from './ui/FilterPanel';
import { SearchBar } from './ui/SearchBar';
import { StarList } from './ui/StarList';
import { StarModal } from './ui/StarModal';
import { StarTooltip } from './ui/StarTooltip';
import { Toolbar } from './ui/Toolbar';

const CAMERA = {
  fov: CAMERA_FOV,
  near: CAMERA_NEAR,
  far: CAMERA_FAR,
  position: [...HOME_POSITION] as [number, number, number],
};

// Keeps the last frame readable, for the PNG snapshot.
const GL = { preserveDrawingBuffer: true };

const NO_STARS: ReadonlySet<string> = new Set();

// A catalogue rebuild can rename IDs that saved worlds refer to.
function remapOnceHydrated(idMap: Readonly<Record<string, string>>): () => void {
  const remap = () => useWorld.getState().remapIds(idMap);
  if (useWorld.persist.hasHydrated()) {
    remap();
    return () => undefined;
  }
  return useWorld.persist.onFinishHydration(remap);
}

function Map({ catalogue }: { readonly catalogue: Catalogue }) {
  const filters = useUi((state) => state.filters);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const reference = catalogue.starsById.get(referenceStarId);
  const starMeta = useWorld((state) => state.world.starMeta);
  // Only taggedOnly needs the tags, so that editing a note doesn't normally touch the mask.
  const tagged = useMemo(
    () => (filters.taggedOnly ? taggedStarIds(starMeta) : NO_STARS),
    [filters.taggedOnly, starMeta],
  );
  const traitsBySystem = useMemo(
    () => planetTraitsBySystem(catalogue.stars, catalogue.planetsById),
    [catalogue],
  );
  const mask = useMemo(
    () =>
      computeVisibleMask(
        catalogue.stars,
        catalogue.systemsById,
        traitsBySystem,
        filters,
        tagged,
        reference,
      ),
    [catalogue, filters, traitsBySystem, reference, tagged],
  );
  const anchors = useMemo(
    () => systemAnchors(catalogue.systems, catalogue.starIndexById, mask),
    [catalogue, mask],
  );
  const visibleSystems = useMemo(() => anchors.map(({ system }) => system), [anchors]);
  const visible = useMemo(() => countVisible(catalogue.stars, mask), [catalogue, mask]);
  const chromeHidden = useUi((state) => state.chromeHidden);
  return (
    <>
      <Canvas camera={CAMERA} gl={GL}>
        <Scene
          catalogue={catalogue}
          mask={mask}
          anchors={anchors}
          visibleSystems={visibleSystems}
        />
      </Canvas>
      {/* Hidden rather than unmounted, so the panels keep their state for when they come back. */}
      <div hidden={chromeHidden} className="contents">
        {/* A rail on a wide screen; a sheet along the foot of a phone. */}
        <div className="md:contents max-md:absolute max-md:inset-x-0 max-md:bottom-0">
          <FilterPanel stars={catalogue.stars} visible={visible} />
        </div>
        <Toolbar catalogue={catalogue} visibleSystems={visibleSystems} />
        <SearchBar catalogue={catalogue} traitsBySystem={traitsBySystem} />
      </div>
      <StarTooltip catalogue={catalogue} />
      <StarList catalogue={catalogue} />
      <StarModal catalogue={catalogue} />
      <CornerControls catalogue={catalogue} shown={visible.stars} />
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

  const idMap = catalogue?.meta.idMap;
  useEffect(() => (idMap ? remapOnceHydrated(idMap) : undefined), [idMap]);

  if (catalogue) return <Map catalogue={catalogue} />;
  return (
    <div role="status" className="flex h-full items-center justify-center text-sm text-muted">
      {error ? `Could not load the star catalogue (${error}).` : 'Loading star catalogue…'}
    </div>
  );
}
