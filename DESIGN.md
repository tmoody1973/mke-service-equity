---
name: MKE Service Equity
description: A restrained civic evidence workspace built in HeroUI Pro Operate mode.
colors:
  civic-canvas: "oklch(97.02% 0 0)"
  panel-white: "oklch(100% 0 0)"
  evidence-ink: "oklch(21.03% 0.0059 285.89)"
  muted-ink: "oklch(55.17% 0.0138 285.94)"
  selected-neutral: "oklch(94% 0.001 286.375)"
  divider: "oklch(92% 0.004 286.32)"
  focus-blue: "oklch(62.04% 0.195 253.83)"
  map-neutral: "#e8e6df"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
rounded:
  base: "0.5rem"
  panel: "1rem"
spacing:
  unit: "0.25rem"
  compact: "0.5rem"
  control: "0.75rem"
  panel: "1rem"
components:
  status-panel:
    backgroundColor: "{colors.civic-canvas}"
    textColor: "{colors.evidence-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 1rem"
  navigation-trigger:
    size: "44px"
---

# Design System: MKE Service Equity

## Overview

**Creative North Star: “The Civic Evidence Workspace”**

The shipped visual world is HeroUI Pro **Operate** mode: quiet civic neutrals, compact system typography, one primary navigation, and a dominant geographic workspace. It is deliberately restrained so the interface frames inspectable evidence without implying conclusions or inventing brand decoration.

Plan 1 is intentionally data-free. Its neutral map, controls, attribution, and plain-language availability message establish the composition without fabricating geography, analytical layers, or source data.

**Key Characteristics:**

- Map-first, information-dense without becoming dashboard-like.
- Semantic project aliases over numbered palette utilities.
- Plain-language data quality and publication states remain visible.
- HeroUI Pro supplies interaction behavior; project CSS supplies only focused civic constraints.

## Colors

The palette is nearly monochrome: warm-neutral canvas and map fields, white panels, dark evidence text, subtle separators, and blue reserved for focus and established interactive emphasis.

### Primary

- **Focus Blue** (`oklch(62.04% 0.195 253.83)`): visible focus outlines and HeroUI accent behavior; it is not decorative fill.

### Neutral

- **Civic Canvas** (`oklch(97.02% 0 0)`): application shell background.
- **Panel White** (`oklch(100% 0 0)`): sidebar and HeroUI surface roles.
- **Evidence Ink** (`oklch(21.03% 0.0059 285.89)`): primary text and control marks.
- **Muted Ink** (`oklch(55.17% 0.0138 285.94)`): secondary HeroUI text states.
- **Selected Neutral** (`oklch(94% 0.001 286.375)`): current navigation item.
- **Divider** (`oklch(92% 0.004 286.32)`): shell and status boundaries.
- **Map Neutral** (`#e8e6df`): the data-free MapLibre background only, not a general UI surface.

### Named Rules

**The Evidence-Before-Emphasis Rule.** Keep most of the viewport neutral. Use accent color for interaction and focus, never to imply a score, priority, or recommendation that the data does not establish.

## Typography

**Display Font:** None in the shipped shell.
**Body Font:** HeroUI/Tailwind system sans (`ui-sans-serif, system-ui, sans-serif`).

**Character:** Compact, direct, and administrative without feeling bureaucratic. Weight and a small size shift create hierarchy; there is no ornamental display face.

### Hierarchy

- **Title** (600, 14px/20px): product name, Atlas title, and current navigation label. The desktop brand uses `-0.01em` tracking.
- **Body** (400, 14px/20px): concise status and data-state copy.
- **Label** (500, 12px/16px): the mobile product identifier above the Atlas title.
- **Page heading:** present as an `h1` for assistive technology and visually hidden in this map-first view.

### Named Rules

**The Quiet Hierarchy Rule.** Establish orientation with 12px and 14px text plus medium or semibold weight; do not introduce oversized display typography into the operational shell.

## Layout

The shell fills `100dvh` and gives the map all space not used by navigation. At 769px and wider, a persistent 240px HeroUI Pro Sidebar sits beside flexible main content; there is no desktop collapse control or duplicate workspace title bar. At 768px and below, navigation moves into the built-in off-canvas Sheet (80vw, maximum 500px), while a 56px header is used at 375/430 and a 64px header at 768. The map height is the dynamic viewport minus that header.

