"use client";

import type {AtlasTractFeatureCollection} from "@mke/contracts";
import {Button} from "@heroui/react";
import {
  AttributionControl,
  type GeoJSONSource,
  Map,
  type MapLayerMouseEvent,
  NavigationControl,
} from "maplibre-gl";
import {useCallback, useEffect, useRef} from "react";
import {resetMilwaukeeExtent} from "./map-camera";
import {addTractLayers, TRACT_FILL_LAYER_ID, TRACT_SOURCE_ID} from "./tract-layers";

type MapCanvasProps = {
  onSelectTract?: (geoid: string) => void;
  selectedTract?: string | null;
  styleUrl: string;
  tracts?: AtlasTractFeatureCollection | undefined;
};

const emptyTracts = {type: "FeatureCollection" as const, features: [] as []};

function featureGeoid(event: MapLayerMouseEvent): string | null {
  const feature = event.features?.[0];
  const candidate = feature?.id ?? feature?.properties?.geoid;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : null;
}

export function MapCanvas({
  onSelectTract,
  selectedTract = null,
  styleUrl,
  tracts,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const appliedSelectedTractRef = useRef<string | null>(null);
  const hoveredTractRef = useRef<string | null>(null);
  const selectedTractRef = useRef<string | null>(selectedTract);
  const tractsRef = useRef(tracts);
  const onSelectTractRef = useRef(onSelectTract);

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
    mapRef.current = map;

    map.addControl(new NavigationControl({showCompass: false}), "top-right");
    map.addControl(
      new AttributionControl({compact: false, customAttribution: "MapLibre GL JS"}),
      "bottom-right",
    );
    map.resize();

    const handlePointerMove = (event: MapLayerMouseEvent) => {
      const nextHoveredTract = featureGeoid(event);
      if (hoveredTractRef.current && hoveredTractRef.current !== nextHoveredTract) {
        map.setFeatureState(
          {source: TRACT_SOURCE_ID, id: hoveredTractRef.current},
          {hovered: false},
        );
      }
      if (nextHoveredTract) {
        map.setFeatureState(
          {source: TRACT_SOURCE_ID, id: nextHoveredTract},
          {hovered: true},
        );
      }
      hoveredTractRef.current = nextHoveredTract;
      map.getCanvas().style.cursor = nextHoveredTract ? "pointer" : "";
    };

    const handlePointerLeave = () => {
      if (hoveredTractRef.current) {
        map.setFeatureState(
          {source: TRACT_SOURCE_ID, id: hoveredTractRef.current},
          {hovered: false},
        );
      }
      hoveredTractRef.current = null;
      map.getCanvas().style.cursor = "";
    };

    const handleSelect = (event: MapLayerMouseEvent) => {
      const geoid = featureGeoid(event);
      if (geoid) {
        onSelectTractRef.current?.(geoid);
      }
    };

    const handleLoad = () => {
      addTractLayers(map, tractsRef.current ?? emptyTracts);
      map.on("mousemove", TRACT_FILL_LAYER_ID, handlePointerMove);
      map.on("mouseleave", TRACT_FILL_LAYER_ID, handlePointerLeave);
      map.on("click", TRACT_FILL_LAYER_ID, handleSelect);

      if (selectedTractRef.current) {
        map.setFeatureState(
          {source: TRACT_SOURCE_ID, id: selectedTractRef.current},
          {selected: true},
        );
        appliedSelectedTractRef.current = selectedTractRef.current;
      }
      if (tractsRef.current) {
        resetMilwaukeeExtent(
          map,
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        );
      }
    };

    map.on("load", handleLoad);

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      mapRef.current = null;
      map.remove();
    };
  }, [styleUrl]);

  useEffect(() => {
    tractsRef.current = tracts;
    const source = mapRef.current?.getSource(TRACT_SOURCE_ID) as GeoJSONSource | undefined;
    if (source && tracts) {
      source.setData(tracts as Parameters<GeoJSONSource["setData"]>[0]);
    }
  }, [tracts]);

  useEffect(() => {
    selectedTractRef.current = selectedTract;
    const map = mapRef.current;
    const previous = appliedSelectedTractRef.current;

    if (!map?.getSource(TRACT_SOURCE_ID)) {
      return;
    }
    if (previous && previous !== selectedTract) {
      map.setFeatureState({source: TRACT_SOURCE_ID, id: previous}, {selected: false});
    }
    if (selectedTract) {
      map.setFeatureState({source: TRACT_SOURCE_ID, id: selectedTract}, {selected: true});
    }
    appliedSelectedTractRef.current = selectedTract;
  }, [selectedTract]);

  useEffect(() => {
    onSelectTractRef.current = onSelectTract;
  }, [onSelectTract]);

  const handleReset = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      resetMilwaukeeExtent(
        map,
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      );
    }
  }, []);

  return (
    <>
      <div
        aria-label="Interactive map of Milwaukee County census tracts"
        className="absolute inset-0"
        data-map-container
        ref={containerRef}
      />
      {tracts ? (
        <Button
          className="absolute right-3 top-28 z-10 min-h-11 bg-background shadow-sm"
          onPress={handleReset}
          size="sm"
          variant="secondary"
        >
          Reset map
        </Button>
      ) : null}
    </>
  );
}
