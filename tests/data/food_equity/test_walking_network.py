from __future__ import annotations

import hashlib
import inspect
import json
import math
from decimal import Decimal, localcontext
from pathlib import Path

import networkx as nx
import pytest

from pipelines.food_equity.walking_network import (
    APPROVED_GRAPH_DIRECTED_EDGE_COUNT,
    APPROVED_GRAPH_NODE_COUNT,
    APPROVED_GRAPH_SHA256,
    GEOFABRIK_NETWORK_ARTIFACT,
    GEOFABRIK_NETWORK_BYTE_SIZE,
    GEOFABRIK_NETWORK_MD5,
    GEOFABRIK_NETWORK_SHA256,
    GEOFABRIK_NETWORK_URL,
    GRAPH_VERSION,
    MAX_SNAP_DISTANCE_M,
    PROJECTED_CRS,
    NetworkEdge,
    NetworkNode,
    WalkingNetworkError,
    build_walking_graph,
    pedestrian_way_allowed,
    read_osm_xml,
    shortest_distances,
    shortest_path,
    snap_point,
    validate_network_snapshot,
)


FIXTURE = Path(__file__).parents[1] / "fixtures/food_equity/network/tiny-network.osm"
FIXTURE_SHA256 = "d482b7fe4f04eb5ab0b92c3326dd7a7e4ce11b2c0f7c1b683c760bdc5d6c3034"
REVIEWED_ROUTES = FIXTURE.parent / "milwaukee-reviewed-routes.json"


def node(node_id: int, x: str, y: str) -> NetworkNode:
    return NetworkNode(node_id=node_id, x=Decimal(x), y=Decimal(y))


def edge(
    edge_id: str,
    way_id: int,
    source: int,
    target: int,
    length_m: str,
) -> NetworkEdge:
    return NetworkEdge(
        edge_id=edge_id,
        osm_way_id=way_id,
        source_node_id=source,
        target_node_id=target,
        length_m=Decimal(length_m),
    )


def exact_graph():
    nodes = (
        node(1, "0", "0"),
        node(2, "804.672", "0"),
        node(3, "1207.008", "0"),
        node(4, "1609.344", "0"),
        node(5, "804.672", "804.672"),
        node(6, "2000", "2000"),
        node(7, "200", "0"),
        node(8, "0", "200"),
    )
    edges = (
        edge("10:0:f", 10, 1, 2, "804.672"),
        edge("10:0:r", 10, 2, 1, "804.672"),
        edge("11:0:f", 11, 2, 3, "402.336"),
        edge("11:0:r", 11, 3, 2, "402.336"),
        edge("12:0:f", 12, 3, 4, "402.336"),
        edge("12:0:r", 12, 4, 3, "402.336"),
        edge("13:0:f", 13, 1, 5, "804.672"),
        edge("13:0:r", 13, 5, 1, "804.672"),
        edge("14:0:f", 14, 7, 2, "604.672"),
        edge("15:0:f", 15, 8, 5, "604.672"),
    )
    return build_walking_graph(nodes, edges, source_sha256="a" * 64)


def test_locks_approved_immutable_network_and_crs_contract() -> None:
    assert GEOFABRIK_NETWORK_ARTIFACT == "wisconsin-260827.osm.pbf"
    assert GEOFABRIK_NETWORK_URL == (
        "https://download.geofabrik.de/north-america/us/wisconsin-260827.osm.pbf"
    )
    assert GEOFABRIK_NETWORK_BYTE_SIZE == 292_160_666
    assert GEOFABRIK_NETWORK_MD5 == "87c18ce0608499afd91ed0f2a5ee8eef"
    assert GEOFABRIK_NETWORK_SHA256 == (
        "3e4a59bae5e7eb0f6f175a8645b3b2be16c276a5082f3732566d4e3aeaee6842"
    )
    assert PROJECTED_CRS == "EPSG:3071"
    assert MAX_SNAP_DISTANCE_M == Decimal("200")
    assert GRAPH_VERSION == "walking-network-v1"
    assert APPROVED_GRAPH_NODE_COUNT == 623_268
    assert APPROVED_GRAPH_DIRECTED_EDGE_COUNT == 1_557_006
    assert APPROVED_GRAPH_SHA256 == (
        "a7e4bf2230e4b38cc5126d45c16f96270814bfd48caa15f698c81d5d580e17fa"
    )


def test_fixture_is_exact_synthetic_bytes_and_never_a_live_download() -> None:
    content = FIXTURE.read_bytes()

    assert hashlib.sha256(content).hexdigest() == FIXTURE_SHA256
    assert b"synthetic-task-8-fixture" in content
    assert b"wisconsin-260827.osm.pbf" not in content


