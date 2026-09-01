# Accessibility Requirements

Target WCAG 2.2 AA where reasonably achievable.

## Required

- keyboard navigation
- visible focus states
- semantic HTML
- useful screen-reader labels
- sufficient contrast
- color not used as the only signal
- reduced-motion support
- practical touch target sizing
- no essential hover-only information

## Map accessibility

Every critical map insight must also be available in a non-map interface such as:

- tract profile
- result list
- comparison view
- textual legend

The map is an enhancement to the evidence, not the sole interface to it.

## Content accessibility

- Prefer short sentences and familiar words in navigation, labels, instructions, errors, and
  empty states.
- Keep approved method names exact, then explain them in plain language where they appear.
- Introduce GEOID as “Census tract ID” in the public interface.
- Explain score contributions as points relative to the county midpoint; do not present them as
  raw percentages, change over time, causes, or recommendations.
- Describe limited English proficiency as English-language access, not literacy.
- Say when information is unavailable, suppressed, conflicting, or not tied to the run. Never let
  missing information sound like zero.

## Compare and Opportunity

- Compare uses a semantic table at desktop widths and ordered cards on narrow widths over the same
  evidence contract. No essential comparison requires horizontal swiping.
- Add/remove controls, indicator accordions, filters, applied chips, Clear all, result selection,
  and selected-profile controls must be fully keyboard operable with visible focus and useful
  names.
- Mobile Opportunity filters and results use HeroUI Pro sheets with initial focus, focus
  containment, Escape close, and focus return to the opening control. Opening or closing a sheet
  must not discard pending filters, applied filters, result selection, or map context.
- Applying conditions announces the changed filter/result state politely without rereading the
  complete result list.
- Interactive Analyze controls use practical 44-pixel targets. Reduced motion and forced colors
  retain every essential state, and Priority, band, reliability, selection, match, missing-data,
  and preview status always include text rather than color alone.
- Opportunity's non-map list exposes every matching tract and the same selection action as the
  map. MapLibre never becomes the sole route to a count, population meaning, quality state, tract
  label, or detailed evidence.

The verified matrix covers Compare and Opportunity at 375×812, 430×932, 768×1024, 1024×900, and
1440×1000 with keyboard flows, focus checks, no horizontal overflow, reduced motion, forced
colors, and zero axe WCAG A/AA violations. The separate production fail-closed matrix also
requires zero browser console and page errors.
