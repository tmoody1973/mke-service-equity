from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import MultiPolygon, Point, Polygon

import pipelines.equity_baseline.geography as geography_module
from pipelines.equity_baseline.geography import (
    REQUIRED_TIGER_COLUMNS,
    TIGER_2020_WISCONSIN_TRACTS_URL,
    GeographyValidationError,
    normalize_canonical_tracts,
    read_canonical_tracts,
)


FIXTURE = Path(__file__).parents[1] / "fixtures/equity_baseline/tiger/tracts.geojson"


def tract_frame(
    *,
    geoids: tuple[str, ...] = ("55079000200", "55079000100"),
    counties: tuple[str, ...] = ("079", "079"),
    geometries: tuple[object, ...] | None = None,
    crs: str | None = "EPSG:4326",
) -> gpd.GeoDataFrame:
    if geometries is None:
        geometries = (
            Polygon([(-87.92, 43.01), (-87.90, 43.01), (-87.90, 43.03), (-87.92, 43.01)]),
            Polygon(
                [
                    (-87.96, 43.00),
                    (-87.925, 43.00),
                    (-87.92, 43.03),
                    (-87.94, 43.05),
                    (-87.96, 43.00),
                ]
            ),
        )
    return gpd.GeoDataFrame(
        {
            "STATEFP20": ["55"] * len(geoids),
            "COUNTYFP20": list(counties),
            "TRACTCE20": [geoid[5:] for geoid in geoids],
            "GEOID20": list(geoids),
            "NAME20": [str(index) for index in range(len(geoids))],
            "NAMELSAD20": [f"Census Tract {index}" for index in range(len(geoids))],
        },
        geometry=list(geometries),
        crs=crs,
    )


def test_reads_fixture_with_pyogrio_and_returns_sorted_frozen_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actual_read_file = gpd.read_file
    engines: list[str | None] = []

    def observe_reader(path: str | Path, *, engine: str | None = None) -> gpd.GeoDataFrame:
        engines.append(engine)
        return actual_read_file(path, engine=engine)

    monkeypatch.setattr(geography_module.gpd, "read_file", observe_reader)

    records = read_canonical_tracts(FIXTURE)

    assert engines == ["pyogrio"]
    assert [record.geoid for record in records] == ["55079000100", "55079000200"]
    assert [(record.state_fips, record.county_fips) for record in records] == [
        ("55", "079"),
        ("55", "079"),
    ]
    assert all(isinstance(record.geometry, MultiPolygon) for record in records)
    assert all(isinstance(record.centroid, Point) for record in records)
    assert all(record.geometry.is_valid and not record.geometry.is_empty for record in records)
    assert all(not record.centroid.is_empty for record in records)
    assert all(record.vintage == "2020 TIGER/Line" for record in records)
    with pytest.raises(AttributeError):
        records[0].geoid = "changed"  # type: ignore[misc]


def test_uses_the_approved_official_tiger_url() -> None:
    assert TIGER_2020_WISCONSIN_TRACTS_URL == (
        "https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_55_tract.zip"
    )


@pytest.mark.parametrize("missing_column", sorted(REQUIRED_TIGER_COLUMNS - {"geometry"}))
def test_rejects_missing_required_tiger_columns(missing_column: str) -> None:
    frame = tract_frame().drop(columns=[missing_column])

    with pytest.raises(GeographyValidationError, match="missing required TIGER columns"):
        normalize_canonical_tracts(frame)


def test_rejects_missing_crs() -> None:
    with pytest.raises(GeographyValidationError, match="CRS"):
        normalize_canonical_tracts(tract_frame(crs=None))


def test_rejects_a_source_without_milwaukee_county() -> None:
    frame = tract_frame(
        geoids=("55081000100", "55081000200"),
        counties=("081", "081"),
    )

    with pytest.raises(GeographyValidationError, match="no Milwaukee County"):
        normalize_canonical_tracts(frame)


@pytest.mark.parametrize(
    ("geometries", "message"),
    [
        ((None, Polygon([(0, 0), (1, 0), (0, 1), (0, 0)])), "null geometry"),
        ((Polygon(), Polygon([(0, 0), (1, 0), (0, 1), (0, 0)])), "empty geometry"),
        (
            (
                Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)]),
                Polygon([(0, 0), (1, 0), (0, 1), (0, 0)]),
            ),
            "invalid geometry",
        ),
        (
            (Point(-87.9, 43.0), Polygon([(0, 0), (1, 0), (0, 1), (0, 0)])),
            "Polygon or MultiPolygon",
        ),
    ],
)
def test_rejects_unusable_authoritative_geometry_before_subsetting(
    geometries: tuple[object, ...], message: str
) -> None:
    frame = tract_frame(
        geoids=("55081000100", "55079000100"),
        counties=("081", "079"),
        geometries=geometries,
    )

    with pytest.raises(GeographyValidationError, match=message):
        normalize_canonical_tracts(frame)


@pytest.mark.parametrize(
    ("geoids", "counties", "message"),
    [
        (("5507900010", "55079000200"), ("079", "079"), "11 digits"),
        (("55079000100", "55079000100"), ("079", "079"), "unique"),
        (("55081000100", "55079000200"), ("079", "079"), "FIPS prefix"),
    ],
)
def test_rejects_invalid_or_duplicate_geoids(
    geoids: tuple[str, ...], counties: tuple[str, ...], message: str
) -> None:
    with pytest.raises(GeographyValidationError, match=message):
        normalize_canonical_tracts(tract_frame(geoids=geoids, counties=counties))


def test_reprojects_geometry_to_4326_and_computes_centroid_in_3071() -> None:
    source = tract_frame(
        geoids=("55079000100",),
        counties=("079",),
        geometries=(
            Polygon(
                [
                    (-87.96, 43.00),
                    (-87.925, 43.00),
                    (-87.92, 43.03),
                    (-87.94, 43.05),
                    (-87.96, 43.00),
                ]
            ),
        ),
    )
    projected_source = source.to_crs(epsg=3071)
    expected_centroid = projected_source.geometry.centroid.to_crs(epsg=4326).iloc[0]
    naive_centroid = source.geometry.iloc[0].centroid

    record = normalize_canonical_tracts(projected_source)[0]

    assert record.geometry.bounds[0] == pytest.approx(-87.96, abs=1e-8)
    assert record.centroid.equals_exact(expected_centroid, tolerance=1e-10)
    assert record.centroid.distance(naive_centroid) > 1e-8


def test_normalizes_polygon_and_preserves_multipolygon() -> None:
    polygon = Polygon([(-87.92, 43.01), (-87.90, 43.01), (-87.90, 43.03), (-87.92, 43.01)])
    multipolygon = MultiPolygon(
        [Polygon([(-87.96, 43.00), (-87.94, 43.00), (-87.94, 43.02), (-87.96, 43.00)])]
    )

    records = normalize_canonical_tracts(tract_frame(geometries=(polygon, multipolygon)))

    assert all(isinstance(record.geometry, MultiPolygon) for record in records)
    assert records[0].geometry == multipolygon
    assert records[1].geometry == MultiPolygon([polygon])
