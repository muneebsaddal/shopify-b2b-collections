# Today's Collections Design Specification

**Concept:** `todays-collections-concept.png`
**Created:** 2026-07-15 with the built-in image-generation workflow
**Surface:** authenticated embedded app home plus development preview

## Composition

- Shopify supplies the outer Admin shell; the application renders the page
  header, reconciliation rail, summary, aging buckets, filters, collections
  table, and selected-company detail rail.
- Desktop uses a fluid table with a 360-pixel detail rail. At narrow widths the
  rail moves below the queue and the table becomes horizontally scrollable.
- The table/list is the primary container. Avoid converting rows into cards.

## Design tokens

- Background: true white `#ffffff`; secondary surface `#f7f8f8`.
- Text: `#1a1d1f`; muted `#61676d`; border `#d9dcdf`.
- Success/reconciled/action: `#008060`; success surface `#e4f4ed`.
- Attention: `#b98900`; attention surface `#fff3d6`; critical `#c5280c`.
- Selected row: `#eef5ff` with `#2c6ecb` outline.
- Radius: 8px sections and controls, 6px small controls.
- Type: Shopify Inter/system sans; 13-14px chrome/table, 16-18px section
  headings, 28px page heading.

## Components and interactions

- Reconciliation status and time are always visible above monetary summaries.
- Money is rendered with an adjacent currency code and is never summed across
  currencies.
- Filters update the visible queue locally; selected state remains explicit.
- Row selection updates the detail rail.
- Add note, Record promise, Snooze, and Send approved reminder produce a visible
  local confirmation in the F1 preview; persistence arrives in R3/R5/M3.
- Pause automation has a clear destructive-safety hierarchy but remains a local
  preview interaction in F1.

## Allowed first-viewport copy

Today's collections; Fully reconciled; Last reconciled 8 minutes ago; Total
outstanding; Overdue; Due soon; Recently paid; Current; 1-30; 31-60; 61-90;
90+; Company; Status; Currency; Age; Pause automation; Add note; Record promise;
Snooze; Send approved reminder; Preview data.

## Icons

Use small production SVGs only where meaning benefits: check/reconciled, pause,
refresh, close, note, calendar/promise, clock/snooze, and send. Use consistent
1.75px rounded strokes and `currentColor`.

## Verification

The implementation was directly inspected beside the concept at its native
1536x1024 desktop viewport and at 390x844 mobile. Layout, typography, palette,
table density, selected state, rail, and action hierarchy match the concept.
Shopify Admin's outer navigation/search chrome is intentionally not duplicated
inside the iframe. The no-auth route adds only the approved `Preview data`
label. No material mismatch remains.