def test_stream_validates_snapshot_size_md5_and_sha256(tmp_path: Path) -> None:
    content = FIXTURE.read_bytes()
    snapshot_path = tmp_path / "local.osm"
    snapshot_path.write_bytes(content)

    snapshot = validate_network_snapshot(
        snapshot_path,
        expected_byte_size=len(content),
        expected_md5=hashlib.md5(content, usedforsecurity=False).hexdigest(),
        expected_sha256=hashlib.sha256(content).hexdigest(),
    )

    assert snapshot.path == snapshot_path
    assert snapshot.byte_size == len(content)
    assert snapshot.sha256 == FIXTURE_SHA256

    with pytest.raises(WalkingNetworkError, match="byte size"):
        validate_network_snapshot(
            snapshot_path,
            expected_byte_size=len(content) + 1,
            expected_md5=snapshot.md5,
            expected_sha256=snapshot.sha256,
        )
    with pytest.raises(WalkingNetworkError, match="MD5"):
        validate_network_snapshot(
            snapshot_path,
            expected_byte_size=len(content),
            expected_md5="0" * 32,
            expected_sha256=snapshot.sha256,
        )
    with pytest.raises(WalkingNetworkError, match="SHA-256"):
        validate_network_snapshot(
            snapshot_path,
            expected_byte_size=len(content),
            expected_md5=snapshot.md5,
            expected_sha256="0" * 64,
        )


def test_records_repeatable_reviewed_milwaukee_routes_from_the_pinned_graph() -> None:
    evidence = json.loads(REVIEWED_ROUTES.read_bytes())

    assert evidence["source_sha256"] == GEOFABRIK_NETWORK_SHA256
    assert evidence["graph_sha256"] == APPROVED_GRAPH_SHA256
    assert (evidence["graph_node_count"], evidence["directed_edge_count"]) == (
        APPROVED_GRAPH_NODE_COUNT,
        APPROVED_GRAPH_DIRECTED_EDGE_COUNT,
    )
    assert tuple(item["route_id"] for item in evidence["routes"]) == (
        "downtown",
        "north_side",
        "west_allis",
    )
    assert tuple(
        (item["origin_snap_m"], item["destination_snap_m"], item["network_distance_m"])
        for item in evidence["routes"]
    ) == (
        (
            "13.562375274429577477628903693124351926374360751566",
            "3.4024778686754719105475365428683018829394052404711",
            "951.9137492987109242",
        ),
        (
            "21.042080387454737386000038426470769761537796227244",
            "1.0430581404287493490612968111631410417986371267898",
            "1040.5783979324663608",
        ),
        (
            "2.3325938237820458287453212384122059139578666141817",
            "8.5930661739736913788523681777743348249735738647380",
            "1111.9763321428076578",
        ),
    )
    for item in evidence["routes"]:
        assert Decimal(item["origin_snap_m"]) <= MAX_SNAP_DISTANCE_M
        assert Decimal(item["destination_snap_m"]) <= MAX_SNAP_DISTANCE_M
        assert Decimal(item["network_distance_m"]) > 0
        assert item["directed_edge_count"] > 0


@pytest.mark.parametrize(
    ("tags", "allowed"),
    [
        ({"highway": "residential"}, True),
        ({"highway": "steps"}, True),
        ({"highway": "residential", "area": "yes"}, False),
        ({"highway": "proposed"}, False),
        ({"highway": "construction"}, False),
        ({"highway": "abandoned"}, False),
        ({"highway": "raceway"}, False),
        ({"highway": "motorway"}, False),
        ({"highway": "motorway_link"}, False),
        ({"highway": "residential", "foot": "no"}, False),
        ({"highway": "residential", "foot": "private"}, False),
        ({"highway": "residential", "access": "no"}, False),
        ({"highway": "residential", "access": "private"}, False),
        ({"highway": "residential", "access": "no", "foot": "yes"}, True),
        ({"highway": "residential", "access": "private", "foot": "designated"}, True),
        ({"highway": "residential", "access": "no", "foot": "permissive"}, True),
    ],
)
def test_approved_highway_access_and_foot_filters(tags: dict[str, str], allowed: bool) -> None:
    assert pedestrian_way_allowed(tags) is allowed


