import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { useActor } from "../hooks/useActor";

// ─── Types ────────────────────────────────────────────────────────────────────
type GamePhase = "start" | "playing" | "gameover";

interface NpcCar {
  id: number;
  lane: number; // -2, 0, 2
  z: number;
  color: string;
  bodyWidth: number;
  bodyLength: number;
}

interface GameState {
  phase: GamePhase;
  score: number;
  speed: number;
  speedLevel: number;
  highScore: number | null;
  isLoadingHigh: boolean;
}

// ─── NPC Car Colors ────────────────────────────────────────────────────────────
const NPC_COLORS = [
  "#ff3b3b", // vivid red
  "#ff9500", // orange
  "#ffcc00", // yellow
  "#30d158", // green
  "#0a84ff", // blue
  "#bf5af2", // purple
  "#ff375f", // hot pink
  "#5ac8fa", // cyan
];

const LANES = [-2, 0, 2] as const;
const ROAD_SEGMENT_HEIGHT = 10;
const NUM_ROAD_SEGMENTS = 8;
const ROAD_WIDTH = 6;
const INITIAL_SPEED = 8;
const SPEED_INCREMENT = 0.5;
const SPEED_INTERVAL = 5; // seconds
const SCORE_PER_SEC = 10;

// Static wheel configs with named keys
const WHEEL_CONFIGS = [
  { key: "fl", xSign: -1, zSign: 1 }, // front-left
  { key: "fr", xSign: 1, zSign: 1 }, // front-right
  { key: "rl", xSign: -1, zSign: -1 }, // rear-left
  { key: "rr", xSign: 1, zSign: -1 }, // rear-right
] as const;

// Static road segment keys
const ROAD_SEGMENT_KEYS = [
  "seg0",
  "seg1",
  "seg2",
  "seg3",
  "seg4",
  "seg5",
  "seg6",
  "seg7",
] as const;

// ─── Shared game ref data (avoids React re-renders in game loop) ───────────────
interface GameRef {
  phase: GamePhase;
  speed: number;
  score: number;
  speedTimer: number;
  speedLevel: number;
  playerLane: number; // target lane index (0,1,2)
  playerX: number; // current interpolated X
  playerTilt: number; // Z rotation tilt
  keys: Set<string>;
  lastLaneChange: number; // time of last lane change
  npcs: NpcCar[];
  isColliding: boolean;
  onGameOver: () => void;
}

