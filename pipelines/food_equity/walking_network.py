"""Deterministic pedestrian graph construction for Food Equity v1."""

from __future__ import annotations

import hashlib
import heapq
import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from decimal import Context, Decimal, ROUND_HALF_EVEN
from pathlib import Path
from types import MappingProxyType

import networkx as nx  # type: ignore[import-untyped]
import osmium
from pyproj import Transformer

from pipelines.common.artifacts import canonical_json_bytes
from pipelines.food_equity.errors import SourceValidationError

GEOFABRIK_NETWORK_ARTIFACT = "wisconsin-260827.osm.pbf"
GEOFABRIK_NETWORK_URL = "https://download.geofabrik.de/north-america/us/wisconsin-260827.osm.pbf"
GEOFABRIK_NETWORK_BYTE_SIZE = 292_160_666
GEOFABRIK_NETWORK_MD5 = "87c18ce0608499afd91ed0f2a5ee8eef"
GEOFABRIK_NETWORK_SHA256 = "3e4a59bae5e7eb0f6f175a8645b3b2be16c276a5082f3732566d4e3aeaee6842"
PROJECTED_CRS = "EPSG:3071"
MAX_SNAP_DISTANCE_M = Decimal("200")
GRAPH_VERSION = "walking-network-v1"
APPROVED_GRAPH_NODE_COUNT = 623_268
APPROVED_GRAPH_DIRECTED_EDGE_COUNT = 1_557_006
APPROVED_GRAPH_SHA256 = "a7e4bf2230e4b38cc5126d45c16f96270814bfd48caa15f698c81d5d580e17fa"

_EXCLUDED_HIGHWAYS = frozenset(
    {"abandoned", "construction", "motorway", "motorway_link", "proposed", "raceway"}
)
_DENIED = frozenset({"no", "private"})
_FOOT_OVERRIDES = frozenset({"yes", "designated", "permissive"})
_FORWARD = "f"
_REVERSE = "r"
_TRANSFORMER = Transformer.from_crs("EPSG:4326", PROJECTED_CRS, always_xy=True)
_ROUTING_CONTEXT = Context(prec=50, rounding=ROUND_HALF_EVEN)

ClipContains = Callable[[Decimal, Decimal], bool]


class WalkingNetworkError(SourceValidationError):
    """Raised when a walking source or normalized graph violates its contract."""


@dataclass(frozen=True, slots=True)
class NetworkNode:
    node_id: int
    x: Decimal
    y: Decimal


@dataclass(frozen=True, slots=True)
class NetworkEdge:
    edge_id: str
    osm_way_id: int
    source_node_id: int
    target_node_id: int
    length_m: Decimal


@dataclass(frozen=True, slots=True)
class WalkingGraph:
    nodes: tuple[NetworkNode, ...]
    edges: tuple[NetworkEdge, ...]
    source_sha256: str
    graph_sha256: str
    routing: nx.MultiDiGraph = field(compare=False, repr=False, hash=False)
    spatial_index: Mapping[tuple[int, int], tuple[NetworkNode, ...]] = field(
        compare=False, repr=False, hash=False
    )
    crs: str = PROJECTED_CRS
    version: str = GRAPH_VERSION
    approved_for_scoring: bool = False


@dataclass(frozen=True, slots=True)
class SnapResult:
    node_id: int
    distance_m: Decimal


@dataclass(frozen=True, slots=True)
class PathResult:
    distance_m: Decimal
    node_ids: tuple[int, ...]
    edge_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class NetworkSnapshot:
    path: Path
    byte_size: int
    md5: str
    sha256: str


def pedestrian_way_allowed(tags: Mapping[str, str]) -> bool:
    """Return whether an OSM way is legally encoded for pedestrian use."""

    highway = tags.get("highway", "").strip().lower()
    if not highway or highway in _EXCLUDED_HIGHWAYS:
        return False
    if tags.get("area", "").strip().lower() == "yes":
        return False
    foot = tags.get("foot", "").strip().lower()
    if foot in _DENIED:
        return False
    access = tags.get("access", "").strip().lower()
    return access not in _DENIED or foot in _FOOT_OVERRIDES


