import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keys';
import { useUi } from '../store/ui';
import type { Star } from '../types/catalogue';
import { pickStarAt, TOUCH_PICK_RADIUS_PX } from './pickStarAt';

const HOVER_INTERVAL_MS = 33; // 30 Hz
const LONG_PRESS_MS = 500;
const TAP_SLOP_PX = 5;

interface Gesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly touch: boolean;
  cancelled: boolean; // dragged, pinched or already used as a long-press
}

function setCursor(element: HTMLElement, cursor: string): void {
  element.style.cursor = cursor;
}

interface StarPointerProps {
  readonly stars: readonly Star[];
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
}

// Hover, click, shift-click, tap and long-press on the map. Listens to the canvas directly
// because picking is in screen space, so nothing needs a three.js raycast.
export function StarPointer({ stars, positions, mask }: StarPointerProps) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const flyRequest = useUi((state) => state.flyRequest);
  const setHover = useUi((state) => state.setHover);

  // A flight moves the stars out from under a resting pointer.
  useEffect(() => setHover(null), [flyRequest, setHover]);

  useEffect(() => {
    let gesture: Gesture | null = null;
    let longPressTimer = 0;
    let hoverTimer = 0;
    let lastHover: { clientX: number; clientY: number } | null = null;

    const pick = (at: { clientX: number; clientY: number }, touch: boolean): Star | undefined => {
      const radius = touch ? TOUCH_PICK_RADIUS_PX : undefined;
      return stars[pickStarAt(camera, domElement, positions, mask, at, radius)];
    };

    const showHover = (at: { clientX: number; clientY: number }, touch: boolean) => {
      const star = pick(at, touch);
      setHover(star ? { starId: star.id, x: at.clientX, y: at.clientY } : null);
      setCursor(domElement, star ? 'pointer' : '');
    };

    const clearHover = () => {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
      lastHover = null;
      setHover(null);
      setCursor(domElement, '');
    };

    const onPointerDown = (event: PointerEvent) => {
      clearHover();
      if (gesture) {
        // A second finger makes this a pinch or two-finger pan.
        gesture.cancelled = true;
        window.clearTimeout(longPressTimer);
        return;
      }
      if (event.button !== 0) return;
      const started: Gesture = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch',
        cancelled: false,
      };
      gesture = started;
      if (started.touch) {
        longPressTimer = window.setTimeout(() => {
          started.cancelled = true;
          showHover({ clientX: started.x, clientY: started.y }, true);
        }, LONG_PRESS_MS);
      }
    };

    // On the window, as a drag can end anywhere.
    const onWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== gesture?.pointerId || gesture.cancelled) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > TAP_SLOP_PX) {
        gesture.cancelled = true;
        window.clearTimeout(longPressTimer);
      }
    };

    const onWindowPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== gesture?.pointerId) return;
      const { cancelled, touch } = gesture;
      gesture = null;
      window.clearTimeout(longPressTimer);
      if (cancelled) return;
      const {
        tool,
        addWaypoint,
        pickRulerStar,
        pickAutoRouteSystem,
        select,
        toggleSelect,
        clearSelection,
      } = useUi.getState();
      const star = pick(event, touch);
      if (tool !== 'none') {
        if (star && tool === 'route') addWaypoint(star.systemId);
        if (star && tool === 'ruler') pickRulerStar(star.id);
        if (star && tool === 'autoroute') pickAutoRouteSystem(star.systemId);
      } else if (!star) {
        if (!event.shiftKey) clearSelection();
      } else if (event.shiftKey) {
        toggleSelect(star.systemId, star.id);
      } else {
        select(star.systemId, star.id);
      }
    };

    const onWindowPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== gesture?.pointerId) return;
      gesture = null;
      window.clearTimeout(longPressTimer);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons !== 0) return;
      lastHover = { clientX: event.clientX, clientY: event.clientY };
      if (hoverTimer) return;
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        if (lastHover) showHover(lastHover, false);
      }, HOVER_INTERVAL_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTypingTarget(event.target)) return;
      const { tool, endTool, detail, closeDetail, clearSelection } = useUi.getState();
      if (tool !== 'none') endTool();
      else if (detail) closeDetail();
      else clearSelection();
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerleave', clearHover);
    domElement.addEventListener('wheel', clearHover, { passive: true });
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(longPressTimer);
      window.clearTimeout(hoverTimer);
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerleave', clearHover);
      domElement.removeEventListener('wheel', clearHover);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [camera, domElement, mask, positions, setHover, stars]);

  return null;
}
