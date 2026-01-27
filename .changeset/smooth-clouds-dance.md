---
'@vercel/functions': patch
---

Fix InMemoryCache to use JSON serialization for consistency with BuildCache

InMemoryCache now serializes values with `JSON.stringify()` on set and deserializes with `JSON.parse()` on get, matching the behavior of BuildCache. This ensures consistent behavior when switching between cache implementations (e.g., in-memory for development, remote for production), particularly for types that don't survive JSON round-trips like `Date`, `Map`, `Set`, and `undefined`.
