"use client";

import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import * as topojson from "topojson-client";

/** Rasterize GeoJSON land to a 2D grid. Uses padded canvas for antimeridian-safe drawing (fixes northern Russia). */
function rasterizeLandToGrid(fc: GeoJSON.FeatureCollection, width: number, height: number): Uint8Array {
  const grid = new Uint8Array(width * height);
  const pad = width; // Padding each side so polygons crossing ±180° draw correctly
  const canvasW = width + 2 * pad;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return grid;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasW, height);
  ctx.fillStyle = "#fff";
  const toX = (lon: number) => pad + ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;
  const drawRing = (ring: number[][]) => {
    if (ring.length < 3) return;
    const [lon0, lat0] = ring[0];
    ctx.moveTo(toX(lon0), toY(lat0));
    for (let i = 1; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      ctx.lineTo(toX(lon), toY(lat));
    }
    ctx.closePath();
  };
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const g = f.geometry;
    if (g.type === "Polygon") {
      ctx.beginPath();
      for (const ring of g.coordinates as number[][][]) {
        drawRing(ring);
      }
      ctx.fill("evenodd");
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as number[][][][]) {
        ctx.beginPath();
        for (const ring of poly) {
          drawRing(ring);
        }
        ctx.fill("evenodd");
      }
    }
  }
  const imgData = ctx.getImageData(pad, 0, width, height);
  for (let i = 0; i < width * height; i++) {
    grid[i] = imgData.data[i * 4] > 128 ? 1 : 0;
  }
  removeIsolatedHorizontalLines(grid, width, height);
  return grid;
}

/**
 * Remove horizontal "stitch line" artifacts from TopoJSON (e.g. Natural Earth cut at a latitude).
 * Any row that has land but has no land in the row above or below is treated as artifact and cleared.
 */
function removeIsolatedHorizontalLines(grid: Uint8Array, width: number, height: number): void {
  const landCount = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) n += grid[y * width + x];
    return n;
  };
  for (let y = 1; y < height - 1; y++) {
    const above = landCount(y - 1);
    const curr = landCount(y);
    const below = landCount(y + 1);
    if (curr > 0 && above === 0 && below === 0) {
      for (let x = 0; x < width; x++) grid[y * width + x] = 0;
    }
  }
}

/** Sample raster at lon [-180,180], lat [-90,90]. Returns 1 if land. */
function sampleRaster(grid: Uint8Array, width: number, height: number, lon: number, lat: number): number {
  const x = Math.floor(((lon + 180) / 360) * width) % width;
  const y = Math.max(0, Math.min(height - 1, Math.floor(((90 - lat) / 180) * height)));
  return grid[y * width + (x < 0 ? x + width : x)] ?? 0;
}