Spacing follows HeroUI's 4px base unit. The shipped shell repeatedly uses 8px, 12px, and 16px gaps and insets. The status panel is inset 12px on narrow screens, moves to 16px from the left from 640px, and is capped at 28rem. Map controls sit 12px from the top and right; bottom attribution clears the mobile status panel and returns to a 12px bottom inset from 640px.

The map is the sole dominant region. Navigation orients; the map visualizes; the status panel explains publication state. Do not split this first viewport into a grid of cards.

## Elevation & Depth

The visible Plan 1 shell is flat by default. Separation comes from tonal fields and 1px divider borders; the status panel is explicitly border-only with no project shadow. HeroUI's overlay shadow and blurred backdrop remain available to its off-canvas mobile Sheet, where temporary elevation has semantic purpose.

### Named Rules

**The Flat Evidence Rule.** Keep persistent evidence surfaces flat. Reserve library-owned overlay depth for transient navigation and other true overlays.

## Shapes

The form language is softly rounded and restrained. The project panel radius is 16px and is used by the floating status; HeroUI's 8px base radius governs ordinary component geometry. The current navigation item is pill-like, while the mobile Sheet remains edge-aligned with square outer corners. Borders are thin dividers, not decorative frames.

## Components

### Navigation

- **Desktop:** persistent 240px HeroUI Pro Sidebar, white panel, single current `Atlas` item, and no rail or collapse trigger.
- **Mobile:** a minimum 44×44px trigger opens the built-in off-canvas Sidebar Sheet with blurred backdrop; the sheet owns Escape dismissal and focus return.
- **Semantics:** one `Primary` navigation landmark, current-page text for assistive technology, and one main landmark at `#map-workspace`.

### Map Workspace

- **Composition:** an absolutely filled MapLibre canvas with zoom controls at top right, visible attribution at bottom right, and no browser-owned analytical calculations.
- **Data state:** a concise `role="status"` panel overlays the lower map. It uses Civic Canvas, evidence ink, a divider border, 16px radius, 12px/16px padding, and no shadow.
- **Empty foundation:** the neutral canvas is a deliberate no-data state; do not fabricate basemap detail, operational layers, coordinates, or classifications.

### Focus and Touch

- **Focus:** all focusable elements receive a 3px Focus Blue outline with a 3px offset.
- **Touch:** navigation triggers and MapLibre controls meet the 44px minimum target.
- **Skip navigation:** the skip link is visually hidden off-canvas until focused, then enters the map workspace.

### Motion

Project code adds no decorative motion. The HeroUI Pro mobile Sheet uses its shipped transition and reduces transition/animation duration to effectively zero under `prefers-reduced-motion: reduce`. Future project-owned motion must honor the same preference.

## Do's and Don'ts

### Do:

- **Do** reuse `--mke-canvas`, `--mke-panel`, `--mke-text`, `--mke-muted`, `--mke-accent`, and `--mke-focus` so HeroUI remains the semantic source of truth.
- **Do** keep uncertainty, missing data, and publication state explicit in short public-facing copy.
- **Do** preserve keyboard focus, semantic landmarks, visible attribution, 44px targets, and behavior at 375, 430, 768, 1024, and 1440px.
- **Do** keep geographic visualization in MapLibre while PostGIS/Python owns analytical spatial work.

### Don't:

- **Don't** invent decorative colors, imagery, data layers, claims, scores, recommendations, or placeholder source data.
- **Don't** turn the shell into a wall of dashboard cards or add duplicate desktop/mobile navigation models.
- **Don't** hide MapLibre attribution behind status content or allow controls to overlap the mobile reading path.
- **Don't** add custom shadows or motion to persistent surfaces when borders, tone, and placement already establish hierarchy.

Finish-review provenance: the follow-up Impeccable review of the shipped 375px and 1440px captures was recorded on 2026-08-27 with disposition **ship** and remaining issues **clear**. It confirmed mobile orientation, public-facing empty-state copy, the border-only status treatment, visible neutral MapLibre canvas/controls/attribution, and—after the final fix—attribution visible above the status within the 375px viewport.