// ─── Car Component ─────────────────────────────────────────────────────────────
function CarMesh({
  color,
  isPlayer,
}: {
  color: string;
  isPlayer: boolean;
}) {
  const bodyH = 0.45;
  const roofH = 0.3;
  const wheelR = 0.2;
  const wheelW = 0.18;
  const bodyW = isPlayer ? 0.9 : 0.85;
  const bodyL = isPlayer ? 1.8 : 1.6;

  const windshieldColor = isPlayer ? "#88ccff" : "#aaddff";
  const wheelColor = "#1a1a2e";
  const hubColor = "#888";

  return (
    <group>
      {/* Body */}
      <mesh castShadow position={[0, bodyH / 2, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyL]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Roof */}
      <mesh castShadow position={[0, bodyH + roofH / 2, -0.1]}>
        <boxGeometry args={[bodyW * 0.72, roofH, bodyL * 0.55]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Windshield */}
      <mesh position={[0, bodyH + roofH * 0.5, bodyL * 0.2]}>
        <boxGeometry args={[bodyW * 0.65, roofH * 0.7, 0.06]} />
        <meshStandardMaterial
          color={windshieldColor}
          transparent
          opacity={0.7}
          roughness={0.1}
        />
      </mesh>
      {/* Rear window */}
      <mesh position={[0, bodyH + roofH * 0.5, -bodyL * 0.3]}>
        <boxGeometry args={[bodyW * 0.6, roofH * 0.6, 0.06]} />
        <meshStandardMaterial
          color={windshieldColor}
          transparent
          opacity={0.6}
          roughness={0.1}
        />
      </mesh>
      {/* Wheels - use static named keys */}
      {WHEEL_CONFIGS.map(({ key, xSign, zSign }) => (
        <group
          key={key}
          position={[bodyW * 0.52 * xSign, wheelR, bodyL * 0.32 * zSign]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <mesh>
            <cylinderGeometry args={[wheelR, wheelR, wheelW, 10]} />
            <meshStandardMaterial color={wheelColor} roughness={0.8} />
          </mesh>
          <mesh>
            <cylinderGeometry
              args={[wheelR * 0.55, wheelR * 0.55, wheelW + 0.01, 8]}
            />
            <meshStandardMaterial
              color={hubColor}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}
      {/* Headlights / taillights */}
      {isPlayer && (
        <>
          <mesh position={[-bodyW * 0.3, bodyH * 0.5, bodyL * 0.51]}>
            <boxGeometry args={[0.22, 0.1, 0.04]} />
            <meshStandardMaterial
              color="#ffffee"
              emissive="#ffffcc"
              emissiveIntensity={1.5}
            />
          </mesh>
          <mesh position={[bodyW * 0.3, bodyH * 0.5, bodyL * 0.51]}>
            <boxGeometry args={[0.22, 0.1, 0.04]} />
            <meshStandardMaterial
              color="#ffffee"
              emissive="#ffffcc"
              emissiveIntensity={1.5}
            />
          </mesh>
          <mesh position={[-bodyW * 0.3, bodyH * 0.5, -bodyL * 0.51]}>
            <boxGeometry args={[0.22, 0.1, 0.04]} />
            <meshStandardMaterial
              color="#ff2200"
              emissive="#ff2200"
              emissiveIntensity={1.0}
            />
          </mesh>
          <mesh position={[bodyW * 0.3, bodyH * 0.5, -bodyL * 0.51]}>
            <boxGeometry args={[0.22, 0.1, 0.04]} />
            <meshStandardMaterial
              color="#ff2200"
              emissive="#ff2200"
              emissiveIntensity={1.0}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// ─── Road Segment ───────────────────────────────────────────────────────────────
function RoadSegment({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      {/* Asphalt */}
      <mesh receiveShadow>
        <boxGeometry args={[ROAD_WIDTH, 0.05, ROAD_SEGMENT_HEIGHT]} />
        <meshStandardMaterial color="#2a2a3a" roughness={0.9} />
      </mesh>
      {/* Left lane line */}
      <mesh position={[-1, 0.04, 0]}>
        <boxGeometry args={[0.08, 0.02, ROAD_SEGMENT_HEIGHT * 0.6]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.5}
          opacity={0.6}
          transparent
        />
      </mesh>
      {/* Right lane line */}
      <mesh position={[1, 0.04, 0]}>
        <boxGeometry args={[0.08, 0.02, ROAD_SEGMENT_HEIGHT * 0.6]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.5}
          opacity={0.6}
          transparent
        />
      </mesh>
      {/* Road edges (yellow) */}
      <mesh position={[-(ROAD_WIDTH / 2 - 0.06), 0.04, 0]}>
        <boxGeometry args={[0.1, 0.02, ROAD_SEGMENT_HEIGHT]} />
        <meshStandardMaterial
          color="#ffcc00"
          roughness={0.5}
          opacity={0.8}
          transparent
        />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2 - 0.06, 0.04, 0]}>
        <boxGeometry args={[0.1, 0.02, ROAD_SEGMENT_HEIGHT]} />
        <meshStandardMaterial
          color="#ffcc00"
          roughness={0.5}
          opacity={0.8}
          transparent
        />
      </mesh>
    </group>
  );
}

// ─── Scene Component ───────────────────────────────────────────────────────────
function GameScene({ gameRef }: { gameRef: React.MutableRefObject<GameRef> }) {
  const roadZsRef = useRef<number[]>(
    Array.from(
      { length: NUM_ROAD_SEGMENTS },
      (_, i) => i * -ROAD_SEGMENT_HEIGHT,
    ),
  );
  const roadGroupRef = useRef<THREE.Group>(null);
  const playerRef = useRef<THREE.Group>(null);
  const npcRefs = useRef<(THREE.Group | null)[]>(Array(8).fill(null));
  const leftGrassRef = useRef<THREE.Mesh>(null);
  const grassOffsetRef = useRef(0);

  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 12, 8);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const g = gameRef.current;
    if (g.phase !== "playing") return;

    const dt = Math.min(delta, 0.05);
    const speed = g.speed;

    // Score & speed level
    g.score += SCORE_PER_SEC * (speed / INITIAL_SPEED) * dt;
    g.speedTimer += dt;
    if (g.speedTimer >= SPEED_INTERVAL) {
      g.speedTimer = 0;
      g.speedLevel += 1;
      g.speed += SPEED_INCREMENT;
    }

    // Player lane input
    const now = performance.now();
    const LANE_COOLDOWN = 220;
    if (now - g.lastLaneChange > LANE_COOLDOWN) {
      if (g.keys.has("ArrowLeft") || g.keys.has("a") || g.keys.has("A")) {
        if (g.playerLane > 0) {
          g.playerLane--;
          g.lastLaneChange = now;
          g.playerTilt = 0.22;
        }
      } else if (
        g.keys.has("ArrowRight") ||
        g.keys.has("d") ||
        g.keys.has("D")
      ) {
        if (g.playerLane < 2) {
          g.playerLane++;
          g.lastLaneChange = now;
          g.playerTilt = -0.22;
        }
      }
    }

    // Decay tilt
    g.playerTilt *= 0.88;

    // Interpolate player X
    const targetX = LANES[g.playerLane];
    g.playerX += (targetX - g.playerX) * Math.min(dt * 12, 1);

    if (playerRef.current) {
      playerRef.current.position.x = g.playerX;
      playerRef.current.rotation.z = g.playerTilt;
    }

    // Scroll road segments
    const roadZs = roadZsRef.current;
    const totalRoadLength = NUM_ROAD_SEGMENTS * ROAD_SEGMENT_HEIGHT;
    const scrollSpeed = speed * dt;

    for (let i = 0; i < roadZs.length; i++) {
      roadZs[i] += scrollSpeed;
      if (roadZs[i] > ROAD_SEGMENT_HEIGHT) {
        roadZs[i] -= totalRoadLength;
      }
    }

    if (roadGroupRef.current) {
      const children = roadGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        children[i].position.z = roadZs[i];
      }
    }

    // Scroll grass offset
    grassOffsetRef.current += scrollSpeed;
    if (leftGrassRef.current) {
      (
        leftGrassRef.current.material as THREE.MeshStandardMaterial
      ).map?.offset.set(0, -grassOffsetRef.current * 0.01);
    }

    // NPC cars
    const npcs = g.npcs;
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      npc.z += scrollSpeed * 1.3;

      if (npc.z > 8) {
        npc.z = -40 - Math.random() * 30;
        npc.lane = LANES[Math.floor(Math.random() * 3)];
        npc.color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
      }

      const npcRef = npcRefs.current[i];
      if (npcRef) {
        npcRef.position.x = npc.lane;
        npcRef.position.z = npc.z;
        npcRef.visible = npc.z > -60 && npc.z < 8;
      }
    }

    // Collision detection (AABB)
    const playerHalfW = 0.45;
    const playerHalfL = 0.9;
    const playerZ = 2.5;

    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const npcHalfW = npc.bodyWidth * 0.5;
      const npcHalfL = npc.bodyLength * 0.5;

      const overlapX = Math.abs(g.playerX - npc.lane) < playerHalfW + npcHalfW;
      const overlapZ = Math.abs(playerZ - npc.z) < playerHalfL + npcHalfL;

      if (overlapX && overlapZ && !g.isColliding) {
        g.isColliding = true;
        g.onGameOver();
        return;
      }
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 15, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight
        position={[-5, 8, -5]}
        intensity={0.3}
        color="#4466aa"
      />

      {/* Fog */}
      <fog attach="fog" args={["#0f0f1a", 20, 60]} />

      {/* Road segments group - static keys from constant array */}
      <group ref={roadGroupRef}>
        <RoadSegment key={ROAD_SEGMENT_KEYS[0]} z={roadZsRef.current[0]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[1]} z={roadZsRef.current[1]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[2]} z={roadZsRef.current[2]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[3]} z={roadZsRef.current[3]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[4]} z={roadZsRef.current[4]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[5]} z={roadZsRef.current[5]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[6]} z={roadZsRef.current[6]} />
        <RoadSegment key={ROAD_SEGMENT_KEYS[7]} z={roadZsRef.current[7]} />
      </group>

      {/* Grass */}
      <mesh
        ref={leftGrassRef}
        receiveShadow
        position={[-ROAD_WIDTH / 2 - 5, -0.02, -20]}
      >
        <boxGeometry args={[10, 0.08, 80]} />
        <meshStandardMaterial color="#2d5a27" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[ROAD_WIDTH / 2 + 5, -0.02, -20]}>
        <boxGeometry args={[10, 0.08, 80]} />
        <meshStandardMaterial color="#2d5a27" roughness={1} />
      </mesh>

      {/* Roadside barriers */}
      <mesh position={[-ROAD_WIDTH / 2 - 0.2, 0.15, -20]}>
        <boxGeometry args={[0.18, 0.35, 80]} />
        <meshStandardMaterial color="#cc3333" roughness={0.6} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2 + 0.2, 0.15, -20]}>
        <boxGeometry args={[0.18, 0.35, 80]} />
        <meshStandardMaterial color="#cc3333" roughness={0.6} />
      </mesh>

      {/* Player car */}
      <group ref={playerRef} position={[LANES[1], 0.2, 2.5]}>
        <CarMesh color="#c8e000" isPlayer={true} />
        <pointLight
          position={[0, -0.1, 0]}
          intensity={0.8}
          color="#aaff00"
          distance={2}
        />
      </group>

      {/* NPC cars (pool) - keyed by stable id */}
      {gameRef.current.npcs.map((npc, i) => (
        <group
          key={npc.id}
          ref={(el) => {
            npcRefs.current[i] = el;
          }}
          position={[npc.lane, 0.2, npc.z]}
        >
          <CarMesh color={npc.color} isPlayer={false} />
        </group>
      ))}
    </>
  );
}

