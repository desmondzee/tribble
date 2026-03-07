# Geolocation Stack Research Report

**Date:** 2026-03-07  
**Purpose:** Due diligence for conflict-intelligence geolocation subsystem

---

## 1. Repos and Sources Reviewed

### 1.1 mordecai3

| Field | Value |
|-------|-------|
| **URL** | https://github.com/ahalterman/mordecai3 |
| **Purpose** | Neural geoparsing and event geocoding — toponym recognition + resolution to Geonames |
| **License** | MIT |
| **Safe to copy** | Yes — MIT permits use, modification, distribution |
| **Key concepts** | spaCy NER for place names, neural ranking for disambiguation, Geonames gazetteer, Elasticsearch indexing |
| **Relevant modules** | Toponym extraction, candidate resolution, disambiguation scoring |
| **Treatment** | Inspiration + patterns; reimplement from ideas. Do not copy verbatim without attribution. |
| **Setup complexity** | High — requires Elasticsearch, Geonames dump, spaCy models |
| **Takeaways** | (1) Separate extraction and resolution stages. (2) Use gazetteer for candidates. (3) Disambiguation needs context (country, admin, co-mentions). (4) 94% accuracy on Geonames resolution. |

---

### 1.2 osint-geo-extractor (conflict-investigations)

| Field | Value |
|-------|-------|
| **URL** | https://github.com/conflict-investigations/osint-geo-extractor |
| **Purpose** | Extract geo info from conflict DBs (Bellingcat, Cen4InfoRes, DefMon3, GeoConfirmed, Texty.org.ua) |
| **License** | MIT (per GitHub API) |
| **Safe to copy** | Yes |
| **Key concepts** | Querying pre-geocoded conflict databases, GeoJSON output |
| **Relevant modules** | Data source adapters, GeoJSON serialization |
| **Treatment** | Inspiration for data-source patterns; we build our own extraction pipeline |
| **Setup complexity** | Low — Python library |
| **Takeaways** | Conflict-specific sources exist; we can add similar adapters later. Focus on text→location first. |

---

### 1.3 media-search-engine (conflict-investigations)

| Field | Value |
|-------|-------|
| **URL** | https://github.com/conflict-investigations/media-search-engine |
| **Purpose** | Search geolocations for social media posts in Bellingcat, Cen4InfoRes, etc. |
| **License** | **Not specified** (license: null in GitHub API) |
| **Safe to copy** | **Unclear** — no explicit license means "all rights reserved" by default |
| **Key concepts** | Media post geolocation search, Leaflet mapping |
| **Treatment** | **Reference only** — do not copy code. Use only for understanding workflows. |
| **Setup complexity** | Medium |
| **Takeaways** | Media-centric geolocation is a separate use case; our pipeline is article/report-centric. |

---

### 1.4 Pelias

| Field | Value |
|-------|-------|
| **URL** | https://github.com/pelias/api |
| **Purpose** | Open-source geocoding API (HTTP) |
| **License** | MIT |
| **Safe to copy** | Yes |
| **Key concepts** | Geocoding API, Who's On First, OpenStreetMap, Geonames data |
| **Relevant modules** | API design, query structure |
| **Treatment** | Use as optional geocoding service (self-hosted or public instance). Do not embed. |
| **Setup complexity** | High — full geocoding stack |
| **Takeaways** | Pelias can be a fallback geocoder. Prefer GeoNames API + WOF for our pipeline. |

---

### 1.5 Who's On First (whosonfirst-data)

| Field | Value |
|-------|-------|
| **URL** | https://github.com/whosonfirst-data/whosonfirst-data |
| **Purpose** | Gazetteer of places — admin hierarchy, centroids, polygons |
| **License** | CC-BY or CC0 (varies by record; see sources list) |
| **Safe to copy** | Yes — with attribution |
| **Key concepts** | Admin hierarchy (admin0, admin1, admin2), place types, alternate names |
| **Treatment** | Use as data source via API or downloaded subset. Attribute. |
| **Setup complexity** | High for full dataset; use API or small extracts |
| **Takeaways** | Admin-aware matching is critical. WOF has rich hierarchy. |

---

### 1.6 GeoNames

| Field | Value |
|-------|-------|
| **URL** | https://www.geonames.org/ |
| **Purpose** | Place names database, web services API |
| **License** | Creative Commons Attribution 4.0 (CC-BY 4.0) |
| **Safe to copy** | Yes — with attribution |
| **Key concepts** | Search, hierarchy, alternate names, country/admin codes |
| **Treatment** | Primary gazetteer for candidate generation |
| **Setup complexity** | Low — REST API; free tier available |
| **Takeaways** | Use search API with country/admin filters. Handle rate limits. |

---

### 1.7 Mapbox

| Field | Value |
|-------|-------|
| **URL** | https://docs.mapbox.com/mapbox-gl-js/example/cluster/, Geocoding API |
| **Purpose** | Map rendering, clustering, optional geocoding fallback |
| **License** | Mapbox ToS (proprietary) |
| **Safe to copy** | Use via API/SDK per ToS |
| **Key concepts** | Cluster HTML, GeoJSON, map rendering |
| **Treatment** | Frontend only; optional geocoding fallback |
| **Takeaways** | Clustering and GeoJSON patterns for rendering. Confidence-aware styling. |

---

### 1.8 Ushahidi Platform

| Field | Value |
|-------|-------|
| **URL** | https://github.com/ushahidi/platform |
| **Purpose** | Crisis mapping platform |
| **License** | **AGPL v3** |
| **Safe to copy** | **No** — AGPL requires source disclosure for network use |
| **Treatment** | **Reference only** — do not copy. Inspect for UX/workflow ideas only. |
| **Takeaways** | Crisis mapping patterns; our implementation is from scratch. |

---

## 2. Implementation Takeaways (Summary)

1. **Pipeline stages:** Ingestion → Extraction → Candidate resolution → Disambiguation scoring → Output
2. **Gazetteers:** GeoNames (primary), Who's On First (optional), Mapbox (fallback)
3. **Disambiguation signals:** Country consistency, admin hierarchy, co-mentioned places, "near X" cues, transliteration, specificity
4. **Output:** Confidence score, precision level, needs_human_review, provenance
5. **Rendering:** Point vs centroid+radius vs fuzzy based on confidence
6. **Licenses:** MIT/CC-BY safe; AGPL and unlicensed = reference only

---

## 3. Cloning Status

Cloning into `research/external/` failed in sandbox (git hooks permission). Run manually:

```bash
cd research/external
git clone --depth 1 https://github.com/ahalterman/mordecai3.git
git clone --depth 1 https://github.com/conflict-investigations/osint-geo-extractor.git
git clone --depth 1 https://github.com/conflict-investigations/media-search-engine.git
git clone --depth 1 https://github.com/pelias/api.git pelias-api
```

Then inspect each `LICENSE` or `LICENSE*` file before any use.
