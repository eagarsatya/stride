"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

export function RouteMap({
  activityId,
  line,
  bounds,
}: {
  /** Stable identity for the route, so the map is not rebuilt on every render. */
  activityId: string;
  line: [number, number][];
  bounds: [[number, number], [number, number]] | null;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element || line.length < 2 || !bounds) return;

    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    // Imported inside the effect so MapLibre is never evaluated during SSR and
    // is only downloaded for activities that actually have GPS.
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;

      const instance = new maplibregl.Map({
        container: element,
        style: DEFAULT_STYLE,
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true },
        // The route is the content; panning around is not the point.
        dragRotate: false,
        pitchWithRotate: false,
      });
      map = instance;

      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      instance.on("load", () => {
        instance.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: line },
          },
        });

        // A dark casing under the route keeps it legible over any basemap.
        instance.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#0b1f16", "line-width": 6, "line-opacity": 0.5 },
        });

        instance.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#10b981", "line-width": 3.5 },
        });

        new maplibregl.Marker({ color: "#10b981" }).setLngLat(line[0]).addTo(instance);
        new maplibregl.Marker({ color: "#ef4444" })
          .setLngLat(line[line.length - 1])
          .addTo(instance);
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on activityId; line/bounds are derived from it and are new arrays each render
  }, [activityId]);

  if (line.length < 2 || !bounds) return null;

  return <div ref={container} className="bg-muted h-72 w-full overflow-hidden rounded-lg" />;
}
