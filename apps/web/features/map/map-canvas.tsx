"use client";

import type {
  AtlasFoodSiteFeatureCollection,
  AtlasTractFeatureCollection,
} from "@mke/contracts";
import {Button} from "@heroui/react";
import {
  AttributionControl,
  type GeoJSONSource,
  Map,
  type MapLayerMouseEvent,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import {useCallback, useEffect, useRef, useState} from "react";
import {resetMilwaukeeExtent} from "./map-camera";
import {
  addFoodSiteLayers,
  FOOD_SITE_LAYER_ID,
  FOOD_SITE_SOURCE_ID,
  setFoodSiteLayerVisibility,
} from "./food-site-layers";
import {
  addTractLayers,
  applyTractPriorityFilter,
  TRACT_FILL_LAYER_ID,
  TRACT_SOURCE_ID,
} from "./tract-layers";

type MapCanvasProps = {
  onSelectTract?: (geoid: string) => void;
  priorities?: Array<number>;
  selectedTract?: string | null;
  styleUrl: string;
  tracts?: AtlasTractFeatureCollection | undefined;
  foodSites?: AtlasFoodSiteFeatureCollection | undefined;
  onSelectFoodSite?: (siteId: string) => void;
  selectedFoodSite?: string | null;
  showFoodSites?: boolean;
};

const emptyTracts = {type: "FeatureCollection" as const, features: [] as []};

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

function featureGeoid(event: MapLayerMouseEvent): string | null {
  const feature = event.features?.[0];
  const candidate = feature?.id ?? feature?.properties?.geoid;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : null;
}

export function MapCanvas({
  onSelectTract,
  onSelectFoodSite,
  priorities = [],
  foodSites,
  selectedFoodSite = null,
  selectedTract = null,
  showFoodSites = false,
  styleUrl,
  tracts,
}: MapCanvasProps) {
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const appliedSelectedTractRef = useRef<string | null>(null);
  const hoveredTractRef = useRef<string | null>(null);
  const selectedTractRef = useRef<string | null>(selectedTract);
  const appliedSelectedFoodSiteRef = useRef<string | null>(null);
  const selectedFoodSiteRef = useRef<string | null>(selectedFoodSite);
  const tractsRef = useRef(tracts);
  const onSelectTractRef = useRef(onSelectTract);
  const prioritiesRef = useRef(priorities);
  const foodSitesRef = useRef(foodSites);
  const onSelectFoodSiteRef = useRef(onSelectFoodSite);
  const showFoodSitesRef = useRef(showFoodSites);

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
      new AttributionControl({
        compact: false,
        customAttribution: foodSitesRef.current
          ? '<a href="https://experience.arcgis.com/experience/4883a0957d124294aa236d9e9cc696a5" target="_blank" rel="noopener noreferrer">Food sites: Data You Can Use + partners</a> · MapLibre GL JS'
          : "MapLibre GL JS",
      }),
      "bottom-right",
    );
    map.on("error", (event) => {
      console.error("Atlas MapLibre error", event.error);
      setMapStatus("error");
    });
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
      if (
        showFoodSitesRef.current
        && map.getLayer(FOOD_SITE_LAYER_ID)
        && map.queryRenderedFeatures(event.point, {layers: [FOOD_SITE_LAYER_ID]}).length > 0
      ) {
        return;
      }
      const geoid = featureGeoid(event);
      if (geoid) {
        onSelectTractRef.current?.(geoid);
      }
    };

    const handleSelectFoodSite = (event: MapLayerMouseEvent) => {
      const siteId = featureGeoid(event);
      if (siteId) {
        onSelectFoodSiteRef.current?.(siteId);
      }
    };

    const handleFoodSitePointerEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleFoodSitePointerLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleLoad = () => {
      try {
        addTractLayers(map, tractsRef.current ?? emptyTracts);
        if (foodSitesRef.current) {
          addFoodSiteLayers(map, foodSitesRef.current, showFoodSitesRef.current);
          map.on("mouseenter", FOOD_SITE_LAYER_ID, handleFoodSitePointerEnter);
          map.on("mouseleave", FOOD_SITE_LAYER_ID, handleFoodSitePointerLeave);
          map.on("click", FOOD_SITE_LAYER_ID, handleSelectFoodSite);
          if (selectedFoodSiteRef.current) {
            map.setFeatureState(
              {source: FOOD_SITE_SOURCE_ID, id: selectedFoodSiteRef.current},
              {selected: true},
            );
            appliedSelectedFoodSiteRef.current = selectedFoodSiteRef.current;
          }
        }
        applyTractPriorityFilter(map, prioritiesRef.current);
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
        map.once("idle", () => setMapStatus("ready"));
      } catch (error) {
        console.error("Atlas map layer setup failed", error);
        setMapStatus("error");
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
    foodSitesRef.current = foodSites;
    const source = mapRef.current?.getSource(FOOD_SITE_SOURCE_ID) as GeoJSONSource | undefined;
    if (source && foodSites) {
      source.setData(foodSites as Parameters<GeoJSONSource["setData"]>[0]);
    }
  }, [foodSites]);

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
    selectedFoodSiteRef.current = selectedFoodSite;
    const map = mapRef.current;
    const previous = appliedSelectedFoodSiteRef.current;

    if (!map?.getSource(FOOD_SITE_SOURCE_ID)) {
      return;
    }
    if (previous && previous !== selectedFoodSite) {
      map.setFeatureState({source: FOOD_SITE_SOURCE_ID, id: previous}, {selected: false});
    }
    if (selectedFoodSite) {
      map.setFeatureState(
        {source: FOOD_SITE_SOURCE_ID, id: selectedFoodSite},
        {selected: true},
      );
    }
    appliedSelectedFoodSiteRef.current = selectedFoodSite;
  }, [selectedFoodSite]);

  useEffect(() => {
    onSelectTractRef.current = onSelectTract;
  }, [onSelectTract]);

  useEffect(() => {
    onSelectFoodSiteRef.current = onSelectFoodSite;
  }, [onSelectFoodSite]);

  useEffect(() => {
    prioritiesRef.current = priorities;
    const map = mapRef.current;
    if (map?.getSource(TRACT_SOURCE_ID)) {
      applyTractPriorityFilter(map, priorities);
    }
  }, [priorities]);

  useEffect(() => {
    showFoodSitesRef.current = showFoodSites;
    const map = mapRef.current;
    if (map?.getLayer(FOOD_SITE_LAYER_ID)) {
      setFoodSiteLayerVisibility(map, showFoodSites);
    }
  }, [showFoodSites]);

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
        data-food-site-count={foodSites?.features.length ?? 0}
        data-food-sites-visible={showFoodSites ? "true" : "false"}
        data-map-container
        data-map-status={mapStatus}
        ref={containerRef}
      />
      {mapStatus === "error" ? (
        <p
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-divider bg-background px-4 py-3 text-sm"
          role="alert"
        >
          The map couldn’t load. Select Browse census tracts to continue.
        </p>
      ) : null}
      {mapStatus === "loading" ? (
        <p
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-divider bg-background px-4 py-3 text-sm text-muted shadow-sm"
          role="status"
        >
          Loading tract map…
        </p>
      ) : null}
      {tracts && mapStatus === "ready" ? (
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
