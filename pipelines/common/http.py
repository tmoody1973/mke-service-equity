"""Shared bounded HTTP acquisition with deterministic retry behavior."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType
from typing import Protocol, cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pipelines.common.artifacts import sanitize_url

BACKOFF_SECONDS = (1.0, 2.0, 4.0)
MAX_RETRIES = len(BACKOFF_SECONDS)


class HttpFetchError(Exception):
    """Raised when a bounded HTTP fetch cannot complete."""


class ResponseSchemaError(ValueError):
    """Raised when fetched bytes do not match a source schema."""


class ReadableResponse(Protocol):
    def __enter__(self) -> ReadableResponse: ...

    def __exit__(self, *args: object) -> object: ...

    def read(self, amount: int = -1) -> bytes: ...


Opener = Callable[[Request], ReadableResponse]
Validator = Callable[[bytes], None]
Sleeper = Callable[[float], None]


@dataclass(frozen=True, slots=True)
class FetchedBytes:
    """Exact response bytes plus explicitly requested source headers."""

    content: bytes
    headers: Mapping[str, str]


def _default_opener(request: Request) -> ReadableResponse:
    return cast(ReadableResponse, urlopen(request, timeout=30))


def _fetch(
    url: str,
    *,
    opener: Opener = _default_opener,
    sleeper: Sleeper = time.sleep,
    validator: Validator | None = None,
    retries: int = MAX_RETRIES,
    max_bytes: int | None = None,
    required_headers: Sequence[str] = (),
) -> FetchedBytes:
    if retries < 0 or retries > MAX_RETRIES:
        raise ValueError(f"retries must be between 0 and {MAX_RETRIES}")
    if max_bytes is not None and max_bytes <= 0:
        raise ValueError("max_bytes must be positive when provided")
    safe_url = sanitize_url(url)
    request = Request(url, headers={"User-Agent": "mke-service-equity/1"})
    last_error: OSError | None = None
    for attempt in range(retries + 1):
        try:
            with opener(request) as response:
                content = response.read() if max_bytes is None else response.read(max_bytes + 1)
                response_headers = getattr(response, "headers", None)
                retained_headers: dict[str, str] = {}
                for name in required_headers:
                    value = response_headers.get(name) if response_headers is not None else None
                    if not isinstance(value, str) or not value.strip():
                        raise HttpFetchError(
                            f"response is missing required {name} header for {safe_url}"
                        )
                    retained_headers[name.casefold()] = value.strip()
            if max_bytes is not None and len(content) > max_bytes:
                raise HttpFetchError(f"response exceeds {max_bytes} bytes for {safe_url}")
            if validator is not None:
                validator(content)
            return FetchedBytes(content, MappingProxyType(retained_headers))
        except HTTPError as error:
            if error.code < 500 or error.code > 599:
                raise HttpFetchError(f"HTTP {error.code} fetching {safe_url}") from error
            last_error = error
        except (URLError, TimeoutError, ConnectionError, OSError) as error:
            last_error = error
        if attempt < retries:
            sleeper(BACKOFF_SECONDS[attempt])
    if last_error is None:
        raise AssertionError("fetch exhausted retries without a recorded error")
    raise HttpFetchError(
        f"fetch failed after {retries + 1} attempts for {safe_url}"
    ) from last_error


def fetch_bytes(
    url: str,
    *,
    opener: Opener = _default_opener,
    sleeper: Sleeper = time.sleep,
    validator: Validator | None = None,
    retries: int = MAX_RETRIES,
    max_bytes: int | None = None,
) -> bytes:
    """Fetch exact response bytes with at most three transient retries."""

    return _fetch(
        url,
        opener=opener,
        sleeper=sleeper,
        validator=validator,
        retries=retries,
        max_bytes=max_bytes,
    ).content


def fetch_bytes_with_headers(
    url: str,
    *,
    required_headers: Sequence[str],
    opener: Opener = _default_opener,
    sleeper: Sleeper = time.sleep,
    validator: Validator | None = None,
    retries: int = MAX_RETRIES,
    max_bytes: int | None = None,
) -> FetchedBytes:
    """Fetch bytes and fail when approved provenance headers are absent."""

    if not required_headers or any(not name.strip() for name in required_headers):
        raise ValueError("required_headers must contain non-empty header names")
    return _fetch(
        url,
        opener=opener,
        sleeper=sleeper,
        validator=validator,
        retries=retries,
        max_bytes=max_bytes,
        required_headers=required_headers,
    )


__all__ = [
    "FetchedBytes",
    "HttpFetchError",
    "ResponseSchemaError",
    "fetch_bytes",
    "fetch_bytes_with_headers",
]
