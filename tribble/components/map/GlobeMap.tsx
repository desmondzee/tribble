"use client";

import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/uiSlice";
import { useLayerStore } from "@/store/layerSlice";
import { IncidentTooltip } from "@/components/map/IncidentTooltip";
import { PLACEHOLDER_EVENTS, PLACEHOLDER_DRONES } from "@/lib/placeholder-data";
import { ONTOLOGY_TO_LAYER } from "@/lib/icon-registry";
import type { HipEvent, Drone } from "@/types";
import type { Incident } from "@/types";

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

const ONTOLOGY_TO_INCIDENT_TYPE: Record<string, Incident["type"]> = {
  armed_conflict: "armed_conflict",
  airstrike: "armed_conflict",
  shelling: "armed_conflict",
  suspicious_activity: "armed_conflict",
  displacement_mass: "displacement",
  bridge_damaged: "infrastructure_damage",
  water_contamination: "infrastructure_damage",
  aid_obstruction: "aid_obstruction",
  food_distribution: "aid_obstruction",
  disease_outbreak: "disease_outbreak",
};

function hipEventToIncident(e: HipEvent): Incident {
  return {
    id: e.id,
    type: ONTOLOGY_TO_INCIDENT_TYPE[e.ontology_class] ?? "armed_conflict",
    severity: e.severity,
    lat: e.lat,
    lng: e.lng,
    location_name: e.location_name,
    timestamp: e.timestamp,
    description: e.description,
    verification_status:
      e.verification_status === "verified"
        ? "verified"
        : e.verification_status === "pending"
          ? "pending"
          : "unverified",
    verified_by: e.verified_by,
    assigned_ngo_ids: e.assigned_ngo_ids,
    risk_score: Math.round(e.confidence_score * 100),
    related_incident_ids: e.related_event_ids,
  };
}

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

export function GlobeMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIncident, setHoveredIncident] = useState<{
    incident: Incident;
    x: number;
    y: number;
  } | null>(null);
  const { setSelectedEventId, setRightPanelOpen, setRightPanelTab } = useUIStore();
  const visibility = useLayerStore((s) => s.visibility);

  const isEventLayerVisible = (ontologyClass: string) => {
    const layerId = ONTOLOGY_TO_LAYER[ontologyClass] as keyof typeof visibility | undefined;
    return layerId ? visibility[layerId] ?? true : true;
  };
  const dronesVisible = visibility.E1_drones ?? true;

  const visibleEvents = PLACEHOLDER_EVENTS.filter((e) => isEventLayerVisible(e.ontology_class));
  const visibleDrones = dronesVisible ? PLACEHOLDER_DRONES : [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const radius = 2;
    const resolution = 60;

    const pos: number[] = [];
    const col: number[] = [];
    const colorLand = new THREE.Color("#2e7d32");
    const colorOcean = new THREE.Color("#1565c0");

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

    const sphereGeo = new THREE.SphereGeometry(1.9, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x0d47a1 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);

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

    const group = new THREE.Group();
    group.add(instancedMesh);
    group.add(sphere);
    group.add(points);
    group.add(stars);
    scene.add(group);

    const hitTargets: InstanceType<typeof THREE.Mesh>[] = [];
    const hitTargetData: Array<{ type: "event"; incident: Incident } | { type: "drone"; drone: Drone }> = [];

    const visibleEvents = PLACEHOLDER_EVENTS.filter((e) =>
      isEventLayerVisible(e.ontology_class)
    );
    const visibleDrones = dronesVisible ? PLACEHOLDER_DRONES : [];

    const eventGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const eventMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
    for (const e of visibleEvents) {
      const mesh = new THREE.Mesh(eventGeo, eventMat.clone());
      mesh.position.copy(latLngToVector3(e.lat, e.lng, radius + 0.12));
      mesh.userData = { type: "event", event: e };
      hitTargets.push(mesh);
      hitTargetData.push({ type: "event", incident: hipEventToIncident(e) });
      group.add(mesh);
    }

    const droneGeo = new THREE.SphereGeometry(0.05, 10, 10);
    const droneMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    for (const d of visibleDrones) {
      const mesh = new THREE.Mesh(droneGeo, droneMat.clone());
      mesh.position.copy(latLngToVector3(d.position.lat, d.position.lng, radius + 0.12));
      mesh.userData = { type: "drone", drone: d };
      hitTargets.push(mesh);
      hitTargetData.push({ type: "drone", drone: d });
      group.add(mesh);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hitTargets);
      if (intersects.length > 0) {
        const idx = hitTargets.indexOf(intersects[0].object as InstanceType<typeof THREE.Mesh>);
        const data = hitTargetData[idx];
        if (data?.type === "event") {
          setHoveredIncident({
            incident: data.incident,
            x: e.clientX,
            y: e.clientY,
          });
        } else {
          setHoveredIncident(null);
        }
      } else {
        setHoveredIncident(null);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hitTargets);
      if (intersects.length > 0) {
        const idx = hitTargets.indexOf(intersects[0].object as InstanceType<typeof THREE.Mesh>);
        const data = hitTargetData[idx];
        if (data?.type === "event") {
          setSelectedEventId(data.incident.id);
          setRightPanelOpen(true);
          setRightPanelTab("agent");
        }
      }
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerdown", onPointerDown);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      group.rotation.y += 0.002;
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
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
    };
  }, [visibility, setSelectedEventId, setRightPanelOpen, setRightPanelTab]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        style={{
          background: "radial-gradient(circle at center, hsl(228 45% 9%) 0%, #000 100%)",
        }}
      />
      <AnimatePresence>
        {hoveredIncident && (
          <IncidentTooltip
            incident={hoveredIncident.incident}
            x={hoveredIncident.x}
            y={hoveredIncident.y}
          />
        )}
      </AnimatePresence>
    </>
  );
}
