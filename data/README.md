# Data boundary

Raw downloads, normalized extracts, generated reports, and other derived data
remain local and are ignored by Git. Plan 2 may create files beneath
`data/raw/`, `data/normalized/`, and `data/reports/`, but those files must not be
committed.

Small source manifests may be committed beneath `data/manifests/`. A manifest
records provenance and integrity metadata only: source identity, source URL,
retrieval time, source vintage, content hash, byte size, and licensing notes. It
must never contain source records, credentials, or an API key.

The project's MIT License covers original project code and documentation. It
does not relicense Census TIGER/Line, American Community Survey, CDC PLACES, or
any other source dataset. Every source retains its own terms, which must be
captured in its manifest before normalized values can be published.
