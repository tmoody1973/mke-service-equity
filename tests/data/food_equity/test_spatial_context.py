from __future__ import annotations

from shapely.geometry import MultiPolygon, Point, Polygon

import pytest

from pipelines.equity_baseline.geography import GeographyRecord
from pipelines.food_equity.spatial_context import SpatialContextError, build_spatial_context


def geography(geoid: str, x: float) -> GeographyRecord:
    polygon = Polygon(
        [
            (-88.0 + x, 43.0),
            (-87.99 + x, 43.0),
            (-87.99 + x, 43.01),
            (-88.0 + x, 43.01),
            (-88.0 + x, 43.0),
        ]
    )
    return GeographyRecord(
        geoid=geoid,
        name=f"Tract {geoid}",
        state_fips="55",
        county_fips="079",
        vintage="2020 TIGER/Line",
        geometry=MultiPolygon([polygon]),
        centroid=Point(-87.995 + x, 43.005),
    )


def test_spatial_context_uses_source_polygons_and_inclusive_review_buffer() -> None:
    context = build_spatial_context(
        (geography("55079000101", 0), geography("55079000201", 0.02)),
        tiger_snapshot_sha256="a" * 64,
        expected_count=2,
    )
    projected_point = context.county_projected.representative_point()

    assert context.service_area_contains(
        geography("55079000101", 0).centroid.x,
        geography("55079000101", 0).centroid.y,
    )
    assert context.review_area_contains_projected(projected_point.x, projected_point.y)
    assert (
        context.approved_area_for_origin("55079000101", projected_point.x, projected_point.y)
        == "55079000101"
    )
    assert context.approved_area_for_origin("unknown", projected_point.x, projected_point.y) is None
    assert not context.service_area_contains(-100, 30)


def test_spatial_context_rejects_incomplete_or_unproven_geography() -> None:
    with pytest.raises(SpatialContextError, match="exactly 2"):
        build_spatial_context(
            (geography("55079000101", 0),),
            tiger_snapshot_sha256="a" * 64,
            expected_count=2,
        )
    with pytest.raises(SpatialContextError, match="SHA-256"):
        build_spatial_context(
            (geography("55079000101", 0),),
            tiger_snapshot_sha256="not-a-hash",
            expected_count=1,
        )
