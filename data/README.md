# Data boundary

Raw downloads, normalized extracts, generated reports, and other derived data
remain local and are ignored by Git. Pipelines use isolated namespaces:

- Equity Baseline: `data/{raw,manifests,reports}/equity-baseline/`
- Food Equity: `data/{raw,manifests,reports}/food-equity/`

Raw and report files must not be committed. A source with the same hash in both
pipelines remains isolated because its pipeline namespace is part of its storage
path.

Small source manifests may be committed beneath `data/manifests/`. A manifest
records provenance and integrity metadata only: source identity, source URL,
retrieval time, source vintage, content hash, byte size, and licensing notes. It
must never contain source records, credentials, or an API key.

The project's MIT License covers original project code and documentation. It
does not relicense Census TIGER/Line, American Community Survey, CDC PLACES,
USDA data, MCTS GTFS, OpenStreetMap/Geofabrik data, partner data, or any other
source dataset. Every source retains its own terms, which must be captured in
its manifest before normalized values can be published.

## Food Equity external validator

MCTS static GTFS is validated by the MobilityData canonical GTFS Validator CLI
JAR `v8.0.1` using Java 17 or newer. The approved JAR SHA-256 is
`19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2`.
Store the local JAR below ignored `.tools/` and set `MKE_GTFS_VALIDATOR_JAR` to
its path. The pipeline must verify the checksum before execution; `latest` is
not an approved version.

The Python walking-network dependencies are pinned to `osmium==4.3.1` and
`networkx==3.6.1`. Neither package may download or replace source network data
during calculation. The only approved v1 network source is the manifested,
immutable `wisconsin-260827.osm.pbf` artifact.