// ─── Touch Control Button ──────────────────────────────────────────────────────
function TouchButton({
  direction,
  gameRef,
}: {
  direction: "left" | "right";
  gameRef: React.MutableRefObject<GameRef>;
}) {
  const [pressed, setPressed] = useState(false);
  const key = direction === "left" ? "ArrowLeft" : "ArrowRight";
  const isLeft = direction === "left";

  const handlePressStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      gameRef.current.keys.add(key);
      setPressed(true);
    },
    [gameRef, key],
  );

  const handlePressEnd = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      gameRef.current.keys.delete(key);
      setPressed(false);
    },
    [gameRef, key],
  );

  return (
    <button
      type="button"
      data-ocid={isLeft ? "game.left_button" : "game.right_button"}
      aria-label={isLeft ? "Move left" : "Move right"}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      className="pointer-events-auto select-none"
      style={{
        width: 72,
        height: 72,
        borderRadius: "50%",
        background: pressed
          ? "oklch(0.85 0.25 120 / 0.25)"
          : "oklch(0.1 0.02 250 / 0.72)",
        border: `2px solid oklch(0.85 0.25 120 / ${pressed ? "0.9" : "0.55"})`,
        backdropFilter: "blur(10px)",
        boxShadow: pressed
          ? "0 0 20px oklch(0.85 0.25 120 / 0.5), inset 0 0 12px oklch(0.85 0.25 120 / 0.15)"
          : "0 4px 16px oklch(0 0 0 / 0.4), 0 0 8px oklch(0.85 0.25 120 / 0.15)",
        transform: pressed ? "scale(0.90)" : "scale(1)",
        transition:
          "transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease, border-color 0.08s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: "none",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontSize: 28,
          lineHeight: 1,
          color: pressed ? "oklch(0.98 0.18 120)" : "oklch(0.85 0.25 120)",
          textShadow: pressed
            ? "0 0 12px oklch(0.85 0.25 120 / 0.9)"
            : "0 0 6px oklch(0.85 0.25 120 / 0.5)",
          transition: "color 0.08s ease",
          display: "block",
          pointerEvents: "none",
        }}
      >
        {isLeft ? "◀" : "▶"}
      </span>
    </button>
  );
}

