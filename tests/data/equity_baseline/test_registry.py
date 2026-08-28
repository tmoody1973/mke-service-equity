from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Callable

import pytest

from pipelines.equity_baseline.errors import RegistryValidationError
from pipelines.equity_baseline.models import Domain, FormulaKind
from pipelines.equity_baseline.registry import load_registry, registry_sha256


EXPECTED_ACS_FORMULAS = {
    "people_of_color": {
        "kind": FormulaKind.DIFFERENCE_RATIO,
        "numerator": ("B03002_001E",),
        "numerator_subtract": ("B03002_003E",),
        "denominator": ("B03002_001E",),
        "denominator_subtract": (),
    },
    "limited_english_proficiency": {
        "kind": FormulaKind.SUM_RATIO,
        "numerator": (
            "C16001_005E",
            "C16001_008E",
            "C16001_011E",
            "C16001_014E",
            "C16001_017E",
            "C16001_020E",
            "C16001_023E",
            "C16001_026E",
            "C16001_029E",
            "C16001_032E",
            "C16001_035E",
            "C16001_038E",
        ),
        "numerator_subtract": (),
        "denominator": ("C16001_001E",),
        "denominator_subtract": (),
    },
    "foreign_born": {
        "kind": FormulaKind.RATIO,
        "numerator": ("B05002_013E",),
        "numerator_subtract": (),
        "denominator": ("B05002_001E",),
        "denominator_subtract": (),
    },
    "below_200_percent_fpl": {
        "kind": FormulaKind.SUM_RATIO,
        "numerator": tuple(f"C17002_{index:03d}E" for index in range(2, 8)),
        "numerator_subtract": (),
        "denominator": ("C17002_001E",),
        "denominator_subtract": (),
    },
    "unemployment": {
        "kind": FormulaKind.RATIO,
        "numerator": ("B23025_005E",),
        "numerator_subtract": (),
        "denominator": ("B23025_003E",),
        "denominator_subtract": (),
    },
    "less_than_high_school": {
        "kind": FormulaKind.SUM_RATIO,
        "numerator": tuple(f"B15003_{index:03d}E" for index in range(2, 17)),
        "numerator_subtract": (),
        "denominator": ("B15003_001E",),
        "denominator_subtract": (),
    },
    "housing_cost_burden": {
        "kind": FormulaKind.SUM_RATIO,
        "numerator": tuple(
            f"B25106_{index:03d}E" for index in (6, 10, 14, 18, 22, 28, 32, 36, 40, 44)
        ),
        "numerator_subtract": (),
        "denominator": ("B25106_001E",),
        "denominator_subtract": ("B25106_023E", "B25106_045E"),
    },
}

EXPECTED_PLACES_MEASURES = {
    "diagnosed_diabetes": "DIABETES",
    "obesity": "OBESITY",
    "current_asthma": "CASTHMA",
    "any_disability": "DISABILITY",
    "frequent_mental_distress": "MHLTH",
    "no_leisure_time_physical_activity": "LPA",
}


@pytest.fixture
def registry_text() -> str:
    path = Path(__file__).parents[3] / "pipelines/equity_baseline/registry.toml"
    return path.read_text(encoding="utf-8")


def write_registry(tmp_path: Path, contents: str) -> Path:
    path = tmp_path / "registry.toml"
    path.write_text(contents, encoding="utf-8")
    return path


def test_approved_registry_contract() -> None:
    registry = load_registry()
    indicators = registry.indicators

    assert registry.methodology_version == "equity-baseline-v1"
    assert registry.completeness_rule == "all_required"
    assert registry.tie_method == "average"
    assert registry.single_geography_percentile == Decimal("50")
    assert len(indicators) == 13
    assert len({indicator.slug for indicator in indicators}) == 13
    assert all(indicator.higher_is_worse for indicator in indicators)
    assert all(indicator.baseline_included for indicator in indicators)

    counts = {
        domain: sum(indicator.domain is domain for indicator in indicators) for domain in Domain
    }
    assert counts == {
        Domain.DEMOGRAPHIC: 3,
        Domain.SOCIOECONOMIC: 4,
        Domain.HEALTH: 6,
    }

    assert set(registry.domain_weights) == set(Domain)
    assert all(
        weight == Decimal("0.3333333333333333333333333333")
        for weight in registry.domain_weights.values()
    )
    assert abs(sum(registry.domain_weights.values()) - Decimal("1")) <= Decimal("1e-26")
    for domain in Domain:
        total = sum(
            (
                indicator.within_domain_weight
                for indicator in indicators
                if indicator.domain is domain
            ),
            Decimal("0"),
        )
        assert abs(total - Decimal("1")) <= Decimal("1e-26")


