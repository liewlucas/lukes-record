/**
 * The 3D layer: one continuous, scroll-driven walk from a golden-hour vista, down a pine trail,
 * in through a cabin door, around the record rack, the photo line, the bookcase and the desk,
 * and out of the back door onto a dusk porch.
 *
 * Everything is procedural. There is no GLB, no HDR, no texture file and no CDN preset in this
 * folder — the terrain, the trees, the timber, the paper, the shingles and the environment
 * lighting are all generated at runtime from noise and 2D canvases (see ./textures.ts).
 *
 * The island renders nothing until it knows it can: no WebGL2, no scene. When it does draw, it
 * sets `html[data-scene='on']`, which is the page's cue to stand its flat stand-ins down.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

import '../styles/scene.css';

import ErrorBoundary from './ErrorBoundary';
import Effects from './Effects';
import Lighting from './Lighting';
import { budget as budgetFor, useCapabilities } from './capabilities';
import { JourneyCamera, WAYPOINTS, type Framing, type SectionKey } from './journey';
import { PointerBridge, focusState, parseFocus } from './interactive';
import { CABIN, CORNERS, SUN_DIRECTION, bookSlot, framingFor, printSlot, recordSlot } from './layout';
import { CLEAR_COLOUR } from './palette';
import { disposeTextures } from './textures';
import type { SceneProps } from './types';

import Outdoors from './world/Outdoors';
import Pines from './world/Pines';
import Signposts from './world/Signposts';
import Cabin from './world/Cabin';
import Interior from './world/Interior';
import VinylShelf from './world/VinylShelf';
import PhotoWall from './world/PhotoWall';
import Bookshelf from './world/Bookshelf';
import Desk from './world/Desk';
import Porch from './world/Porch';

const SUN = new THREE.Vector3(...SUN_DIRECTION).normalize();
/** Brass plaques on the porch wall. Labels live in the HTML layer; these are the objects. */
const PLAQUE_COUNT = 3;

export default function Scene({ zone, focus, data }: SceneProps) {
  const caps = useCapabilities();
  const [live, setLive] = useState(false);
  const budget = useMemo(() => budgetFor(caps?.tier ?? 'low'), [caps?.tier]);

  /** Deep links: pull one object forward and frame it, or just frame a corner. */
  const framing = useMemo<Framing | undefined>(() => {
    const { id, corner } = parseFocus(focus);
    focusState.id = id;
    if (id?.startsWith('photo:')) {
      const slug = id.slice('photo:'.length);
      const index = data.prints.findIndex((print) => print.slug === slug);
      if (index >= 0) return framingFor(printSlot(index, Math.max(data.prints.length, 5)), 1.05, 0.04);
    } else if (id) {
      const index = data.records.findIndex((record) => record.slug === id);
      if (index >= 0) return framingFor(recordSlot(index), 0.92, 0.03);
      const book = data.books.findIndex((entry) => entry.slug === id);
      if (book >= 0) return framingFor(bookSlot(book), 0.8, 0.02);
    }
    if (corner === 'photos') return { position: [-2.0, CABIN.floorY + 1.5, -103.3], lookAt: [-2.45, CABIN.floorY + 1.42, -106.1] };
    if (corner === 'books') return { position: [3.2, CABIN.floorY + 1.34, -100.5], lookAt: [CORNERS.books.x - 0.13, CABIN.floorY + 1.04, CORNERS.books.z - 0.38] };
    if (corner === 'vinyl') return { position: [-2.45, CABIN.floorY + 1.4, -97.9], lookAt: [CORNERS.vinyl.x + 0.09, CABIN.floorY + 1.26, CORNERS.vinyl.z + 0.49] };
    return undefined;
  }, [focus, data]);

  useEffect(() => {
    if (!live) return;
    document.documentElement.dataset.scene = 'on';
    return () => {
      delete document.documentElement.dataset.scene;
    };
  }, [live]);

  useEffect(() => () => disposeTextures(), []);

  if (!caps || !caps.webgl2) return null;

  const animate = !caps.reducedMotion;
  const start = zone as SectionKey;
  const first = WAYPOINTS[0];

  return (
    <ErrorBoundary>
      <Canvas
        frameloop={caps.reducedMotion ? 'demand' : 'always'}
        dpr={[1, budget.dpr]}
        shadows={budget.shadows ? 'percentage' : false}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false }}
        camera={{ fov: first.fov, near: 0.15, far: 1000, position: first.pos }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = first.exposure;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearColor(new THREE.Color(CLEAR_COLOUR), 1);
          scene.environmentIntensity = 1;
          setLive(true);
        }}
      >
        <Suspense fallback={null}>
          <Lighting budget={budget} animate={animate} />

          <Outdoors
            terrainSegments={budget.terrainSegments}
            pathSegments={budget.pathSegments}
            mist={budget.mist}
            animate={animate}
            detail={caps.tier !== 'low'}
            sunDir={SUN}
          />
          <Pines count={budget.trees} animate={animate} shadows={budget.shadows} radialSegments={caps.tier === 'high' ? 10 : 7} />
          <Signposts signposts={data.signposts} />

          <Cabin shadows={budget.shadows} animate={animate} glass={budget.glass} smoke={budget.smoke} />
          <Interior shadows={budget.shadows} animate={animate} motes={budget.motes} embers={budget.embers} detail={caps.tier !== 'low'} />

          <VinylShelf records={data.records} animate={animate} shadows={budget.shadows} />
          <PhotoWall prints={data.prints} />
          <Bookshelf books={data.books} shadows={budget.shadows} />
          <Desk ownerName={data.ownerName} animate={animate} shadows={budget.shadows} />
          <Porch shadows={budget.shadows} plaques={PLAQUE_COUNT} />
        </Suspense>

        <JourneyCamera start={start} reducedMotion={caps.reducedMotion} framing={framing} />
        <PointerBridge />
        <Effects budget={budget} deepLink={Boolean(framing)} />
      </Canvas>
    </ErrorBoundary>
  );
}