def pedestrian_directions(tags: Mapping[str, str]) -> tuple[str, ...]:
    """Resolve only explicit pedestrian direction tags; vehicle oneway is ignored."""

    foot_oneway = tags.get("oneway:foot", "").strip().lower()
    if foot_oneway == "yes":
        forward, reverse = True, False
    elif foot_oneway == "-1":
        forward, reverse = False, True
    else:
        forward, reverse = True, True

    forward_tag = tags.get("foot:forward", "").strip().lower()
    reverse_tag = tags.get("foot:backward", "").strip().lower()
    if forward_tag in _DENIED:
        forward = False
    elif forward_tag in _FOOT_OVERRIDES:
        forward = True
    if reverse_tag in _DENIED:
        reverse = False
    elif reverse_tag in _FOOT_OVERRIDES:
        reverse = True

    directions: list[str] = []
    if forward:
        directions.append(_FORWARD)
    if reverse:
        directions.append(_REVERSE)
    return tuple(directions)


def _decimal(value: object, *, label: str) -> Decimal:
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except Exception as error:
        raise WalkingNetworkError(f"{label} must be numeric") from error
    if not parsed.is_finite():
        raise WalkingNetworkError(f"{label} must be finite")
    return parsed


def _decimal_string(value: Decimal) -> str:
    """Serialize equal Decimal values identically without rounding precision."""

    rendered = format(value, "f")
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    return "0" if value == 0 else rendered


def _distance_add(left: Decimal, right: Decimal) -> Decimal:
    return _ROUTING_CONTEXT.add(left, right)


def _distance_subtract(left: Decimal, right: Decimal) -> Decimal:
    return _ROUTING_CONTEXT.subtract(left, right)


def _distance_divide(left: Decimal, right: Decimal) -> Decimal:
    return _ROUTING_CONTEXT.divide(left, right)


def _graph_hash(
    nodes: Sequence[NetworkNode], edges: Sequence[NetworkEdge], source_sha256: str
) -> str:
    digest = hashlib.sha256()
    digest.update(b'{"crs":"EPSG:3071","edges":[')
    for position, graph_edge in enumerate(edges):
        if position:
            digest.update(b",")
        digest.update(
            canonical_json_bytes(
                [
                    graph_edge.edge_id,
                    graph_edge.osm_way_id,
                    graph_edge.source_node_id,
                    graph_edge.target_node_id,
                    _decimal_string(graph_edge.length_m),
                ]
            )
        )
    digest.update(b'],"nodes":[')
    for position, graph_node in enumerate(nodes):
        if position:
            digest.update(b",")
        digest.update(
            canonical_json_bytes(
                [
                    graph_node.node_id,
                    _decimal_string(graph_node.x),
                    _decimal_string(graph_node.y),
                ]
            )
        )
    digest.update(b'],"source_sha256":')
    digest.update(canonical_json_bytes(source_sha256))
    digest.update(b',"version":')
    digest.update(canonical_json_bytes(GRAPH_VERSION))
    digest.update(b"}")
    return digest.hexdigest()