// ─── HUD Overlay ───────────────────────────────────────────────────────────────
function HUD({
  score,
  speedLevel,
  speed,
  gameRef,
}: {
  score: number;
  speedLevel: number;
  speed: number;
  gameRef: React.MutableRefObject<GameRef>;
}) {
  const maxSpeed = INITIAL_SPEED + SPEED_INCREMENT * 20;
  const speedPct = Math.min(
    ((speed - INITIAL_SPEED) / (maxSpeed - INITIAL_SPEED)) * 100,
    100,
  );

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Score - top left */}
      <div
        data-ocid="game.score_panel"
        className="absolute top-4 left-4 hud-slide-in"
      >
        <div
          style={{
            background: "oklch(0.15 0.02 250 / 0.88)",
            border: "1px solid oklch(0.85 0.25 120 / 0.4)",
            backdropFilter: "blur(8px)",
          }}
          className="rounded-xl px-5 py-3"
        >
          <div
            style={{ color: "oklch(0.6 0.05 250)" }}
            className="text-xs font-body uppercase tracking-widest mb-1"
          >
            Score
          </div>
          <div
            style={{
              color: "oklch(0.85 0.25 120)",
              fontFamily: "Bricolage Grotesque, sans-serif",
            }}
            className="text-3xl font-bold tabular-nums"
          >
            {Math.floor(score).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Speed - top right */}
      <div
        data-ocid="game.speed_panel"
        className="absolute top-4 right-4 hud-slide-in"
      >
        <div
          style={{
            background: "oklch(0.15 0.02 250 / 0.88)",
            border: "1px solid oklch(0.85 0.25 120 / 0.4)",
            backdropFilter: "blur(8px)",
          }}
          className="rounded-xl px-5 py-3 min-w-[120px]"
        >
          <div
            style={{ color: "oklch(0.6 0.05 250)" }}
            className="text-xs font-body uppercase tracking-widest mb-1"
          >
            Speed Lv.
          </div>
          <div
            style={{
              color: "oklch(0.85 0.25 120)",
              fontFamily: "Bricolage Grotesque, sans-serif",
            }}
            className="text-3xl font-bold tabular-nums"
          >
            {speedLevel}
          </div>
          {/* Speed bar */}
          <div
            className="mt-2 rounded-full overflow-hidden"
            style={{ background: "oklch(0.25 0.02 250)", height: 4 }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${speedPct}%`,
                background:
                  speedPct > 70
                    ? "oklch(0.55 0.22 25)"
                    : "oklch(0.85 0.25 120)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Controls hint - centered bottom, above touch buttons */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
        <div
          style={{
            background: "oklch(0.12 0.02 250 / 0.7)",
            border: "1px solid oklch(0.3 0.03 250 / 0.5)",
          }}
          className="rounded-full px-4 py-1.5 flex items-center gap-3"
        >
          <span
            style={{ color: "oklch(0.5 0.04 250)" }}
            className="text-xs font-body"
          >
            ← → or A D • tap buttons to switch lanes
          </span>
        </div>
      </div>

      {/* Touch buttons - bottom corners, pointer-events-auto */}
      <div
        className="absolute bottom-8 left-6"
        style={{ pointerEvents: "auto" }}
      >
        <TouchButton direction="left" gameRef={gameRef} />
      </div>
      <div
        className="absolute bottom-8 right-6"
        style={{ pointerEvents: "auto" }}
      >
        <TouchButton direction="right" gameRef={gameRef} />
      </div>
    </div>
  );
}

// ─── Start Screen ──────────────────────────────────────────────────────────────
function StartScreen({ onPlay }: { onPlay: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.08 0.03 250) 0%, oklch(0.14 0.04 250) 100%)",
      }}
    >
      {/* Decorative grid lines */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            oklch(0.85 0.25 120 / 0.3) 0px,
            oklch(0.85 0.25 120 / 0.3) 1px,
            transparent 1px,
            transparent 60px
          ),
          repeating-linear-gradient(
            90deg,
            oklch(0.85 0.25 120 / 0.3) 0px,
            oklch(0.85 0.25 120 / 0.3) 1px,
            transparent 1px,
            transparent 60px
          )`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        {/* Badge */}
        <div
          style={{
            background: "oklch(0.85 0.25 120 / 0.15)",
            border: "1px solid oklch(0.85 0.25 120 / 0.4)",
            color: "oklch(0.85 0.25 120)",
          }}
          className="rounded-full px-4 py-1 text-xs font-body uppercase tracking-[0.25em]"
        >
          Infinite Runner
        </div>

        {/* Title */}
        <div className="text-center">
          <h1
            className="font-display font-black leading-none neon-title"
            style={{
              fontSize: "clamp(3rem, 10vw, 6rem)",
              color: "oklch(0.85 0.25 120)",
              letterSpacing: "-0.02em",
            }}
          >
            ROAD
          </h1>
          <h1
            className="font-display font-black leading-none"
            style={{
              fontSize: "clamp(3rem, 10vw, 6rem)",
              color: "oklch(0.96 0.01 100)",
              letterSpacing: "-0.02em",
              marginTop: "-0.1em",
            }}
          >
            RUSH <span style={{ color: "oklch(0.55 0.22 25)" }}>3D</span>
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="font-body text-center max-w-xs"
          style={{ color: "oklch(0.65 0.05 250)", fontSize: "1.05rem" }}
        >
          Dodge the traffic. How far can you go?
        </p>

        {/* Play button */}
        <button
          type="button"
          data-ocid="game.play_button"
          onClick={onPlay}
          className="relative group mt-2"
          style={{ outline: "none" }}
        >
          <div
            className="absolute inset-0 rounded-2xl blur-xl transition-opacity duration-300 group-hover:opacity-100 opacity-60"
            style={{ background: "oklch(0.85 0.25 120 / 0.4)" }}
          />
          <div
            className="relative rounded-2xl px-12 py-4 font-display font-black text-2xl uppercase tracking-widest transition-transform duration-150 active:scale-95 group-hover:scale-105"
            style={{
              background: "oklch(0.85 0.25 120)",
              color: "oklch(0.1 0.02 250)",
              letterSpacing: "0.15em",
              boxShadow: "0 4px 30px oklch(0.85 0.25 120 / 0.5)",
            }}
          >
            PLAY
          </div>
        </button>

        {/* Controls */}
        <div
          className="mt-2 flex flex-col items-center gap-3"
          style={{ color: "oklch(0.5 0.04 250)" }}
        >
          <div className="text-xs font-body uppercase tracking-widest">
            Controls
          </div>
          {/* Keyboard controls row */}
          <div className="flex items-center gap-3">
            <kbd
              className="rounded px-2.5 py-1 text-sm font-bold"
              style={{
                background: "oklch(0.2 0.02 250)",
                border: "1px solid oklch(0.35 0.03 250)",
                color: "oklch(0.8 0.03 250)",
              }}
            >
              ←
            </kbd>
            <kbd
              className="rounded px-2.5 py-1 text-sm font-bold"
              style={{
                background: "oklch(0.2 0.02 250)",
                border: "1px solid oklch(0.35 0.03 250)",
                color: "oklch(0.8 0.03 250)",
              }}
            >
              A
            </kbd>
            <span className="text-xs">Move Left</span>
            <kbd
              className="rounded px-2.5 py-1 text-sm font-bold"
              style={{
                background: "oklch(0.2 0.02 250)",
                border: "1px solid oklch(0.35 0.03 250)",
                color: "oklch(0.8 0.03 250)",
              }}
            >
              →
            </kbd>
            <kbd
              className="rounded px-2.5 py-1 text-sm font-bold"
              style={{
                background: "oklch(0.2 0.02 250)",
                border: "1px solid oklch(0.35 0.03 250)",
                color: "oklch(0.8 0.03 250)",
              }}
            >
              D
            </kbd>
            <span className="text-xs">Move Right</span>
          </div>
          {/* Touch controls hint */}
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2"
            style={{
              background: "oklch(0.14 0.025 250)",
              border: "1px solid oklch(0.85 0.25 120 / 0.2)",
            }}
          >
            <span
              style={{
                fontSize: 18,
                color: "oklch(0.85 0.25 120 / 0.8)",
                lineHeight: 1,
              }}
            >
              ◀
            </span>
            <span
              className="text-xs font-body"
              style={{ color: "oklch(0.6 0.05 250)" }}
            >
              Tap on-screen buttons on mobile
            </span>
            <span
              style={{
                fontSize: 18,
                color: "oklch(0.85 0.25 120 / 0.8)",
                lineHeight: 1,
              }}
            >
              ▶
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Game Over Screen ──────────────────────────────────────────────────────────
function GameOverScreen({
  score,
  highScore,
  isLoadingHigh,
  onRestart,
}: {
  score: number;
  highScore: number | null;
  isLoadingHigh: boolean;
  onRestart: () => void;
}) {
  const isNewHighScore = highScore !== null && Math.floor(score) >= highScore;

  return (
    <div
      data-ocid="game.gameover_dialog"
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: "oklch(0.06 0.02 250 / 0.92)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        className="gameover-card flex flex-col items-center gap-5 px-8 py-10 mx-4 max-w-sm w-full rounded-3xl relative overflow-hidden"
        style={{
          background: "oklch(0.14 0.03 250)",
          border: "1px solid oklch(0.55 0.22 25 / 0.5)",
          boxShadow:
            "0 0 60px oklch(0.55 0.22 25 / 0.2), 0 20px 60px oklch(0 0 0 / 0.5)",
        }}
      >
        {/* Decorative corner accent */}
        <div
          className="absolute top-0 right-0 w-24 h-24 opacity-20"
          style={{
            background:
              "radial-gradient(circle at top right, oklch(0.55 0.22 25), transparent 70%)",
          }}
        />

        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl danger-flash"
          style={{
            background: "oklch(0.55 0.22 25 / 0.2)",
            border: "2px solid oklch(0.55 0.22 25 / 0.6)",
          }}
        >
          💥
        </div>

        {/* Title */}
        <div className="text-center">
          <h2
            className="font-display font-black"
            style={{
              fontSize: "2.5rem",
              color: "oklch(0.55 0.22 25)",
              letterSpacing: "-0.02em",
              textShadow: "0 0 20px oklch(0.55 0.22 25 / 0.6)",
            }}
          >
            GAME OVER
          </h2>
        </div>

        {/* Score */}
        <div
          className="w-full rounded-2xl px-6 py-4 text-center"
          style={{ background: "oklch(0.18 0.03 250)" }}
        >
          <div
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "oklch(0.55 0.05 250)" }}
          >
            Your Score
          </div>
          <div
            className="font-display font-black text-4xl tabular-nums"
            style={{ color: "oklch(0.85 0.25 120)" }}
          >
            {Math.floor(score).toLocaleString()}
          </div>
          {isNewHighScore && (
            <div
              className="mt-1 text-xs font-bold uppercase tracking-wider"
              style={{ color: "oklch(0.85 0.25 120)" }}
            >
              🏆 New High Score!
            </div>
          )}
        </div>

        {/* High score */}
        <div
          data-ocid="game.highscore_panel"
          className="w-full rounded-xl px-6 py-3 flex items-center justify-between"
          style={{
            background: "oklch(0.16 0.025 250)",
            border: "1px solid oklch(0.25 0.03 250)",
          }}
        >
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "oklch(0.5 0.04 250)" }}
          >
            Best
          </span>
          {isLoadingHigh ? (
            <div className="text-sm" style={{ color: "oklch(0.5 0.04 250)" }}>
              Loading...
            </div>
          ) : (
            <span
              className="font-display font-bold text-xl tabular-nums"
              style={{ color: "oklch(0.75 0.1 250)" }}
            >
              {highScore !== null ? highScore.toLocaleString() : "—"}
            </span>
          )}
        </div>

        {/* Restart button */}
        <button
          type="button"
          data-ocid="game.restart_button"
          onClick={onRestart}
          className="relative group w-full mt-2"
        >
          <div
            className="absolute inset-0 rounded-xl blur-lg opacity-60 group-hover:opacity-100 transition-opacity"
            style={{ background: "oklch(0.85 0.25 120 / 0.35)" }}
          />
          <div
            className="relative w-full rounded-xl py-4 font-display font-black text-lg uppercase tracking-widest transition-transform active:scale-95 group-hover:scale-[1.02]"
            style={{
              background: "oklch(0.85 0.25 120)",
              color: "oklch(0.1 0.02 250)",
              letterSpacing: "0.12em",
            }}
          >
            PLAY AGAIN
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function RacingGame() {
  const [gameState, setGameState] = useState<GameState>({
    phase: "start",
    score: 0,
    speed: INITIAL_SPEED,
    speedLevel: 1,
    highScore: null,
    isLoadingHigh: false,
  });

  const { actor } = useActor();

  const gameRef = useRef<GameRef>({
    phase: "start",
    speed: INITIAL_SPEED,
    score: 0,
    speedTimer: 0,
    speedLevel: 1,
    playerLane: 1,
    playerX: LANES[1],
    playerTilt: 0,
    keys: new Set(),
    lastLaneChange: 0,
    npcs: Array.from({ length: 8 }, (_, i) => ({
      id: i,
      lane: LANES[Math.floor(Math.random() * 3)],
      z: -15 - i * 8,
      color: NPC_COLORS[i % NPC_COLORS.length],
      bodyWidth: 0.85,
      bodyLength: 1.6,
    })),
    isColliding: false,
    onGameOver: () => {},
  });

  const [displayScore, setDisplayScore] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(INITIAL_SPEED);
  const [displayLevel, setDisplayLevel] = useState(1);

  // Sync HUD display from game loop ref
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameRef.current.phase === "playing") {
        setDisplayScore(gameRef.current.score);
        setDisplaySpeed(gameRef.current.speed);
        setDisplayLevel(gameRef.current.speedLevel);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      gameRef.current.keys.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      gameRef.current.keys.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleGameOver = useCallback(async () => {
    const finalScore = gameRef.current.score;
    gameRef.current.phase = "gameover";

    setGameState((prev) => ({
      ...prev,
      phase: "gameover",
      score: finalScore,
      isLoadingHigh: true,
    }));

    if (actor) {
      try {
        await actor.submitScore(BigInt(Math.floor(finalScore)));
        const hs = await actor.getHighScore();
        setGameState((prev) => ({
          ...prev,
          highScore: Number(hs),
          isLoadingHigh: false,
        }));
      } catch {
        setGameState((prev) => ({ ...prev, isLoadingHigh: false }));
      }
    } else {
      setGameState((prev) => ({ ...prev, isLoadingHigh: false }));
    }
  }, [actor]);

  useEffect(() => {
    gameRef.current.onGameOver = handleGameOver;
  }, [handleGameOver]);

  const handlePlay = useCallback(() => {
    const g = gameRef.current;
    g.phase = "playing";
    g.speed = INITIAL_SPEED;
    g.score = 0;
    g.speedTimer = 0;
    g.speedLevel = 1;
    g.playerLane = 1;
    g.playerX = LANES[1];
    g.playerTilt = 0;
    g.keys.clear();
    g.lastLaneChange = 0;
    g.isColliding = false;

    g.npcs = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      lane: LANES[Math.floor(Math.random() * 3)],
      z: -20 - i * 10,
      color: NPC_COLORS[i % NPC_COLORS.length],
      bodyWidth: 0.85,
      bodyLength: 1.6,
    }));

    setDisplayScore(0);
    setDisplaySpeed(INITIAL_SPEED);
    setDisplayLevel(1);

    setGameState({
      phase: "playing",
      score: 0,
      speed: INITIAL_SPEED,
      speedLevel: 1,
      highScore: null,
      isLoadingHigh: false,
    });
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: "oklch(0.08 0.03 250)" }}
    >
      {/* Three.js canvas */}
      <div data-ocid="game.canvas_target" className="absolute inset-0">
        <Canvas
          shadows
          camera={{ position: [0, 12, 8], fov: 55 }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0, 0);
          }}
          style={{ background: "#0d0d18" }}
        >
          <GameScene gameRef={gameRef} />
        </Canvas>
      </div>

      {/* DOM Overlays */}
      {gameState.phase === "start" && <StartScreen onPlay={handlePlay} />}

      {gameState.phase === "playing" && (
        <HUD
          score={displayScore}
          speedLevel={displayLevel}
          speed={displaySpeed}
          gameRef={gameRef}
        />
      )}

      {gameState.phase === "gameover" && (
        <GameOverScreen
          score={gameState.score}
          highScore={gameState.highScore}
          isLoadingHigh={gameState.isLoadingHigh}
          onRestart={handlePlay}
        />
      )}

      {/* Footer */}
      <footer
        className="absolute bottom-0 left-0 right-0 flex justify-center pb-2 pointer-events-none"
        style={{ zIndex: 5 }}
      >
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-xs"
          style={{ color: "oklch(0.35 0.03 250)" }}
        >
          © {new Date().getFullYear()}. Built with ❤️ using caffeine.ai
        </a>
      </footer>
    </div>
  );
}
