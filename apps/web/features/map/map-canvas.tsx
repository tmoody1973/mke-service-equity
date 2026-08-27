"use client";

import {AttributionControl, Map, NavigationControl} from "maplibre-gl";
import {useEffect, useRef} from "react";

type MapCanvasProps = {
  styleUrl: string;
};

export function MapCanvas({styleUrl}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const map = new Map({
      attributionControl: false,
      container,
      style: styleUrl,
    });

    map.addControl(new NavigationControl({showCompass: false}), "top-right");
    map.addControl(
      new AttributionControl({compact: false, customAttribution: "MapLibre GL JS"}),
      "bottom-right",
    );
    map.resize();

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      map.remove();
    };
  }, [styleUrl]);

  return <div className="absolute inset-0" data-map-container ref={containerRef} />;
}
