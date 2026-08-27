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

## Mobile performance

- lazy-load MapLibre where appropriate
- avoid unnecessary geometry
- fetch tract detail only when selected
- precompute expensive spatial results
- cluster dense point layers
- cache stable content
