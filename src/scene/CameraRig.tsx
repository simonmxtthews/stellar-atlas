import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Matrix4, Vector3 } from 'three';
import {
  flyPose,
  HOME_POSITION,
  HOME_TARGET,
  MAX_CAMERA_DISTANCE,
  MIN_CAMERA_DISTANCE,
} from '../lib/camera';
import { pickPoint } from '../lib/pick';
import { useUi } from '../store/ui';
import type { Position, Star } from '../types/catalogue';
import { starPosition } from './starAttributes';

const PICK_RADIUS_PX = 12;

interface CameraRigProps {
  readonly stars: readonly Star[];
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
}

function toPosition(vector: Vector3): Position {
  return [vector.x, vector.y, vector.z];
}

export function CameraRig({ stars, positions, mask }: CameraRigProps) {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const flyRequest = useUi((state) => state.flyRequest);
  const orbitStarId = useUi((state) => state.orbitStarId);
  const flyToStar = useUi((state) => state.flyToStar);
  const flyHome = useUi((state) => state.flyHome);
  const clearOrbitStar = useUi((state) => state.clearOrbitStar);

  useEffect(() => {
    const rig = controls.current;
    if (!rig || !flyRequest) return;
    if (flyRequest.kind === 'home') {
      void rig.setLookAt(...HOME_POSITION, ...HOME_TARGET, true);
      return;
    }
    const index = stars.findIndex((star) => star.id === flyRequest.starId);
    if (index < 0) return;
    const pose = flyPose(
      starPosition(positions, index),
      toPosition(rig.getPosition(new Vector3())),
      toPosition(rig.getTarget(new Vector3())),
    );
    void rig.setLookAt(...pose.position, ...pose.target, true);
  }, [flyRequest, positions, stars]);

  useEffect(() => {
    const onDoubleClick = (event: MouseEvent) => {
      const rect = domElement.getBoundingClientRect();
      const viewProjection = new Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      const index = pickPoint(
        positions,
        mask,
        viewProjection.elements,
        rect,
        event.clientX - rect.left,
        event.clientY - rect.top,
        PICK_RADIUS_PX,
      );
      const star = stars[index];
      if (star) flyToStar(star.id);
    };
    domElement.addEventListener('dblclick', onDoubleClick);
    return () => domElement.removeEventListener('dblclick', onDoubleClick);
  }, [camera, domElement, flyToStar, mask, positions, stars]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'h') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      flyHome();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flyHome]);

  // A pan moves the orbit point off the star; the end value ignores any flight still settling.
  useEffect(() => {
    const rig = controls.current;
    if (!rig || orbitStarId === null) return;
    const index = stars.findIndex((star) => star.id === orbitStarId);
    if (index < 0) return;
    const star = new Vector3(...starPosition(positions, index));
    const onControlEnd = () => {
      if (rig.getTarget(new Vector3()).distanceTo(star) > 1e-3) clearOrbitStar();
    };
    rig.addEventListener('controlend', onControlEnd);
    return () => rig.removeEventListener('controlend', onControlEnd);
  }, [clearOrbitStar, orbitStarId, positions, stars]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={MIN_CAMERA_DISTANCE}
      maxDistance={MAX_CAMERA_DISTANCE}
      smoothTime={0.4}
    />
  );
}
