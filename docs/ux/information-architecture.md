# Information Architecture

## Top-level navigation

### Explore
- Atlas

### Analyze
- Compare Areas
- Opportunity Explorer

### Learn
- Methodology
- Data Sources
- About

## Primary product loop

Explore
→ Select
→ Understand
→ Compare
→ Investigate
→ Export / Act

## Analyze routes and handoffs

- `/analyze/compare` is a focused, map-free reading route for two to five census tracts. **Compare
  this tract** hands the selected Atlas tract into this route through one repeated `tract` URL
  parameter; the reader adds at least one more tract with the shared tract/neighborhood search.
- `/analyze/opportunity` is a planning-conditions route with a map and complete non-map matching
  list. Only **Apply filters**, chip removal, or **Clear all** changes the canonical URL and server
  result. Opening a sheet, selecting a result, or editing pending controls does not silently change
  analytical conditions.

Compare URLs preserve ordered tract selection. Opportunity URLs preserve only normalized applied
conditions. Neither URL stores a score-run identity or private preview configuration.

## Analyze result meaning

Compare explains consistent evidence and substantial deterministic differences; it does not pick
a winner. Opportunity returns **matching areas** in canonical name/tract-ID order, not a relevance
or need ranking. Its population total means known population living in matching tracts, with
unavailable population and missing filter data reported separately.

Food sites, public land, and public investment remain context outside Opportunity filtering.
Export remains Plan 6 work. No Analyze route recommends an intervention, decides funding, or uses
AI to calculate or explain a result.

## Key UX principles

- A user should move from seeing a priority area to understanding why in no more than two interactions.
- A user should compare areas without GIS terminology.
- Every analytical workflow must work on a smartphone.
- Every substantive metric should expose provenance within one additional interaction.
- Use **matching areas**, not **recommended areas**, unless a future explicit recommendation methodology is approved.