def build_walking_graph(
    nodes: Sequence[NetworkNode],
    edges: Sequence[NetworkEdge],
    *,
    source_sha256: str,
) -> WalkingGraph:
    """Validate, canonically order, and materialize a directed multigraph."""

    if len(source_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in source_sha256
    ):
        raise WalkingNetworkError("source SHA-256 must be a lowercase hexadecimal digest")

    normalized_nodes = tuple(
        sorted(
            (
                NetworkNode(
                    node_id=int(item.node_id),
                    x=_decimal(item.x, label="node x"),
                    y=_decimal(item.y, label="node y"),
                )
                for item in nodes
            ),
            key=lambda item: item.node_id,
        )
    )
    node_ids = tuple(item.node_id for item in normalized_nodes)
    if len(node_ids) != len(set(node_ids)):
        raise WalkingNetworkError("duplicate network node ID")
    known_nodes = set(node_ids)

    normalized_edges: list[NetworkEdge] = []
    for item in edges:
        length = _decimal(item.length_m, label="edge length")
        if length <= 0:
            raise WalkingNetworkError("edge length must be positive")
        if item.source_node_id not in known_nodes or item.target_node_id not in known_nodes:
            raise WalkingNetworkError("edge endpoint references a missing network node")
        normalized_edges.append(
            NetworkEdge(
                edge_id=str(item.edge_id),
                osm_way_id=int(item.osm_way_id),
                source_node_id=int(item.source_node_id),
                target_node_id=int(item.target_node_id),
                length_m=length,
            )
        )
    canonical_edges = tuple(sorted(normalized_edges, key=lambda item: item.edge_id))
    edge_ids = tuple(item.edge_id for item in canonical_edges)
    if len(edge_ids) != len(set(edge_ids)):
        raise WalkingNetworkError("duplicate network edge ID")

    routing = nx.MultiDiGraph()
    spatial_buckets: dict[tuple[int, int], list[NetworkNode]] = {}
    for graph_node in normalized_nodes:
        routing.add_node(graph_node.node_id, x=graph_node.x, y=graph_node.y)
        cell = (
            math.floor(_distance_divide(graph_node.x, MAX_SNAP_DISTANCE_M)),
            math.floor(_distance_divide(graph_node.y, MAX_SNAP_DISTANCE_M)),
        )
        spatial_buckets.setdefault(cell, []).append(graph_node)
    for graph_edge in canonical_edges:
        routing.add_edge(
            graph_edge.source_node_id,
            graph_edge.target_node_id,
            key=graph_edge.edge_id,
            edge_id=graph_edge.edge_id,
            osm_way_id=graph_edge.osm_way_id,
            length_m=graph_edge.length_m,
        )
    for source, target, edge_id, attributes in routing.edges(keys=True, data=True):
        immutable_attributes = MappingProxyType(dict(attributes))
        routing._succ[source][target][edge_id] = immutable_attributes
        routing._pred[target][source][edge_id] = immutable_attributes
    nx.freeze(routing)

    return WalkingGraph(
        nodes=normalized_nodes,
        edges=canonical_edges,
        source_sha256=source_sha256,
        graph_sha256=_graph_hash(normalized_nodes, canonical_edges, source_sha256),
        routing=routing,
        spatial_index=MappingProxyType(
            {key: tuple(value) for key, value in spatial_buckets.items()}
        ),
    )


def graph_is_approved_for_scoring(graph: WalkingGraph) -> bool:
    """Require every immutable production identity field, not a forgeable flag alone."""

    return (
        graph.approved_for_scoring
        and graph.source_sha256 == GEOFABRIK_NETWORK_SHA256
        and graph.graph_sha256 == APPROVED_GRAPH_SHA256
        and len(graph.nodes) == APPROVED_GRAPH_NODE_COUNT
        and len(graph.edges) == APPROVED_GRAPH_DIRECTED_EDGE_COUNT
        and graph.crs == PROJECTED_CRS
        and graph.version == GRAPH_VERSION
    )


def _project(longitude: Decimal, latitude: Decimal) -> tuple[Decimal, Decimal]:
    x, y = _TRANSFORMER.transform(float(longitude), float(latitude))
    if not math.isfinite(x) or not math.isfinite(y):
        raise WalkingNetworkError("OSM node projection produced a non-finite coordinate")
    return Decimal(str(x)), Decimal(str(y))


