import { useLayoutEffect, useRef } from 'react';
import type { Catalogue } from '../store/catalogue';
import { ChromeToggle } from './ChromeToggle';
import { StarCount } from './StarCount';

// The star count and interface toggle, in the top-right corner. The count is as wide as its number,
// so the cluster publishes its width as --corner-w for the toolbar and the phone's search box to
// keep clear of.
export function CornerControls({
  catalogue,
  shown,
}: {
  readonly catalogue: Catalogue;
  readonly shown: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty('--corner-w', `${element.offsetWidth}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty('--corner-w');
    };
  }, []);
  return (
    <div ref={ref} className="absolute top-3 right-3 z-30 flex gap-2">
      <StarCount catalogue={catalogue} shown={shown} />
      <ChromeToggle />
    </div>
  );
}
