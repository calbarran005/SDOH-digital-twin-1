import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { RotateCw, Maximize2, Tag, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../store/theme";

export interface TwinCell {
  id: string;
  x: number;
  z: number;
  label: string;
  value: number; // 0-1
  risk: string;
  population?: number;
  name?: string;
}

function colorForRisk(level: string): THREE.Color {
  if (level === "critical") return new THREE.Color("#ef4444");
  if (level === "high") return new THREE.Color("#f97316");
  if (level === "moderate") return new THREE.Color("#f59e0b");
  return new THREE.Color("#10b981");
}

function Cell({
  cell,
  colorBy,
  onSelect,
  selected,
  showLabels,
  isWireframe,
  isLight,
}: {
  cell: TwinCell;
  colorBy: "value" | "risk";
  onSelect: (id: string) => void;
  selected: string | null;
  showLabels: boolean;
  isWireframe: boolean;
  isLight: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const height = Math.max(0.8, 1.2 + cell.value * 10);
  const isSelected = selected === cell.id;

  const baseColor = useMemo(() => {
    if (colorBy === "risk") return colorForRisk(cell.risk);
    // Cyan to purple/magenta gradient for index
    return new THREE.Color().setHSL(0.58 - cell.value * 0.45, 0.85, isLight ? 0.48 : 0.52);
  }, [colorBy, cell.risk, cell.value, isLight]);

  // Subtle floating micro-animation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const floatOffset = Math.sin(clock.elapsedTime * 1.5 + cell.x * 0.3 + cell.z * 0.4) * 0.08;
      meshRef.current.position.y = height / 2 + floatOffset;
    }
  });

  return (
    <group
      position={[cell.x, 0, cell.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(cell.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <mesh ref={meshRef} position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, height, 0.95]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={isLight ? 0.2 : 0.25}
          metalness={isLight ? 0.2 : 0.35}
          wireframe={isWireframe}
          emissive={
            isSelected
              ? (isLight ? new THREE.Color("#3b82f6") : new THREE.Color("#60a5fa"))
              : hovered
              ? (isLight ? new THREE.Color("#60a5fa") : new THREE.Color("#ffffff"))
              : new THREE.Color("#000000")
          }
          emissiveIntensity={isSelected ? (isLight ? 0.5 : 0.75) : hovered ? 0.35 : 0}
          transparent
          opacity={isWireframe ? 0.85 : 0.95}
        />
      </mesh>

      {/* Selection / Hover Accent Ring on the ground */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 32]} />
          <meshBasicMaterial
            color={isSelected ? (isLight ? "#2563eb" : "#3b82f6") : (isLight ? "#3b82f6" : "#60a5fa")}
            side={THREE.DoubleSide}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}

      {/* Floating 3D Label */}
      {(showLabels || isSelected || hovered) && (
        <Text
          position={[0, height + 0.7, 0]}
          fontSize={0.5}
          color={isSelected ? (isLight ? "#2563eb" : "#60a5fa") : (isLight ? "#0f172a" : "#ffffff")}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor={isLight ? "#f8fafc" : "#070c18"}
        >
          {cell.label}
        </Text>
      )}
    </group>
  );
}