def validate_network_snapshot(
    path: Path,
    *,
    expected_byte_size: int = GEOFABRIK_NETWORK_BYTE_SIZE,
    expected_md5: str = GEOFABRIK_NETWORK_MD5,
    expected_sha256: str = GEOFABRIK_NETWORK_SHA256,
) -> NetworkSnapshot:
    """Stream-validate the exact immutable source before parsing any OSM objects."""

    try:
        byte_size = path.stat().st_size
    except OSError as error:
        raise WalkingNetworkError("walking-network snapshot cannot be read") from error
    if byte_size != expected_byte_size:
        raise WalkingNetworkError("walking-network snapshot byte size does not match")
    md5 = hashlib.md5(usedforsecurity=False)
    sha256 = hashlib.sha256()
    try:
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                md5.update(chunk)
                sha256.update(chunk)
    except OSError as error:
        raise WalkingNetworkError("walking-network snapshot cannot be read") from error
    md5_digest = md5.hexdigest()
    sha256_digest = sha256.hexdigest()
    if md5_digest != expected_md5:
        raise WalkingNetworkError("walking-network snapshot MD5 does not match")
    if sha256_digest != expected_sha256:
        raise WalkingNetworkError("walking-network snapshot SHA-256 does not match")
    return NetworkSnapshot(path, byte_size, md5_digest, sha256_digest)


def _append_way(
    entity: osmium.osm.Way,
    *,
    clip_contains: ClipContains,
    nodes: dict[int, NetworkNode],
    edges: list[NetworkEdge],
) -> None:
    tags = {tag.k: tag.v for tag in entity.tags}
    if not pedestrian_way_allowed(tags):
        return
    directions = pedestrian_directions(tags)
    if not directions:
        return
    references: list[tuple[int, Decimal, Decimal]] = []
    for reference in entity.nodes:
        if not reference.location.valid():
            raise WalkingNetworkError(
                f"OSM way {entity.id} contains a node without a valid location"
            )
        references.append(
            (int(reference.ref), Decimal(str(reference.lon)), Decimal(str(reference.lat)))
        )
    for segment_index, (start, end) in enumerate(zip(references, references[1:])):
        start_id, start_lon, start_lat = start
        end_id, end_lon, end_lat = end
        start_x, start_y = _project(start_lon, start_lat)
        end_x, end_y = _project(end_lon, end_lat)
        if not (clip_contains(start_x, start_y) and clip_contains(end_x, end_y)):
            continue
        if start_id not in nodes:
            nodes[start_id] = NetworkNode(start_id, start_x, start_y)
        if end_id not in nodes:
            nodes[end_id] = NetworkNode(end_id, end_x, end_y)
        start_node = nodes[start_id]
        end_node = nodes[end_id]
        length = Decimal(
            str(
                math.hypot(
                    float(_distance_subtract(end_node.x, start_node.x)),
                    float(_distance_subtract(end_node.y, start_node.y)),
                )
            )
        )
        for direction in directions:
            source, target = (start_id, end_id) if direction == _FORWARD else (end_id, start_id)
            edges.append(
                NetworkEdge(
                    edge_id=f"{int(entity.id)}:{segment_index}:{direction}",
                    osm_way_id=int(entity.id),
                    source_node_id=source,
                    target_node_id=target,
                    length_m=length,
                )
            )


def read_osm_xml(content: bytes, *, clip_contains: ClipContains) -> WalkingGraph:
    """Parse synthetic/local OSM XML through the same normalized graph boundary as PBF."""

    source_sha256 = hashlib.sha256(content).hexdigest()
    nodes: dict[int, NetworkNode] = {}
    edges: list[NetworkEdge] = []
    try:
        processor = osmium.FileProcessor(osmium.io.FileBuffer(content, "osm")).with_locations()
        for entity in processor:
            if isinstance(entity, osmium.osm.Way):
                _append_way(
                    entity,
                    clip_contains=clip_contains,
                    nodes=nodes,
                    edges=edges,
                )
    except WalkingNetworkError:
        raise
    except Exception as error:
        raise WalkingNetworkError("OSM XML parse failed") from error
    return build_walking_graph(tuple(nodes.values()), edges, source_sha256=source_sha256)


