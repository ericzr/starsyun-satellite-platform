# Global Sensor Filter Research

## Scope

This note evaluates the sensor selector shown by the reference image and the
current StarSyun product model. It is intentionally a design decision record;
the sensor selector is not changed by the current filter update.

Reference reviewed: [nmgwxyy.cn/imageSearch](https://nmgwxyy.cn/imageSearch).

## What is worth keeping

The reference site uses three useful layers:

1. A small top-level family switch such as optical, thermal infrared,
   hyperspectral, SAR and other.
2. Expandable resolution groups so the first screen stays compact.
3. Checkboxes for concrete satellite and payload combinations.

This is efficient when one provider owns a relatively stable domestic catalog.
It makes it easy to answer “which sensor can satisfy this requirement?” without
forcing users to read a long flat list.

## Why StarSyun should not copy it literally

StarSyun aggregates providers with different vocabularies and metadata quality.
The same instrument can be described as a payload, camera, collection,
product family or provider SKU. Resolution is also not a safe grouping key for
SAR, thermal, hyperspectral and video products. A global selector that exposes
raw supplier names at the top level will become inconsistent as providers are
added.

The current `Product` model already has normalized `dataType`, `satelliteId`,
`provider`, `resolution`, `bands` and processing fields, but it does not yet
have a canonical sensor-family, payload or provider-alias table. That mapping
should exist before adding a global sensor UI.

## Recommended StarSyun design

### First layer: normalized sensor family

Use stable, provider-neutral families:

- Optical / panchromatic
- Multispectral
- Hyperspectral
- Thermal infrared
- SAR
- LiDAR / altimetry
- Video / moving target
- Other / unknown

Keep the family selection multi-select and make the default “any”. Do not make
resolution tabs the primary navigation because a 1 m optical product and a 1 m
SAR product are not interchangeable.

### Second layer: optional capability facets

Show only after a family is selected:

- Native resolution range
- Spectral or polarization capability
- Acquisition mode (strip, stereo, spotlight, scan, video)
- Processing level
- Archive versus tasking availability

These are more portable across suppliers than a supplier-specific sensor name.

### Third layer: supplier and payload details

Provide searchable, virtualized checkboxes for satellite, payload and provider.
Each option should carry a canonical ID, display names, aliases, family,
resolution range and availability. The UI should display the current language
label but retain the canonical ID for queries.

## Data contract to implement later

Add a catalog-owned mapping, separate from product records:

```text
sensor_families(id, canonical_key, display_names)
sensor_payloads(id, family_id, canonical_name, aliases, provider_id,
                resolution_min_m, resolution_max_m, capabilities)
provider_sensor_aliases(provider_id, alias, payload_id)
```

Products should reference `payload_id` when a supplier response can be mapped;
unmapped products remain searchable under their normalized family and are never
hidden. A mapping audit should report unknown aliases for manual review.

## Query and UI recommendation

Use a compact family segmented control, followed by collapsible capability
sections and a searchable payload/provider list. Keep the currently selected
filters visible as removable chips. Do not render hundreds of checkboxes at
once. The API should accept canonical IDs and return the matched supplier
metadata so the result card can explain why a product matched.

## Decision requested before implementation

Confirm the family taxonomy and whether “LiDAR / altimetry” and “Video” should
be first-class families in the initial release. After confirmation, implement
the mapping table and selector in that order; importing raw supplier names
without this normalization would recreate the mixed, duplicated administrative
data problem in the sensor catalog.
