# Common Pipeline Workspace

This package contains deterministic infrastructure shared by analytical pipelines:

- pipeline-scoped immutable snapshot and manifest storage;
- secret-safe, bounded HTTP acquisition;
- run hashing, idempotency, redaction, and timestamp primitives.

Domain-specific source validation, normalization, spatial calculations, and scoring remain in
their owning pipeline. A shared primitive cannot select a source, change methodology, or silently
move artifacts between pipeline namespaces.