def test_approved_sources_geography_and_quality_policy() -> None:
    registry = load_registry()

    assert {
        source.key: (source.vintage, source.dataset_identifier) for source in registry.sources
    } == {
        "tiger": ("2020", "tl_2020_55_tract"),
        "acs": ("2024 ACS 5-year", "acs/acs5"),
        "places": ("December 2025 PLACES release (2023 estimates)", "cwsq-ngmh"),
    }
    assert registry.geography.vintage == "2020 TIGER/Line census tracts"
    assert registry.geography.state_fips == "55"
    assert registry.geography.county_fips == "079"
    assert registry.geography.population_variable == "B01003_001E"
    assert registry.geography.positive_population_status == "eligible"
    assert registry.geography.zero_population_status == "ineligible"
    assert registry.geography.missing_population_status == "insufficient_data"
    assert registry.reliability.reliable_max_cv == Decimal("15")
    assert registry.reliability.caution_max_cv == Decimal("30")
    assert registry.reliability.zero_estimate_status == "cv_not_computable"
    assert registry.reliability.excludes_from_scoring is False


def test_approved_acs_formulas_and_vintage() -> None:
    registry = load_registry()
    acs = {
        indicator.slug: indicator for indicator in registry.indicators if indicator.source == "acs"
    }

    assert set(acs) == set(EXPECTED_ACS_FORMULAS)
    for slug, expected in EXPECTED_ACS_FORMULAS.items():
        indicator = acs[slug]
        assert indicator.vintage == "2024 ACS 5-year"
        assert indicator.formula.kind is expected["kind"]
        assert indicator.formula.numerator == expected["numerator"]
        assert indicator.formula.numerator_subtract == expected["numerator_subtract"]
        assert indicator.formula.denominator == expected["denominator"]
        assert indicator.formula.denominator_subtract == expected["denominator_subtract"]


def test_approved_places_measures_and_vintage() -> None:
    registry = load_registry()
    places = {
        indicator.slug: indicator
        for indicator in registry.indicators
        if indicator.source == "places"
    }

    assert {
        slug: item.formula.measure_id for slug, item in places.items()
    } == EXPECTED_PLACES_MEASURES
    assert all(item.formula.kind is FormulaKind.PLACES_MEASURE for item in places.values())
    assert all(item.formula.data_value_type_id == "CrdPrv" for item in places.values())
    assert all(
        item.vintage == "December 2025 PLACES release (2023 estimates)" for item in places.values()
    )


def test_fixed_priority_bands_and_registry_hash() -> None:
    registry = load_registry()

    assert [
        (band.label, band.minimum, band.maximum, band.includes_maximum) for band in registry.bands
    ] == [
        ("Very Low", Decimal("0"), Decimal("20"), False),
        ("Low", Decimal("20"), Decimal("40"), False),
        ("Moderate", Decimal("40"), Decimal("60"), False),
        ("High", Decimal("60"), Decimal("80"), False),
        ("Very High", Decimal("80"), Decimal("100"), True),
    ]
    assert registry.sha256 == registry_sha256()
    assert len(registry.sha256) == 64


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda text: text.replace('slug = "obesity"', 'slug = "diagnosed_diabetes"'),
            "duplicate indicator slug",
        ),
        (
            lambda text: text.replace('type = "ratio"', 'type = "invented"', 1),
            "unknown formula type",
        ),
        (
            lambda text: text.replace(
                'within_domain_weight = "0.3333333333333333333333333333"',
                'within_domain_weight = "0.5"',
                1,
            ),
            "weights must sum to 1",
        ),
        (
            lambda text: text.replace('numerator = ["B05002_013E"]', "numerator = []"),
            "requires numerator variables",
        ),
        (
            lambda text: text.replace(
                'minimum = "20"\nmaximum = "40"', 'minimum = "19"\nmaximum = "40"'
            ),
            "overlap",
        ),
    ],
)
def test_invalid_registry_is_rejected(
    tmp_path: Path,
    registry_text: str,
    mutate: Callable[[str], str],
    message: str,
) -> None:
    mutated = mutate(registry_text)
    with pytest.raises(RegistryValidationError, match=message):
        load_registry(write_registry(tmp_path, mutated))
