import "server-only";

export {checkDatabaseHealth} from "./health";
export {readAtlasDataMode} from "./atlas/data-mode";
export {
  AtlasDataIntegrityError,
  buildAtlasFeatureCollection,
  loadAtlasTracts,
  MILWAUKEE_CANONICAL_TRACT_COUNT,
  MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE,
} from "./atlas/atlas-repository";
export type {AtlasRepositoryClient} from "./atlas/atlas-repository";
export {parseAtlasMultiPolygon, serializedGeoJsonBytes} from "./atlas/geometry";
export {
  buildNeighborhoodContext,
  loadNeighborhoodContext,
  NeighborhoodContextIntegrityError,
} from "./atlas/neighborhood-context";
export {
  AtlasProfileDataIntegrityError,
  buildAtlasTractProfile,
  loadAtlasTractProfile,
} from "./atlas/profile-repository";
export type {AtlasProfileRepositoryClient} from "./atlas/profile-repository";
export {selectAtlasRun} from "./atlas/run-selector";
export type {
  AtlasRunSelection,
  AtlasRunSelectionClient,
  SelectedAtlasRun,
  UnavailableAtlasRun,
} from "./atlas/run-selector";
