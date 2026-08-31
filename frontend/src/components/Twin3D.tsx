import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

export interface TwinCell {
  id: string;
  x: number; // grid x
  z: number; // grid z
  label: string;
  value: number; // normalized 0-1
  risk: string;
  population?: number;
  name?: string;
}

function Cell({
  cell,
  colorBy,
  onSelect,
  selected,
}: {
  cell: TwinCell;
  colorBy: "value" | "risk";
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const height = 1.5 + cell.value * 12;

  const color = useRef(
    colorBy === "risk"
      ? colorForRisk(cell.risk)
      : new THREE.Color().setHSL(0.6 - cell.value * 0.5, 0.8, 0.5)
  );
  if (colorBy === "risk") color.current = colorForRisk(cell.risk);
  else color.current = new THREE.Color().setHSL(0.6 - cell.value * 0.5, 0.8, 0.5);

  // gentle floating animation
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = height / 2 + Math.sin(clock.elapsedTime + cell.x * 0.5 + cell.z) * 0.1;
    }
  });

  const isSelected = selected === cell.id;

  return (
    <group
      position={[cell.x, 0, cell.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(cell.id);
      }}
    >
      <mesh ref={ref} position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[0.9, height, 0.9]} />
        <meshStandardMaterial
          color={color.current}
          emissive={isSelected ? new THREE.Color("#fbbf24") : new THREE.Color("#000")}
          emissiveIntensity={isSelected ? 0.8 : 0}
          transparent
          opacity={0.92}
        />
      </mesh>
      {isSelected && (
        <Text
          position={[0, height + 0.6, 0]}
          fontSize={0.6}
          color="#ffffff"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {cell.label}
        </Text>
      )}
    </group>
  );
}

function colorForRisk(level: string): THREE.Color {
  if (level === "critical") return new THREE.Color("#ef4444");
  if (level === "high") return new THREE.Color("#f97316");
  if (level === "moderate") return new THREE.Color("#f59e0b");
  return new THREE.Color("#22c55e");
}

interface Twin3DProps {
  cells: TwinCell[];
  colorBy: "value" | "risk";
  onSelect: (cell: TwinCell) => void;
}

export default function Twin3D({ cells, colorBy, onSelect }: Twin3DProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="twin-canvas">
      <Canvas camera={{ position: [16, 14, 16], fov: 50 }} shadows>
        <ambientLight intensity={0.55} />
        <directionalLight position={[12, 18, 8]} intensity={1.1} castShadow />
        <pointLight position={[-8, 6, -8]} intensity={0.4} color="#60a5fa" />
        <OrbitControls
          enablePan
          enableZoom
          minDistance={4}
          maxDistance={60}
          target={[6, 2, 6]}
        />
        <gridHelper args={[20, 10, "#1e3a8a", "#16224a"]} />
        {cells.map((c) => (
          <Cell
            key={c.id}
            cell={c}
            colorBy={colorBy}
            onSelect={(id) => {
              setSelected(id);
              onSelect(cells.find((x) => x.id === id)!);
            }}
            selected={selected}
          />
        ))}
      </Canvas>
    </div>
  );
}