def read_walking_network(
    path: Path,
    *,
    clip_contains: ClipContains,
    location_storage: str = "sparse_file_array",
) -> WalkingGraph:
    """Validate and parse the approved local PBF; this function never fetches data."""

    snapshot = validate_network_snapshot(path)
    try:
        initial_identity = path.stat()
    except OSError as error:
        raise WalkingNetworkError("walking-network snapshot cannot be read") from error
    nodes: dict[int, NetworkNode] = {}
    edges: list[NetworkEdge] = []

    class Handler(osmium.SimpleHandler):
        def way(self, way: osmium.osm.Way) -> None:
            _append_way(
                way,
                clip_contains=clip_contains,
                nodes=nodes,
                edges=edges,
            )

    try:
        Handler().apply_file(path, locations=True, idx=location_storage)
    except WalkingNetworkError:
        raise
    except Exception as error:
        raise WalkingNetworkError("OSM PBF parse failed") from error
    try:
        final_identity = path.stat()
    except OSError as error:
        raise WalkingNetworkError("walking-network snapshot changed while it was parsed") from error
    if (
        initial_identity.st_dev,
        initial_identity.st_ino,
        initial_identity.st_size,
        initial_identity.st_mtime_ns,
    ) != (
        final_identity.st_dev,
        final_identity.st_ino,
        final_identity.st_size,
        final_identity.st_mtime_ns,
    ):
        raise WalkingNetworkError("walking-network snapshot changed while it was parsed")
    final_snapshot = validate_network_snapshot(path)
    if final_snapshot.sha256 != snapshot.sha256:
        raise WalkingNetworkError("walking-network snapshot changed while it was parsed")

    graph = build_walking_graph(tuple(nodes.values()), edges, source_sha256=snapshot.sha256)
    if (
        len(graph.nodes) != APPROVED_GRAPH_NODE_COUNT
        or len(graph.edges) != APPROVED_GRAPH_DIRECTED_EDGE_COUNT
        or graph.graph_sha256 != APPROVED_GRAPH_SHA256
    ):
        raise WalkingNetworkError(
            "walking-network graph does not match the approved county-buffer topology"
        )
    return replace(graph, approved_for_scoring=True)


def snap_point(
    graph: WalkingGraph,
    *,
    x: Decimal,
    y: Decimal,
    tolerance_m: Decimal = MAX_SNAP_DISTANCE_M,
) -> SnapResult | None:
    """Snap one projected point to the closest node with stable ID tie-breaking."""

    point_x = _decimal(x, label="point x")
    point_y = _decimal(y, label="point y")
    tolerance = _decimal(tolerance_m, label="snap tolerance")
    if tolerance < 0:
        raise WalkingNetworkError("snap tolerance cannot be negative")
    minimum_cell_x = math.floor(
        _distance_divide(_distance_subtract(point_x, tolerance), MAX_SNAP_DISTANCE_M)
    )
    maximum_cell_x = math.floor(
        _distance_divide(_distance_add(point_x, tolerance), MAX_SNAP_DISTANCE_M)
    )
    minimum_cell_y = math.floor(
        _distance_divide(_distance_subtract(point_y, tolerance), MAX_SNAP_DISTANCE_M)
    )
    maximum_cell_y = math.floor(
        _distance_divide(_distance_add(point_y, tolerance), MAX_SNAP_DISTANCE_M)
    )
    best: tuple[Decimal, int] | None = None
    for cell_x in range(minimum_cell_x, maximum_cell_x + 1):
        for cell_y in range(minimum_cell_y, maximum_cell_y + 1):
            for item in graph.spatial_index.get((cell_x, cell_y), ()):
                delta_x = _distance_subtract(item.x, point_x)
                delta_y = _distance_subtract(item.y, point_y)
                squared_distance = _distance_add(
                    _ROUTING_CONTEXT.multiply(delta_x, delta_x),
                    _ROUTING_CONTEXT.multiply(delta_y, delta_y),
                )
                candidate = (squared_distance, item.node_id)
                if best is None or candidate < best:
                    best = candidate
    if best is None or best[0] > _ROUTING_CONTEXT.multiply(tolerance, tolerance):
        return None
    return SnapResult(node_id=best[1], distance_m=_ROUTING_CONTEXT.sqrt(best[0]))


