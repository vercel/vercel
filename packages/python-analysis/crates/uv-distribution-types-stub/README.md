# uv-distribution-types-stub

Minimal local stub for the `uv-distribution-types` crate from [uv](https://github.com/astral-sh/uv),
stripped to only the types needed by `uv-requirements-txt`.

- `Requirement` -- wrapper around `uv_pep508::Requirement<VerbatimParsedUrl>`
- `UnresolvedRequirement` -- enum (Named or Unnamed) for parsed requirements
- `UnresolvedRequirementSpecification` -- requirement with optional hashes

These types are used internally by `uv-requirements-txt` to represent parsed
requirements. The full upstream crate includes resolution, installation, and
distribution logic — all removed here.

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-distribution-types).

Copyright (c) Astral Software Inc. Licensed under Apache-2.0 OR MIT.