export function EarthAnimation({ scrollY = 0 }: { scrollY?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef(scrollY);

  useEffect(() => {
    scrollRef.current = scrollY;
  }, [scrollY]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanupFn: (() => void) | null = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 5.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const sphereRadius = 1.85;
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 48, 48);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x1e40af });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.rotation.y = Math.PI / 24; // Offset seam

    const group = new THREE.Group();
    group.add(sphere);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0.2);
    scene.add(group);

    // Background: many small light blocks (no galaxy glow)
    const STAR_SIZE_MAX = 0.56; // Cap size so stars stay below threshold (2x for visibility)
    const starPos: number[] = [];
    const starColors: number[] = [];
    for (let i = 0; i < 1200; i++) {
      starPos.push(
        (Math.random() - 0.5) * 240,
        (Math.random() - 0.5) * 240,
        (Math.random() - 0.5) * 240
      );
      const r = Math.random();
      if (r < 0.5) starColors.push(0.55, 0.62, 0.52); // grey-green
      else if (r < 0.8) starColors.push(0.5, 0.58, 0.48); // darker grey-green
      else starColors.push(0.6, 0.66, 0.56); // lighter grey-green
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: STAR_SIZE_MAX,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
      })
    );
    scene.add(stars);

    let flyInStartTime: number | null = null;
    let frameId: number;
    let lastTime = performance.now();
    const flyInDuration = 2.2; // Slower to match orbit pace
    const flyInStartScale = 0.08;
    const orbitRadiusX = 1.35;
    const orbitRadiusY = 1.25;
    const depthRange = 1.0;
    const orbitSpeed = 0.0001;
    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (flyInStartTime === null) flyInStartTime = now;
      const flyInElapsed = (now - flyInStartTime) / 1000;
      const flyInT = Math.min(1, flyInElapsed / flyInDuration);
      const flyInEased = easeOutCubic(flyInT);

      // Single continuous motion: fly-in lands directly on orbit path, then orbits
      const angle = now * orbitSpeed; // Always use live angle for continuity
      const orbitX = orbitRadiusX * Math.cos(angle);
      const orbitY = orbitRadiusY * Math.sin(angle);
      const orbitZ = -depthRange * Math.sin(angle);
      const zNorm = (orbitZ + depthRange) / (2 * depthRange);
      const depthScale = 0.5 + 0.5 * zNorm; // Min 0.5 (2.5x old min) — globe stays larger when "far"

      if (flyInT < 1) {
        // Fly-in: approach from right, land on orbit position (no transition)
        const landAngle = (flyInStartTime! + flyInDuration * 1000) * orbitSpeed;
        const landX = orbitRadiusX * Math.cos(landAngle);
        const landY = orbitRadiusY * Math.sin(landAngle);
        const landZ = -depthRange * Math.sin(landAngle);
        const landZNorm = (landZ + depthRange) / (2 * depthRange);
        const landScale = 0.5 + 0.5 * landZNorm;
        group.position.x = 5 + (landX - 5) * flyInEased;
        group.position.y = landY * flyInEased;
        group.position.z = landZ * flyInEased;
        group.scale.setScalar(flyInStartScale + (landScale - flyInStartScale) * flyInEased);
      } else {
        // On orbit — same formula, continuous motion
        group.position.x = orbitX;
        group.position.y = orbitY;
        group.position.z = orbitZ;
        group.scale.setScalar(depthScale);
      }
      group.rotation.y += delta * 0.06;
      // Parallax: globe moves with scroll but slower — bottom slowly reveals; tilt responds to scroll
      const parallaxFactor = 0.0008; // Slightly slower than 1:1 scroll
      const scrollOffset = scrollRef.current * parallaxFactor;
      const initialYOffset = 0.5; // Start globe higher so bottom is truncated; scroll reveals it
      group.position.y = group.position.y + initialYOffset - scrollOffset;
      stars.position.y = scrollOffset; // Stars move opposite to create depth
      group.rotation.z = 0.2 + scrollRef.current * 0.0003; // Tilt increases with scroll

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

    // Fetch countries and build voxels with real land data (deferred so sphere flies in first)
    fetch("/data/countries-110m.json")
      .then((res) => res.json())
      .then((topology: { objects: { countries?: unknown } }) => {
        if (cancelled) return;
        const landOrCountries = topology.objects.land ?? topology.objects.countries;
        const countries = topojson.feature(
          topology as Parameters<typeof topojson.feature>[0],
          landOrCountries as Parameters<typeof topojson.feature>[1]
        ) as unknown as GeoJSON.FeatureCollection;

        // Raster approach: draw land to 2D grid, sample it. Avoids polygon-edge alignment (Arctic/equator rings).
        const rasterW = 720;
        const rasterH = 360;
        const landGrid = rasterizeLandToGrid(countries, rasterW, rasterH);

        // Voxels sit directly on sphere surface — inner face flush, no gap
        const boxHalfDepth = 0.009; // half of 0.018
        const voxelRadius = sphereRadius + boxHalfDepth;
        const pos: number[] = [];
        const latBands = 180;
        const lonBands = 360;

        for (let i = 0; i < latBands; i++) {
          const lat = 90 - (180 * (i + 0.5)) / latBands;
          for (let j = 0; j < lonBands; j++) {
            const lon = -180 + (360 * (j + 0.5)) / lonBands;
            if (sampleRaster(landGrid, rasterW, rasterH, lon, lat) === 0) continue;

            const phi = ((90 - lat) * Math.PI) / 180;
            const theta = ((lon + 180) * Math.PI) / 180;
            const x = voxelRadius * Math.sin(phi) * Math.sin(theta);
            const y = voxelRadius * Math.cos(phi);
            const z = voxelRadius * Math.sin(phi) * Math.cos(theta);
            pos.push(x, y, z);
          }
        }

        const count = pos.length / 3;
        if (count === 0) return;
        const boxGeo = new THREE.BoxGeometry(0.018, 0.018, 0.018);
        const instancedMesh = new THREE.InstancedMesh(
          boxGeo,
          new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false }),
          count
        );
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
          dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          dummy.lookAt(0, 0, 0);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);
      })
      .catch(console.error);

    cleanupFn = () => {
      cancelAnimationFrame(frameId);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
    };

    return () => {
      cancelled = true;
      cleanupFn?.();
    };
  }, [isMobile]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: "none",
        background: "radial-gradient(circle at center, #1a1a2e 0%, #0d0d14 50%, #000 100%)",
      }}
    />
  );
}
