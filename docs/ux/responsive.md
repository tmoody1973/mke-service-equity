# Responsive Product Requirements

## Required widths

- 375
- 430
- 768
- 1024
- 1440

## Principles

- Adapt; do not shrink desktop layouts.
- No hover-only critical interactions.
- Use bottom sheets/drawers on mobile.
- Keep search prominent.
- Keep important map controls reachable.
- Preserve selection through panel changes.
- Convert comparison tables into cards on narrow screens.
- Simplify charts rather than make them unreadable.
- Do not hide essential evidence.
- Design for slower mobile connections.

## Component architecture

Responsive presentation components should consume shared feature content/contracts.

Example:

- `TractProfileSidePanel`
- `TractProfileBottomSheet`

both consume shared `TractProfileContent`.

Avoid duplicating business logic across breakpoints.

## Compare Areas

- 375, 430, and 768 pixels: summary-first stacked tract cards, separate Differences view, and
  expandable indicator evidence; no squeezed desktop table and no swipe-only essential content.
- 1024 and 1440 pixels: semantic comparison matrix with tract column headings and aligned numeric
  evidence.
- Every width retains two-to-five selection, clearly named 44-pixel add/remove controls, URL
  reload/back/forward behavior, uncertainty, missing states, and provenance.

## Opportunity Explorer

- 375, 430, and 768 pixels: keep the map visible and place filters and matching results in
  separate HeroUI Pro sheets. Preserve draft/applied state, selection, and map context across sheet
  changes, and return focus when a sheet closes.
- 1024 pixels: filters and map share the first row; the matching summary/list uses the readable
  area below instead of forcing a cramped third column.
- 1440 pixels: filters, map, and matching results use a coordinated three-column workspace.
- At every width, Apply, chip removal, and Clear all update the canonical URL, map, count,
  population summary, and non-map list together. Essential result meaning never depends on hover,
  color, or the map.

## Mobile performance

- lazy-load MapLibre where appropriate
- avoid unnecessary geometry
- reuse the bounded Atlas GeoJSON rather than duplicating polygons in Opportunity responses
- fetch tract detail only when selected
- precompute expensive spatial results
- cluster dense point layers
- cache stable content

Worst-case uncompressed budgets are 500 KB for five-tract Compare, 150 KB for geometry-free
Opportunity, and 1.1 MB for shared Atlas GeoJSON. Validated previews remain dynamic and outside
shared public caches.
