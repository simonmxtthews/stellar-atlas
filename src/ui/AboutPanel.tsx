import type { CatalogueMeta } from '../types/catalogue';

// meta.json holds the URLs the pipeline queried, which are no use to a reader.
const SOURCE_HOMES: Readonly<Record<string, string>> = {
  'HYG Database': 'https://astronexus.com/hyg',
  'NASA Exoplanet Archive (pscomppars)': 'https://exoplanetarchive.ipac.caltech.edu/',
  'JPL Horizons': 'https://ssd.jpl.nasa.gov/horizons/',
  'ATNF Pulsar Catalogue': 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
};

export function AboutPanel({ meta }: { readonly meta: CatalogueMeta }) {
  const { stars, systems, planets } = meta.counts;
  return (
    <>
      <h2 className="font-medium">About Stellar Atlas</h2>
      <p className="mt-1 text-xs text-slate-300">
        Data built{' '}
        <time data-testid="build-date" dateTime={meta.buildDate}>
          {meta.buildDate.slice(0, 10)}
        </time>
        : {stars.toLocaleString('en')} stars in {systems.toLocaleString('en')} systems,{' '}
        {planets.toLocaleString('en')} confirmed planets, out to {meta.radiusLy} ly.
      </p>
      <p data-testid="attribution" className="mt-2 text-xs text-slate-300">
        {meta.attribution}
      </p>
      <h3 className="mt-3 text-xs tracking-wide text-slate-400 uppercase">Sources</h3>
      <ul className="text-xs">
        {meta.sources.map((source) => (
          <li key={source.name} className="border-t border-slate-800/70 py-1">
            <a
              href={SOURCE_HOMES[source.name] ?? source.url}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline"
            >
              {source.name}
            </a>{' '}
            <span className="text-slate-400">
              {source.version} · {source.licence}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