def shortest_path(
    graph: WalkingGraph, *, source_node_id: int, target_node_id: int
) -> PathResult | None:
    """Return the deterministic directed shortest path, including stable edge evidence."""

    if source_node_id not in graph.routing or target_node_id not in graph.routing:
        return None
    queue: list[tuple[Decimal, int]] = [(Decimal(0), source_node_id)]
    distances = {source_node_id: Decimal(0)}
    predecessors: dict[int, tuple[int, str]] = {}
    while queue:
        distance, current = heapq.heappop(queue)
        if distances.get(current) != distance:
            continue
        if current == target_node_id:
            node_path = [current]
            edge_path: list[str] = []
            while current != source_node_id:
                current, edge_id = predecessors[current]
                node_path.append(current)
                edge_path.append(edge_id)
            return PathResult(
                distance,
                tuple(reversed(node_path)),
                tuple(reversed(edge_path)),
            )
        outgoing = sorted(
            (
                (int(target), str(edge_id), attributes["length_m"])
                for _source, target, edge_id, attributes in graph.routing.out_edges(
                    current, keys=True, data=True
                )
            ),
            key=lambda item: (item[0], item[1]),
        )
        for target, edge_id, length in outgoing:
            candidate_distance = _distance_add(distance, length)
            candidate_predecessor = (current, edge_id)
            if target not in distances or (
                (candidate_distance, candidate_predecessor)
                < (distances[target], predecessors.get(target, (target, "")))
            ):
                distances[target] = candidate_distance
                predecessors[target] = candidate_predecessor
                heapq.heappush(queue, (candidate_distance, target))
    return None


def shortest_distances(
    graph: WalkingGraph,
    *,
    source_node_id: int,
    cutoff_m: Decimal | None = None,
) -> dict[int, Decimal]:
    """Return directed distances once per node, optionally bounded for local access counts."""

    if source_node_id not in graph.routing:
        return {}
    cutoff = None if cutoff_m is None else _decimal(cutoff_m, label="route cutoff")
    queue: list[tuple[Decimal, int]] = [(Decimal(0), source_node_id)]
    distances = {source_node_id: Decimal(0)}
    while queue:
        distance, current = heapq.heappop(queue)
        if distances.get(current) != distance:
            continue
        outgoing = sorted(
            (
                (int(target), str(edge_id), attributes["length_m"])
                for _source, target, edge_id, attributes in graph.routing.out_edges(
                    current, keys=True, data=True
                )
            ),
            key=lambda item: (item[0], item[1]),
        )
        for target, _edge_id, length in outgoing:
            candidate = _distance_add(distance, length)
            if cutoff is not None and candidate > cutoff:
                continue
            if target not in distances or candidate < distances[target]:
                distances[target] = candidate
                heapq.heappush(queue, (candidate, target))
    return distances


def nearest_target_distances(
    graph: WalkingGraph,
    *,
    targets_by_node: Mapping[int, Sequence[str]],
) -> dict[int, tuple[Decimal, str]]:
    """Run stable multi-source Dijkstra on reversed edges for nearest target lookup."""

    best: dict[int, tuple[Decimal, str]] = {}
    queue: list[tuple[Decimal, str, int]] = []
    for node_id in sorted(targets_by_node):
        if node_id not in graph.routing:
            raise WalkingNetworkError("target references a missing network node")
        for target_id in sorted(set(targets_by_node[node_id])):
            candidate = (Decimal(0), target_id)
            if node_id not in best or candidate < best[node_id]:
                best[node_id] = candidate
                heapq.heappush(queue, (*candidate, node_id))

    while queue:
        distance, target_id, current = heapq.heappop(queue)
        if best.get(current) != (distance, target_id):
            continue
        incoming = sorted(
            (
                (int(source), str(edge_id), attributes["length_m"])
                for source, _target, edge_id, attributes in graph.routing.in_edges(
                    current, keys=True, data=True
                )
            ),
            key=lambda item: (item[0], item[1]),
        )
        for source, _edge_id, length in incoming:
            candidate = (_distance_add(distance, length), target_id)
            if source not in best or candidate < best[source]:
                best[source] = candidate
                heapq.heappush(queue, (*candidate, source))
    return best
