"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import * as d3Geo from "d3-geo";
import * as topojson from "topojson-client";

const WIDTH = 960;
const HEIGHT = 500;

export const WorldMapSVG = () => {
  const [worldData, setWorldData] = useState<GeoJSON.FeatureCollection | null>(
    null
  );

  useEffect(() => {
    fetch("/data/countries-110m.json")
      .then((res) => res.json())
      .then((topology: { objects: { countries?: unknown } }) => {
        const countries = topojson.feature(
          topology as Parameters<typeof topojson.feature>[0],
          topology.objects.countries as Parameters<typeof topojson.feature>[1]
        ) as unknown as GeoJSON.FeatureCollection;
        setWorldData(countries);
      })
      .catch(console.error);
  }, []);

  const projection = useMemo(
    () =>
      d3Geo.geoNaturalEarth1().fitSize([WIDTH, HEIGHT], {
        type: "Sphere",
      } as unknown as GeoJSON.Geometry),
    []
  );

  const pathGenerator = useMemo(
    () => d3Geo.geoPath(projection),
    [projection]
  );

  const graticule = useMemo(
    () =>
      d3Geo
        .geoGraticule()
        .stepMinor([10, 10])
        .extentMinor([
          [-180, -90],
          [180, 90],
        ])(),
    []
  );

  if (!worldData) return null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-6xl"
      fill="none"
    >
      <motion.path
        d={pathGenerator(graticule) || ""}
        stroke="hsl(var(--hip-accent))"
        strokeWidth={0.5}
        fill="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 2 }}
      />
      {worldData.features.map((feature, i) => {
        const d = pathGenerator(feature);
        if (!d) return null;
        return (
          <motion.path
            key={i}
            d={d}
            stroke="hsl(var(--hip-accent))"
            strokeWidth={0.5}
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.5 }}
            transition={{
              duration: 2.5,
              delay: 0.5 + (i % 20) * 0.1,
              ease: "easeInOut",
            }}
          />
        );
      })}
      <motion.path
        d={
          pathGenerator({
            type: "Sphere",
          } as unknown as GeoJSON.Geometry) || ""
        }
        stroke="hsl(var(--hip-accent))"
        strokeWidth={0.5}
        fill="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 1.5 }}
      />
    </svg>
  );
};
