'use client';
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, Trail } from '@react-three/drei';
import * as THREE from 'three';

function TradingOrb() {
  const meshRef = useRef();
  const ringRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.1;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.3;
      ringRef.current.rotation.x = Math.cos(t * 0.2) * 0.3;
    }
  });

  return (
    <group>
      {/* Central Orb */}
      <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.8}>
        <Sphere ref={meshRef} args={[1.8, 64, 64]}>
          <MeshDistortMaterial
            color="#00f2ff"
            roughness={0.1}
            metalness={0.9}
            distort={0.25}
            speed={2}
            envMapIntensity={1}
          />
        </Sphere>
      </Float>

      {/* Orbiting Ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[2.8, 0.02, 16, 100]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.6} />
      </mesh>

      {/* Second Ring */}
      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[3.2, 0.015, 16, 100]} />
        <meshBasicMaterial color="#ff0f42" transparent opacity={0.35} />
      </mesh>

      {/* Data Particles */}
      <DataParticles />
    </group>
  );
}

function DataParticles() {
  const pointsRef = useRef();
  const count = 500;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3.5 + Math.random() * 2;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.getElapsedTime() * 0.05;
      pointsRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.03) * 0.1;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color="#00f2ff"
        transparent
        opacity={0.5}
        sizeAttenuation
      />
    </points>
  );
}

export default function HeroScene() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
        <pointLight position={[-5, -3, 3]} intensity={0.8} color="#00f2ff" />
        <pointLight position={[3, -5, -3]} intensity={0.5} color="#00ff88" />
        <TradingOrb />
      </Canvas>
    </div>
  );
}
