/**
 * Hover + click behaviour for the objects in the cabin. The real buttons and links live in the
 * HTML layer (which sits in front of the canvas); these are the 3D twins of the same hrefs.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import { PALETTE } from './palette';

export interface Interactive {
  hovered: boolean;
  /** Spread onto the mesh or group that should react. */
  bind: {
    onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
    onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
    onClick: (event: ThreeEvent<MouseEvent>) => void;
  };
  /** Emissive settings for the hover glow. */
  glow: { emissive: string; emissiveIntensity: number };
}

export function useInteractive(href: string): Interactive {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const onPointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  }, []);

  const onPointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(false);
  }, []);

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (href) window.location.assign(href);
    },
    [href],
  );

  return useMemo(
    () => ({
      hovered,
      bind: { onPointerOver, onPointerOut, onClick },
      glow: { emissive: PALETTE.lampAmber, emissiveIntensity: hovered ? 0.55 : 0 },
    }),
    [hovered, onPointerOver, onPointerOut, onClick],
  );
}
