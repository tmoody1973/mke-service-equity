"""Bounded HTTP acquisition with deterministic retry behavior."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Protocol, cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pipelines.equity_baseline.artifacts import sanitize_url
from pipelines.equity_baseline.errors import HttpFetchError, ResponseSchemaError

BACKOFF_SECONDS = (1.0, 2.0, 4.0)
MAX_RETRIES = len(BACKOFF_SECONDS)


class ReadableResponse(Protocol):
    """Minimal response interface used by the acquisition boundary."""

    def __enter__(self) -> ReadableResponse: ...

    def __exit__(self, *args: object) -> object: ...

    def read(self) -> bytes: ...


Opener = Callable[[Request], ReadableResponse]
Validator = Callable[[bytes], None]
Sleeper = Callable[[float], None]


def _default_opener(request: Request) -> ReadableResponse:
    return cast(ReadableResponse, urlopen(request, timeout=30))


def fetch_bytes(
    url: str,
    *,
    opener: Opener = _default_opener,
    sleeper: Sleeper = time.sleep,
    validator: Validator | None = None,
    retries: int = MAX_RETRIES,
) -> bytes:
    """Fetch exact response bytes with at most three transient retries."""

    if retries < 0 or retries > MAX_RETRIES:
        raise ValueError(f"retries must be between 0 and {MAX_RETRIES}")
    safe_url = sanitize_url(url)
    request = Request(url, headers={"User-Agent": "mke-service-equity/1"})
    last_error: OSError | None = None

    for attempt in range(retries + 1):
        try:
            with opener(request) as response:
                content = response.read()
            if validator is not None:
                validator(content)
            return content
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


__all__ = ["HttpFetchError", "ResponseSchemaError", "fetch_bytes"]