// Centered Ground and Cyber Base with theme awareness
function CyberBase({ size = 28, isLight }: { size?: number; isLight: boolean }) {
  return (
    <group position={[0, -0.02, 0]}>
      {/* Centered Grids */}
      <gridHelper
        args={[size, 20, isLight ? "#3b82f6" : "#3b82f6", isLight ? "#cbd5e1" : "#172554"]}
        position={[0, 0, 0]}
      />

      {/* Concentric Decorative Rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[size * 0.45, size * 0.455, 64]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={isLight ? 0.4 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[size * 0.65, size * 0.655, 64]} />
        <meshBasicMaterial
          color="#6366f1"
          transparent
          opacity={isLight ? 0.3 : 0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floor disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[size * 0.75, 64]} />
        <meshStandardMaterial
          color={isLight ? "#f8fafc" : "#070d1a"}
          roughness={isLight ? 0.7 : 0.6}
          metalness={isLight ? 0.1 : 0.8}
        />
      </mesh>
    </group>
  );
}

function CameraHandler({ resetKey }: { resetKey: number }) {
  const { camera } = useThree();
  const prevKey = useRef(resetKey);

  useFrame(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      camera.position.set(18, 16, 18);
      camera.lookAt(0, 2, 0);
    }
  });

  return null;
}

interface Twin3DProps {
  cells: TwinCell[];
  colorBy: "value" | "risk";
  onSelect: (cell: TwinCell) => void;
}

export default function Twin3D({ cells, colorBy, onSelect }: Twin3DProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { t } = useTranslation();

  const [selected, setSelected] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Compute bounding box center to guarantee mathematical centering at (0, 0, 0)
  const { centerOffset, baseSize } = useMemo(() => {
    if (!cells.length) return { centerOffset: [0, 0], baseSize: 24 };

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    cells.forEach((c) => {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
    });

    const cX = (minX + maxX) / 2;
    const cZ = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ);

    return {
      centerOffset: [cX, cZ],
      baseSize: Math.max(24, span + 8),
    };
  }, [cells]);

  return (
    <div className="twin-canvas-wrapper">
      {/* Floating HUD Top Overlay */}
      <div className="twin-hud-overlay">
        <div className="twin-hud-badge">
          <div className="status-dot" />
          <span>
            {colorBy === "risk" ? t("dashboard.coloredByRisk") : t("dashboard.coloredByEquity")}
          </span>
          <span style={{ color: "var(--text-dim)", marginLeft: 4 }}>
            ({cells.length} {t("dashboard.tractsLoaded")})
          </span>
        </div>

        <div className="twin-controls-toolbar">
          <button
            type="button"
            className={`btn btn-sm ${autoRotate ? "" : "secondary"}`}
            title={t("dashboard.toggleRotation")}
            onClick={() => setAutoRotate((r) => !r)}
          >
            <RotateCw size={14} className={autoRotate ? "spin-icon" : ""} />
            <span>{autoRotate ? t("dashboard.pause") : t("dashboard.rotate")}</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${showLabels ? "" : "secondary"}`}
            title={t("dashboard.toggleLabels")}
            onClick={() => setShowLabels((l) => !l)}
          >
            <Tag size={14} />
            <span>{t("dashboard.labels")}</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${isWireframe ? "" : "secondary"}`}
            title={t("dashboard.wireframe")}
            onClick={() => setIsWireframe((w) => !w)}
          >
            <Layers size={14} />
          </button>
          <button
            type="button"
            className="btn btn-sm secondary"
            title={t("dashboard.centerCamera")}
            onClick={() => setResetKey((k) => k + 1)}
          >
            <Maximize2 size={14} />
            <span>{t("dashboard.center")}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Legend Bottom Overlay */}
      <div className="twin-legend-overlay">
        {colorBy === "risk" ? (
          <>
            <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 2 }}>
              {t("dashboard.sdohRiskScale")}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                {t("common.low")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                {t("common.moderate")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                {t("common.high")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                {t("common.critical")}
              </span>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 2 }}>
              {t("dashboard.vulnerabilityIndex")}
            </div>
            <div
              className="legend-scale-bar"
              style={{
                background: "linear-gradient(90deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
              <span>0.0 ({t("dashboard.favorable")})</span>
              <span>1.0 ({t("dashboard.vulnerable")})</span>
            </div>
          </>
        )}
      </div>

      {/* 3D Canvas */}
      <Canvas
        className="twin-canvas"
        camera={{ position: [18, 16, 18], fov: 45 }}
        shadows
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[isLight ? "#f1f5f9" : "#060a14"]} />
        <fog
          attach="fog"
          args={[isLight ? "#f1f5f9" : "#060a14", isLight ? 35 : 30, isLight ? 85 : 75]}
        />

        <ambientLight intensity={isLight ? 0.85 : 0.65} />
        <directionalLight
          position={[15, 25, 12]}
          intensity={isLight ? 1.35 : 1.25}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight
          position={[-12, 10, -12]}
          intensity={isLight ? 0.35 : 0.6}
          color={isLight ? "#3b82f6" : "#60a5fa"}
        />
        <pointLight position={[12, 8, -10]} intensity={isLight ? 0.25 : 0.4} color="#818cf8" />

        <OrbitControls
          enablePan
          enableZoom
          enableDamping
          dampingFactor={0.06}
          minDistance={6}
          maxDistance={70}
          target={[0, 2, 0]}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />

        <CameraHandler resetKey={resetKey} />
        <CyberBase size={baseSize} isLight={isLight} />

        {/* Group offset by -centerOffset to guarantee perfect origin centering (0, 0, 0) */}
        <group position={[-centerOffset[0], 0, -centerOffset[1]]}>
          {cells.map((c) => (
            <Cell
              key={c.id}
              cell={c}
              colorBy={colorBy}
              onSelect={(id) => {
                setSelected(id);
                const found = cells.find((x) => x.id === id);
                if (found) onSelect(found);
              }}
              selected={selected}
              showLabels={showLabels}
              isWireframe={isWireframe}
              isLight={isLight}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
