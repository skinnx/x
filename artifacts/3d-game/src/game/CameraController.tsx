import { useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const CAM_OFFSET = new THREE.Vector3(0, 7, 10);
const CAM_LERP = 5;
const CAM_ROT_LERP = 3;

export function CameraController() {
  const targetPos = useRef(new THREE.Vector3());
  const targetAngle = useRef(0);
  const { camera } = useThree();

  useFrame((_, delta) => {
    const camTarget = targetPos.current.clone().add(
      CAM_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0)
    );
    camera.position.lerp(camTarget, CAM_LERP * delta);
    const lookAt = targetPos.current.clone().add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(lookAt);
  });

  return null;
}

export function useCameraTarget() {
  const posRef = useRef(new THREE.Vector3());
  const angleRef = useRef(0);
  
  const update = useCallback((pos: THREE.Vector3, angle: number) => {
    posRef.current.copy(pos);
    angleRef.current = angle;
  }, []);

  return { posRef, angleRef, update };
}