def test_parses_only_approved_pedestrian_ways_and_includes_clip_boundary() -> None:
    unbounded = read_osm_xml(FIXTURE.read_bytes(), clip_contains=lambda _x, _y: True)
    included_projected_points = {(item.x, item.y) for item in unbounded.nodes if item.node_id <= 8}
    graph = read_osm_xml(
        FIXTURE.read_bytes(),
        clip_contains=lambda x, y: (x, y) in included_projected_points,
    )
    by_way = {
        way_id: {
            (item.source_node_id, item.target_node_id)
            for item in graph.edges
            if item.osm_way_id == way_id
        }
        for way_id in {item.osm_way_id for item in graph.edges}
    }

    # Vehicle-only oneway is ignored for walking and parallel ways remain distinct.
    assert by_way[100] == {(1, 2), (2, 1)}
    assert by_way[101] == {(1, 2), (2, 1)}
    assert (
        len([item for item in graph.edges if {item.source_node_id, item.target_node_id} == {1, 2}])
        == 4
    )
    # Steps and explicit access overrides are included.
    assert by_way[103] == {(2, 4), (4, 2)}
    assert by_way[104] == {(4, 6), (6, 4)}
    # Pedestrian direction tags alone control direction.
    assert by_way[106] == {(4, 5)}
    assert by_way[107] == {(7, 5)}
    assert by_way[113] == {(8, 7)}
    assert by_way[114] == {(8, 6)}
    # foot=no, motorway, area, construction, private access, and abandoned are excluded.
    assert not ({102, 105, 108, 109, 110, 112} & by_way.keys())
    # Node 3 is exactly on the injected boundary and both endpoints of way 111 are included.
    assert 3 in {item.node_id for item in graph.nodes}
    assert by_way[111] == {(3, 6), (6, 3)}


def test_clip_requires_both_segment_endpoints_and_parser_has_no_fetch_path() -> None:
    content = FIXTURE.read_bytes()
    unbounded = read_osm_xml(content, clip_contains=lambda _x, _y: True)
    included_projected_points = {
        (item.x, item.y) for item in unbounded.nodes if item.node_id <= 8 and item.node_id != 3
    }
    graph = read_osm_xml(
        content,
        clip_contains=lambda x, y: (x, y) in included_projected_points,
    )

    assert all(item.source_node_id != 3 and item.target_node_id != 3 for item in graph.edges)
    assert tuple(inspect.signature(read_osm_xml).parameters) == ("content", "clip_contains")


def test_projected_edge_lengths_are_positive_finite_meters() -> None:
    graph = read_osm_xml(FIXTURE.read_bytes(), clip_contains=lambda _x, _y: True)

    assert graph.crs == "EPSG:3071"
    assert all(item.length_m > 0 and item.length_m.is_finite() for item in graph.edges)
    assert all(
        math.isfinite(float(item.x)) and math.isfinite(float(item.y)) for item in graph.nodes
    )

    base_nodes = (node(1, "0", "0"), node(2, "1", "0"))
    for invalid in ("0", "-1", "NaN", "Infinity"):
        with pytest.raises(WalkingNetworkError, match="length|finite|positive"):
            build_walking_graph(
                base_nodes,
                (edge("bad", 1, 1, 2, invalid),),
                source_sha256="b" * 64,
            )


def test_graph_ids_parallel_edges_and_hash_are_stable_under_input_order() -> None:
    nodes = (node(2, "1", "0"), node(1, "0", "0"))
    edges = (
        edge("11:0:f", 11, 1, 2, "1"),
        edge("10:0:f", 10, 1, 2, "1"),
        edge("10:0:r", 10, 2, 1, "1"),
    )

    forward = build_walking_graph(nodes, edges, source_sha256="c" * 64)
    reversed_input = build_walking_graph(
        tuple(reversed(nodes)), tuple(reversed(edges)), source_sha256="c" * 64
    )

    assert tuple(item.node_id for item in forward.nodes) == (1, 2)
    assert tuple(item.edge_id for item in forward.edges) == (
        "10:0:f",
        "10:0:r",
        "11:0:f",
    )
    assert len([item for item in forward.edges if item.source_node_id == 1]) == 2
    assert forward.graph_sha256 == reversed_input.graph_sha256

    equivalent_decimal = build_walking_graph(
        nodes,
        (
            edge("11:0:f", 11, 1, 2, "1.0"),
            edge("10:0:f", 10, 1, 2, "1.00"),
            edge("10:0:r", 10, 2, 1, "1.000"),
        ),
        source_sha256="c" * 64,
    )
    changed_decimal = build_walking_graph(
        nodes,
        (
            edge("11:0:f", 11, 1, 2, "1.0000000000000001"),
            edge("10:0:f", 10, 1, 2, "1"),
            edge("10:0:r", 10, 2, 1, "1"),
        ),
        source_sha256="c" * 64,
    )
    assert forward.graph_sha256 == equivalent_decimal.graph_sha256
    assert forward.graph_sha256 != changed_decimal.graph_sha256


