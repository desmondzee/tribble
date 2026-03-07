# Third-Party Notices

This document lists third-party software, data sources, and concepts used or referenced by the Tribble geolocation subsystem.

## Code and Concepts (Inspiration Only)

The following projects were reviewed for patterns and ideas. **No code was copied verbatim.** Our implementation is a clean reimplementation from specifications and published patterns.

| Project | License | Use |
|---------|---------|-----|
| [mordecai3](https://github.com/ahalterman/mordecai3) | MIT | Neural geoparsing patterns: extraction → resolution → disambiguation. Gazetteer-based candidate resolution. |
| [osint-geo-extractor](https://github.com/conflict-investigations/osint-geo-extractor) | MIT | Conflict database integration patterns, GeoJSON output. |
| [pelias/api](https://github.com/pelias/api) | MIT | Geocoding API design, optional fallback provider. |
| [whosonfirst-data](https://github.com/whosonfirst-data/whosonfirst-data) | CC-BY / CC0 | Gazetteer data; integration patterns. |

## Reference Only (Not Copied)

| Project | License | Reason |
|---------|---------|--------|
| [Ushahidi platform](https://github.com/ushahidi/platform) | AGPL v3 | Copyleft; not suitable for proprietary use. Reference only. |
| [media-search-engine](https://github.com/conflict-investigations/media-search-engine) | Not specified | No explicit license; treated as all-rights-reserved. Inspiration only. |

## External Services

| Service | Terms | Use |
|---------|-------|-----|
| [GeoNames](https://www.geonames.org/) | CC-BY | Place search API for candidate resolution. Requires free username. |
| [Mapbox](https://www.mapbox.com/) | Mapbox ToS | Geocoding fallback (optional), map rendering. |

## Data and APIs

- **GeoNames**: Used via REST API. Attribution: [geonames.org](https://www.geonames.org/).
- **Who's On First** (optional): Open gazetteer data; various CC licenses per dataset.

---

*Last updated: 2026-03-07*
