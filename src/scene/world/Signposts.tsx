/**
 * Wooden signposts down the trail. Headings come from the CMS (`page.signposts`); the ones with
 * a distance label get the pointed board of a walker's waymarker, the rest get a plain plank.
 * No copy is authored here — an empty list simply means an empty trail.
 */
import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { SURFACE } from '../palette';
import { labelTexture, woodSurface } from '../textures';
import { terrainHeight, trailXAt } from '../terrain';
import type { SceneSignpost } from '../types';

/**
 * Waymarkers stand along the stretch of path the camera actually walks (z +27 down to -76),
 * spread evenly so one comes up in each quarter of the scroll. Each is set just off the verge,
 * close enough to read, and turned to face the walker coming down the trail.
 */
const FIRST_Z = 12;
const LAST_Z = -66;
/** Where the eye is when a post is at its most readable: a few metres short of it. */
const READ_AHEAD = 5;

function Post({ signpost, index, total }: { signpost: SceneSignpost; index: number; total: number }) {
  const wood = useMemo(() => woodSurface('plank', 1, 2), []);
  const post = useMemo(() => woodSurface('wall', 1, 3), []);

  const heading = useMemo(
    () =>
      labelTexture(signpost.heading, {
        font: "700 60px Fraunces, Georgia, serif",
        colour: '#241B12',
        width: 1024,
        height: 256,
      }),
    [signpost.heading],
  );

  const distance = useMemo(
    () =>
      signpost.distanceLabel
        ? labelTexture(signpost.distanceLabel, {
            font: "600 52px 'IBM Plex Mono', ui-monospace, monospace",
            colour: '#241B12',
            width: 768,
            height: 192,
            letterSpacing: '2px',
          })
        : null,
    [signpost.distanceLabel],
  );

  const { x, y, z, yaw } = useMemo(() => {
    const t = total <= 1 ? 0.4 : index / (total - 1);
    const zz = FIRST_Z + (LAST_Z - FIRST_Z) * t;
    const side = index % 2 === 0 ? -1 : 1;
    const xx = trailXAt(zz) + side * (1.95 + ((index * 7) % 5) * 0.16);
    // Square on to the walker: aim the board at where the eye will be a few metres back up the
    // path, so the heading is readable for the whole approach rather than for one frame.
    const eyeX = trailXAt(zz + READ_AHEAD);
    return { x: xx, y: terrainHeight(xx, zz), z: zz, yaw: Math.atan2(eyeX - xx, READ_AHEAD) };
  }, [index, total]);

  // Distance markers are the small ones; a heading board is a proper waymarker.
  const marker = Boolean(signpost.distanceLabel);
  const boardWidth = marker ? 1.1 : 1.42;
  const boardHeight = marker ? 0.3 : 0.4;
  const boardY = marker ? 1.34 : 1.62;
  const postHeight = boardY + boardHeight / 2 + 0.08;

  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      {/* Post: a squared-off timber with its edges knocked off. */}
      <RoundedBox args={[marker ? 0.1 : 0.12, postHeight, marker ? 0.1 : 0.12]} radius={0.02} smoothness={2} position={[0, postHeight / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={post.map} normalMap={post.normalMap} normalScale={post.normalScale} roughnessMap={post.roughnessMap} color="#6B5138" metalness={0} envMapIntensity={0.6} />
      </RoundedBox>

      {/* Board. */}
      <group position={[0, boardY, 0]}>
        <RoundedBox args={[boardWidth, boardHeight, 0.05]} radius={0.013} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} roughnessMap={wood.roughnessMap} color="#8A6C48" metalness={0} envMapIntensity={0.7} />
        </RoundedBox>
        {!marker && (
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[boardWidth - 0.1, boardHeight - 0.08]} />
            <meshStandardMaterial map={heading} transparent roughness={0.9} metalness={0} />
          </mesh>
        )}
      </group>

      {distance && (
        <mesh position={[0, boardY, 0.028]}>
          <planeGeometry args={[boardWidth - 0.12, boardHeight - 0.09]} />
          <meshStandardMaterial map={distance} transparent roughness={0.9} metalness={0} />
        </mesh>
      )}

      {/* A stone at the foot, so the post is planted rather than stuck in. */}
      <mesh position={[0.08, 0.04, 0.05]} rotation={[0.3, 0.8, 0.2]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.17, 1]} />
        <meshStandardMaterial color={SURFACE.stone} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

export default function Signposts({ signposts }: { signposts: SceneSignpost[] }) {
  const shown = useMemo(() => signposts.slice(0, 6), [signposts]);
  if (!shown.length) return null;
  return (
    <group>
      {shown.map((signpost, index) => (
        <Post key={`${signpost.heading}-${index}`} signpost={signpost} index={index} total={shown.length} />
      ))}
    </group>
  );
}