def test_runtime_graph_and_snap_index_cannot_mutate_behind_the_fingerprint() -> None:
    graph = exact_graph()

    with pytest.raises(nx.NetworkXError, match="Frozen graph"):
        graph.routing.add_edge(1, 6, key="forged", length_m=Decimal("1"))
    with pytest.raises(TypeError):
        graph.routing.edges[1, 2, "10:0:f"]["length_m"] = Decimal("1")
    with pytest.raises(TypeError):
        graph.spatial_index[(0, 0)] = ()


def test_snapping_is_inclusive_at_200m_and_lowest_node_wins_ties() -> None:
    graph = exact_graph()

    tied = snap_point(graph, x=Decimal("100"), y=Decimal("100"))
    boundary = snap_point(graph, x=Decimal("400"), y=Decimal("0"))
    outside = snap_point(graph, x=Decimal("400.0001"), y=Decimal("0"))

    assert tied is not None
    assert (tied.node_id, tied.distance_m) == (
        1,
        Decimal("141.42135623730950488016887242096980785696718753769"),
    )
    assert boundary is not None
    assert (boundary.node_id, boundary.distance_m) == (7, Decimal("200"))
    assert outside is None


def test_routing_arithmetic_is_independent_of_the_callers_decimal_context() -> None:
    graph = build_walking_graph(
        (node(1, "0", "0"), node(2, "1", "0"), node(3, "2", "0")),
        (
            edge("a", 1, 1, 2, "123.456789123456789123456789123"),
            edge("b", 2, 2, 3, "123.456789123456789123456789123"),
        ),
        source_sha256="9" * 64,
    )

    observed = []
    for precision in (6, 28, 50):
        with localcontext() as context:
            context.prec = precision
            observed.append(
                (
                    snap_point(graph, x=Decimal("0.5"), y=Decimal("0.5")),
                    shortest_distances(graph, source_node_id=1)[3],
                )
            )

    assert observed[0] == observed[1] == observed[2]
    assert observed[0][1] == Decimal("246.913578246913578246913578246")


def test_shortest_paths_are_directed_disconnected_and_deterministic_on_ties() -> None:
    graph = exact_graph()

    first = shortest_path(graph, source_node_id=1, target_node_id=3)
    disconnected = shortest_path(graph, source_node_id=1, target_node_id=6)

    assert first is not None
    assert first.distance_m == Decimal("1207.008")
    assert first.node_ids == (1, 2, 3)
    assert first.edge_ids == ("10:0:f", "11:0:f")
    assert disconnected is None

    tied_graph = build_walking_graph(
        (node(1, "0", "0"), node(2, "1", "1"), node(3, "1", "-1"), node(4, "2", "0")),
        (
            edge("b1", 20, 1, 3, "1"),
            edge("b2", 21, 3, 4, "1"),
            edge("a1", 10, 1, 2, "1"),
            edge("a2", 11, 2, 4, "1"),
        ),
        source_sha256="d" * 64,
    )
    tied = shortest_path(tied_graph, source_node_id=1, target_node_id=4)
    assert tied is not None
    assert tied.node_ids == (1, 2, 4)
    assert tied.edge_ids == ("a1", "a2")


def test_rejects_duplicate_ids_missing_nodes_and_malformed_xml() -> None:
    with pytest.raises(WalkingNetworkError, match="duplicate.*node"):
        build_walking_graph(
            (node(1, "0", "0"), node(1, "1", "0")),
            (),
            source_sha256="e" * 64,
        )
    with pytest.raises(WalkingNetworkError, match="duplicate.*edge"):
        build_walking_graph(
            (node(1, "0", "0"), node(2, "1", "0")),
            (edge("same", 1, 1, 2, "1"), edge("same", 2, 2, 1, "1")),
            source_sha256="e" * 64,
        )
    with pytest.raises(WalkingNetworkError, match="node|endpoint"):
        build_walking_graph(
            (node(1, "0", "0"),),
            (edge("missing", 1, 1, 2, "1"),),
            source_sha256="e" * 64,
        )
    with pytest.raises(WalkingNetworkError, match="XML|OSM|parse"):
        read_osm_xml(b"<osm><broken>", clip_contains=lambda _x, _y: True)
