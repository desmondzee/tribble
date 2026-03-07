"use client";

import { useRef, useEffect, useState } from "react";
import * as THREE from "three";

function isLand(phi: number, theta: number): boolean {
  const lat = 90 - (phi * 180) / Math.PI;
  let lon = (theta * 180) / Math.PI - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  const landmasses: { lat: number; lon: number; r: number }[] = [
    { lat: 65, lon: -150, r: 12 },
    { lat: 60, lon: -110, r: 18 },
    { lat: 55, lon: -80, r: 18 },
    { lat: 40, lon: -115, r: 12 },
    { lat: 38, lon: -90, r: 12 },
    { lat: 20, lon: -100, r: 10 },
    { lat: 5, lon: -65, r: 14 },
    { lat: -15, lon: -55, r: 14 },
    { lat: -40, lon: -65, r: 10 },
    { lat: 50, lon: 10, r: 10 },
    { lat: 60, lon: 20, r: 10 },
    { lat: 42, lon: -5, r: 5 },
    { lat: 20, lon: 0, r: 12 },
    { lat: 20, lon: 30, r: 12 },
    { lat: 0, lon: 20, r: 15 },
    { lat: -20, lon: 20, r: 12 },
    { lat: 60, lon: 80, r: 20 },
    { lat: 60, lon: 120, r: 20 },
    { lat: 35, lon: 100, r: 18 },
    { lat: 25, lon: 80, r: 10 },
    { lat: 30, lon: 50, r: 12 },
    { lat: 15, lon: 100, r: 8 },
    { lat: -25, lon: 135, r: 15 },
    { lat: -40, lon: 175, r: 5 },
    { lat: -5, lon: 115, r: 5 },
    { lat: -5, lon: 145, r: 5 },
    { lat: 75, lon: -40, r: 10 },
    { lat: -80, lon: 0, r: 25 },
    { lat: -80, lon: 120, r: 25 },
    { lat: -80, lon: -120, r: 25 },
  ];
  const rad = Math.PI / 180;
  for (const land of landmasses) {
    const dLat = Math.abs(lat - land.lat);
    const dLon = Math.abs(lon - land.lon);
    const dist = Math.sqrt(dLat * dLat + (dLon * Math.cos(lat * rad)) ** 2);
    const noise = (Math.sin(lat * 0.5) + Math.cos(lon * 0.5)) * 2;
    if (dist < land.r + noise) return true;
  }
  return false;
}

export function GlobeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 5.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const radius = 2;
    const resolution = 60;

    // Land voxels
    const pos: number[] = [];
    const col: number[] = [];
    const colorLand = new THREE.Color("#2e7d32"); // Earth green
    const colorOcean = new THREE.Color("#1565c0"); // Deep ocean blue

    for (let i = 0; i < resolution; i++) {
      const phi = Math.acos(-1 + (2 * i) / resolution);
      const latCircumference = 2 * Math.PI * Math.sin(phi);
      const thetaCount = Math.max(1, Math.floor((latCircumference * resolution) / Math.PI));

      for (let j = 0; j < thetaCount; j++) {
        const theta = (2 * Math.PI * j) / thetaCount;
        const land = isLand(phi, theta);

        const x = radius * Math.sin(phi) * Math.sin(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.cos(theta);

        pos.push(x, y, z);
        if (land) {
          col.push(colorLand.r, colorLand.g, colorLand.b);
        } else if (Math.random() > 0.9) {
          col.push(colorOcean.r, colorOcean.g, colorOcean.b);
        } else {
          pos.pop();
          pos.pop();
          pos.pop();
        }
      }
    }

    const count = pos.length / 3;
    const boxGeo = new THREE.BoxGeometry(0.04, 0.04, 0.06);
    const instancedMesh = new THREE.InstancedMesh(
      boxGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      count
    );
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(col), 3);
    instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      instancedMesh.setColorAt(i, new THREE.Color(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor!.needsUpdate = true;
    scene.add(instancedMesh);

    // Inner sphere
    const sphereGeo = new THREE.SphereGeometry(1.9, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x0d47a1 }); // Deep ocean base
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Conflict hotspots
    const hotspotPos: number[] = [];
    const hotspots = [
      { lat: 15, lon: 32 },
      { lat: 13, lon: 25 },
      { lat: 50, lon: 30 },
      { lat: 33, lon: 36 },
      { lat: 31, lon: 35 },
    ];
    for (let i = 0; i < 30; i++) {
      const c = hotspots[i % hotspots.length];
      const lat = c.lat + (Math.random() - 0.5) * 20;
      const lon = c.lon + (Math.random() - 0.5) * 20;
      const phi = ((90 - lat) * Math.PI) / 180;
      const theta = ((lon + 180) * Math.PI) / 180;
      if (isLand(phi, theta)) {
        const r = radius + 0.1;
        hotspotPos.push(
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.cos(theta)
        );
      }
    }
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute("position", new THREE.Float32BufferAttribute(hotspotPos, 3));
    const pointsMat = new THREE.PointsMaterial({
      color: 0xff3300,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    scene.add(points);

    // Stars
    const starPos: number[] = [];
    for (let i = 0; i < 1500; i++) {
      starPos.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const group = new THREE.Group();
    group.add(instancedMesh);
    group.add(sphere);
    group.add(points);
    group.position.set(2.5, 0, 0);
    group.rotation.set(0, 0, 0.2);
    scene.add(group);

    let frameId: number;
    let lastTime = performance.now();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      group.rotation.y += delta * 0.05;
      const t = (typeof window !== "undefined" ? window.scrollY : 0) * 0.0015;
      const targetX = isMobile ? 0 : 2.5 + Math.sin(t) * 0.5;
      const targetY = isMobile ? 1.2 : Math.cos(t * 0.7) * 0.2;
      const targetZ = isMobile ? -1 : -Math.sin(t * 0.5) * 0.3;
      group.position.x += (targetX - group.position.x) * 0.05;
      group.position.y += (targetY - group.position.y) * 0.05;
      group.position.z += (targetZ - group.position.z) * 0.05;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
    };
  }, [isMobile]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{
        background: "radial-gradient(circle at center, hsl(228 45% 9%) 0%, #000 100%)",
        pointerEvents: "none",
      }}
    />
  );
}
