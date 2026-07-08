# editor3 → Tiptap migration log

Running log of the migration (plan: `superdesk-tiptap-migration-plan.md`,
prepared 2026-07-07). Each entry records what landed, how it was verified,
and any deliberate deviations. Companion documents in this directory:
`draft-js-fork-audit.md`, `react-upgrade-notes.md`.

**Guiding principle throughout: editor3 is the oracle.** Wherever output
could drift (`body_html`, `annotations`, plain text, paste behavior), the
new code is tested for byte-identical results against editor3 running in
the same test suite — not against hand-written expectations alone.

---

## Phase 1 — Foundation (`8963f13d0`, 2026-07-07)

- `schema.ts`: ProseMirror schema mirroring the Draft.js content model.
  Deliberate divergences from stock Tiptap: blockquote/codeBlock hold
  inline content directly (a Draft.js block is a flat run of styled
  text); table cells hold arbitrary blocks (a cell was a nested content
  state). Highlight marks (`<KEY>-<n>`) carry comments/annotations/
  suggestions; payloads live in a `customData` doc-attribute sidecar
  (`highlightsData`, `lastHighlightIds`, resolved histories,
  `__PUBLIC_API__comments`) — the equivalent of editor3's first-block
  data.
- `from-draftjs.ts`: `RawDraftContentState → PM JSON` converter — the
  lazy-migration workhorse. Ranges decoded in Unicode code points (as
  Draft.js measures them), list depth nesting per the HTML-export rule,
  `\n` → hardBreak, all six atomic entities (MEDIA, EMBED, TABLE,
  MULTI-LINE_QUOTE, CUSTOM_BLOCK, ARTICLE_EMBED), table-like entities
  reading block data over entity data (as `helpers/table.tsx` did).
- `to-html.ts`: PM → HTML serializer with **byte parity** against
  `editor3StateToHtml` — a faithful port of draft-js-export-html@1.3.3's
  MarkupGenerator (style nesting order bold→…→superscript, 2-space list
  indentation, whitespace/nbsp preservation, `<p><br></p>` trimming) and
  editor3's AtomicBlockParser (media figures with EMBED START/END
  comments, embed blocks, thead/tbody tables, per-cell serialization
  scopes with their own annotation numbering).
- Golden tests: fixtures harvested from `editor3/html/tests/to-html.spec.ts`
  assert both pipelines against the same literals *and* each other.

Verification: typecheck, lint, full karma suite (996 specs → all green).

Known deliberate deviations: adjacent identical links merge into one
`<a>`; colliding highlight styleNames from table-cell content are dropped
from the sidecar (annotation ids are positional, output unaffected).

## Phase 1 — HTML importer (`e998bb89b`, 2026-07-07)

`from-html.ts` replaces editor3's `getContentStateFromHtml` (paste path,
HTML fields) using ProseMirror's schema-driven DOMParser instead of
editor3's private-use-character marker hacks. Ports all pre-processing:
docs-soap for Google Docs, internal draft-table cleanup, EMBED START/END
comment handling with associations, pruning of iframes/scripts/figures/
tables/media into placeholder markers resolved to atomic nodes after
parsing, CSS-fingerprint recognition of custom tag spans (sharing
`getStyleFingerprints` with editor3, now exported there).

Draft.js `convertFromHTML` text semantics were established **empirically**
(a diagnostic spec ran editor3's importer in the browser) and replicated:
empty `<p></p>` dropped but `<p><br></p>` kept; "loose" inline runs
(outside any draft-block element — div *is* a draft block) edge-trimmed;
`&nbsp;`→space, CR stripped; multiple spaces preserved (the Sourcefabric
fork disabled draft's in-block trim). PM parsing uses
`preserveWhitespace: true`, which matches draft's in-block behavior.

Verification: structural specs mirroring editor3's from-html suite plus
**round-trip parity** — both importers feed the same HTML and must
serialize back byte-identically, including editor3's 78 KB Google Docs
snapshot fixture.

Intentional improvements over editor3's importer (documented in specs):
attachment links survive import (editor3 dropped them); `.media-block`
internal paste becomes a renderable embed (editor3 produced a MEDIA
entity its own serializer crashed on).

## Phase 1 — Fork audit (`cd54b2281`, 2026-07-07)

`draft-js-fork-audit.md`: the `@sourcefabric/draft-js` fork was diffed
against `facebook/draft-js` at the git merge base (upstream `85764327`,
just after v0.11.5). **The entire source delta is one file** —
`convertFromHTMLToContentBlocks.js`: sub/sup import, no trimming of
pasted text, no leading-line-feed strip (MSWord Mac). The persisted
`draftjsState` format is bit-identical to stock Draft.js, retiring the
plan's "unknown fork patches" risk for the converter and serializer. All
three import patches were already reproduced in `from-html.ts`; the two
whitespace patches are pinned by dedicated parity specs.

## Phase 0, step 1 — React 16 → 17 (`e842f83be`, 2026-07-07)

react/react-dom 17.0.2, @types/react 17.0.93, enzyme adapter
`@wojtekmaj/enzyme-adapter-react-17`. Zero code changes were needed
beyond the adapter import; typecheck (11 projects) and the full unit
suite passed unchanged. `.npmrc` sets `legacy-peer-deps` for pinned
dependencies still declaring `react ^16` peer ranges (webpack aliases
react to the root copy, so a single React is bundled regardless).
**React 17 satisfies `@tiptap/react` (≥17), unblocking Phase 2.**

## Phase 0, step 2 — React 17 → 18 (`53bfd71ba` + `b7703c74a`, 2026-07-07)

A first trial produced 501 type errors, roughly half originating in
superdesk-ui-framework (typed against @types/react 16, no `children`
declarations) — documented as a blocker in `react-upgrade-notes.md`.
After the ui-framework `react18` branch became available
(`file:../superdesk-ui-framework-IvanJelicSF`; to be replaced by a
published release), the pass landed:

- react/react-dom 18.3.1, @types/react 18.3.31, enzyme adapter
  `@cfaester/enzyme-adapter-react-18`;
- 106 mechanical `React.StatelessComponent` → `FunctionComponent`
  renames; `children?: React.ReactNode` declared across component prop
  types including the public API typings in `superdesk-api.d.ts`;
- @types/react-redux 7.1.34; explicit type arguments for
  `SortableElement`/`SortableContainer` (react-sortable-hoc's typings
  reference the removed `React.SFC`, silently collapsing inference under
  `skipLibCheck`); a latent `connect` generic-order bug fixed in
  EmbedBlock;
- in-tree extensions aligned to root @types/react 18; sams also gained
  the `react-id-generator` dependency its lockfile silently relied on;
- 15 test failures were React 18 batching semantics — fixed with `act()`
  flushes in four spec files plus `IS_REACT_ACT_ENVIRONMENT`;
- `ReactDOM.render` bridges intentionally remain on the legacy API
  (React 17 behavior); `createRoot` migration is a follow-up.

Verification: typecheck (11 projects), verify-client-api-changes,
eslint, full unit suite (1021 specs, 0 failures).

## Phase 2 — Field type (`ec74ecdf4`, 2026-07-07)

- `extensions.ts` generates Tiptap extensions **from**
  `editorTiptapSchema`, so the editing schema is identical by
  construction to the one the converters and serializer use — pinned by
  specs (schema equality; a converted document loads into a live editor
  and serializes to identical HTML; typed text round-trips).
- `fields/tiptap/`: `ICustomFieldType` with an `@tiptap/react` editor
  and HTML preview; operational format holds the live `Editor`; storage
  is `{tiptapState: <PM doc JSON>}`. `toOperationalFormat` also accepts
  editor3's `{rawContentState}` and converts on open — the plan's lazy
  data migration.
- Registered in authoring-react behind `appConfig.features.tiptapEditor`.

## Phase 2 — Field-adapter output path (`2d00ae748`, 2026-07-08)

The save-side plumbing, all parity-tested against `computeEditor3Output`:

- `output.ts`: plain text with Draft.js `getPlainText` semantics
  (hardBreak → `\n`, atomic blocks a single space), annotations in
  storage format (`{id, type, body}`, ids matching the serializer's
  `annotation-id` attributes; message bodies render from Draft.js raw or
  PM JSON), embedded-article extraction, `plainTextToPmDoc` for
  angular-authoring compatibility.
- `field-adapters/utilities/`: `computeTiptapOutput`,
  `storeTiptapValueBase`, `retrieveStoredValueTiptapGeneric` —
  equivalents of the editor3 trio. Stored state lives in
  `fields_meta[field].tiptapState`; retrieval falls back to
  `draftjsState` (converted lazily on open), then a plain string value.
- The `body_html` adapter switches to the Tiptap field when the feature
  flag is on: `body_html` string, `IArticle.annotations`, and
  embedded-article associations are produced the same way editor3 did.

Golden specs assert byte-identical string values (HTML and plain-text
modes) and deep-equal annotations for converted content.

## Phase 3, wave A — Core authoring (`e64e23335`, 2026-07-08)

- `editing.ts` extension: undo/redo history (Mod-z/y), formatting
  shortcuts (Mod-b/i/u), list ergonomics (Enter splits items,
  Tab/Shift-Tab nest and lift), and paste routed through the
  editor3-compatible importer while internal ProseMirror clipboard
  content (`data-pm-slice`) keeps default handling.
- `commands.ts`: list toggling (wrap / lift / switch type in place) on
  prosemirror-schema-list against the schema-generated types; `setLink`
  with editor3's href/target/attachment semantics; `insertExternalHtml`.
- Toolbar reusing editor3's `Editor3-styleButton` CSS: marks, headings
  2–4, blockquote, lists, link modal, undo/redo; `TextStatistics`
  char/word counts in the field miniToolbar, `maxLength` from schema.
- Parity gap found and closed: Draft's `convertFromHTML` imported style
  attributes natively (`font-weight:700` → bold, with *clearing*
  semantics for `normal`/`none`). Mirrored as schema parse rules using
  ProseMirror's `clearMark`, pinned by a round-trip parity spec.

Known shared limitation (documented in the paste spec): docs-soap
destroys formatting of single-paragraph Google Docs payloads — editor3
has the identical bug.

## Phase 3, wave B — Structured content (`b946bb8ea` + `509953cee`, 2026-07-08)

Tables became first-class editable ProseMirror tables (replacing
editor3's entity-with-nested-editors model, as planned):

- schema: `tableRole` + colspan/rowspan/colwidth for prosemirror-tables
  compatibility; the HTML serializer ignores them (editor3 had no cell
  spans), so output parity is unaffected;
- `insertTable` (editor3's 1×2 default, cursor into the first cell),
  add/delete row/column, delete table, and a header toggle keeping the
  `withHeader` attribute (drives `<thead>` serialization) in sync with
  first-row cell types; Tab navigates cells, falling back to lists;
- React node views: media (image/video/audio with editable caption),
  embed (html + editable description), embedded article (read-only
  preview) — via the extensions-factory `nodeViews` option.

Insertion flows (completing the wave): drops of superdesk items
(`application/superdesk.item.*`) insert at the drop position;
`…compatible.embed` inserts embeds; external media files open the upload
dialog; toolbar media button runs the full editor3 flow
(`superdesk.intent('upload')` + per-image `renditions.crop`); embed
button resolves URLs via iframely (reusing editor3's `getEmbedObject`)
or accepts raw HTML. Specs pin serialized output at each step, including
a converted editor3 table extended with a new row, and newly inserted
media serializing with ordinal `editor_0` ids (the Draft.js entity-key
fallback).

## Phase 3, wave C — Spellchecker and find & replace (`509953cee`, 2026-07-08)

Keystone: `getPlainTextSegments` — a bidirectional map between
`pmDocToPlainText` offsets and PM positions (1:1 within blocks).

- Spellchecker: a decorations-only plugin (never serialized, per the
  plan) consuming the same `ISpellchecker` interface editor3 used, so
  all registered spellcheckers work unchanged. Debounced re-checks,
  stale results discarded by doc identity, decorations mapped through
  edits, editor3's `spelling-error`/`grammar-error` classes, right-click
  menu with suggestions and dictionary actions.
- Find & replace: per-block matching (editor3 parity), editor3's
  HIGHLIGHT colors as decorations (an improvement — editor3 stored
  inline styles in content and stripped them on export), next/prev with
  wrap-around, replace one/all, live recompute on edits.
- The language now flows into the field's operational value.

Follow-up noted: wiring the authoring sidebar find-and-replace panel
requires editor3's active-editor registration mechanism.

## Phase 3, wave D — Comments and annotations (`89f52b96a`, 2026-07-08)

`highlights.ts` — the `highlightsManager` equivalent on highlight marks
plus the `customData` sidecar via `setDocAttribute`:

- `addHighlight` generates `<KEY>-<n>` names from `lastHighlightIds` and
  stores `{data, type}` payloads exactly as editor3 shaped them — new
  and converted highlights are structurally indistinguishable;
- removal strips only the targeted mark (overlapping highlights
  survive); `resolveComment` reproduces editor3's resolve flow
  (`commentedText` + `resolutionInfo` into the resolved history);
- `__PUBLIC_API__comments` written on save (editor3's
  `addCommentsForServer` equivalent).

Field UI: toolbar comment/annotation buttons (author info via editor3's
`getAuthorInfo`; message bodies stored as Draft.js raw for compatibility
with existing consumers), editor3 style-map visuals through the mark's
`toDOM` (editor-only), click popup with resolve / edit / remove.

Suite at this point: 1057 specs, 0 failures.

## Phase 3, wave E — Suggestions / track-changes

The largest single item of the migration (~4.1k LOC of Draft.js reducer
logic in editor3). Acceptance contract: the 11 reducer spec files in
`scripts/core/editor3/reducers/tests/` (insert, delete, paste, style,
link, split, block-style, accept/reject).

### Part 1 — design + core engine (`ef48e6054`, 2026-07-08)

**Design decision: pure mark-based, not `prosemirror-changeset`.** The
persisted format requires marks plus `highlightsData` payloads
(converted editor3 documents carry them), and the behavioral contract
is mark-centric — per-author style names, adjacency merging, char-level
rules. Changeset computes after-the-fact diffs between document
versions; it would need translation to the stored format anyway and
can't express "this char belongs to that author's suggestion".

`suggestions.ts`, with core editor3 reducer cases ported to
`tests/suggestions.spec.ts`:

- `createAddSuggestion`: text inserted with an ADD_SUGGESTION mark; an
  insertion adjacent to (or inside) a same-author ADD suggestion
  extends it (same style name, `lastHighlightIds` untouched) instead of
  creating a new one; marks inherited from surrounding suggestions are
  stripped from the inserted range; a non-collapsed selection first
  becomes a DELETE suggestion (replace semantics);
- `createDeleteSuggestion`: characters are marked, not removed, with
  the same-author adjacency rule; characters already suggested for
  deletion are skipped over; characters the same author suggested
  adding are removed for real (suggestion data dropped once empty);
  backspace/delete cursor semantics match editor3;
- accept/reject: accepted ADD and rejected DELETE keep text and drop
  marks, the other two remove text; resolved entries move to
  `resolvedSuggestionsHistory` in the exact shape of editor3's
  `moveToSuggestionsHistory`;
- suggesting-mode plugin + extension intercepting typing,
  Backspace/Delete, and paste (plain text for now); toolbar toggle
  (editor3's icon and label); accept/reject in the highlights popup;
  editor3 style-map visuals.

Compatibility fix uncovered by this work: `addHighlight` now stores
entries as `{...data, type}` — editor3's exact shape (suggestions flat,
comments/annotations keep the `{data: {...}}` wrapper their callers
pass) — so converted and new highlights are structurally identical.

Also fixed a pre-existing order-dependent test flake: editor3.spec
replaces `ng` with a throwing mock and never restores it; tables.spec
now registers its own injector.

Suite: 1071 specs, 0 failures.

### Part 2 — style, block-style and link suggestions (`8cbe5f30c`, 2026-07-08)

Export-time behavior settled first (it affects save parity): editor3's
`prepareEditor3StateForExport` does NOT resolve suggestions — it only
strips find-replace decorative styles (ours are decorations already)
and writes `__PUBLIC_API__comments` (done in wave D). Unresolved
suggestion styles simply produce no markup, so suggested-deleted text
exports as-is. The serializer already behaves identically by
construction; a parity spec now pins it byte-for-byte against editor3.

New suggestion types, resolving per editor3's `processSuggestion`:

- **Style** (`createChangeStyleSuggestion`): the style applies
  immediately; the range gets a `TOGGLE_<STYLE>_SUGGESTION` mark whose
  `originalStyle` records the Draft.js style name to restore on reject
  (`''` when the suggestion added the style). Toggling back on the same
  range removes the suggestion instead of stacking; re-toggling over an
  existing suggestion inherits its `originalStyle`.
- **Block style** (`createBlockStyleSuggestion`): the block type
  toggles immediately, the whole block text is marked; `blockType` uses
  editor3's strings ('H1'..'H6', 'quote') so converted documents
  resolve identically; reject toggles the block back.
- **Links**: add (reject removes the link), remove (the link stays
  until accepted), change (new href applies; `from`/`to` recorded in
  editor3's shape; reject restores the previous href).

The resolve path now dispatches per type; all types share the
`resolvedSuggestionsHistory` entry shape. In suggesting mode the
toolbar routes formatting buttons, headings/blockquote, and the link
modal through suggestions. Suggestion metadata comes from editor3's
`getSuggestionMetadata` (author = session user **id** — a fix over
part 1, which used the display name).

Suite: 1081 specs, 0 failures.

### Part 3 — paragraph suggestions, rich paste, accept-all (`b9e35c409`, 2026-07-08)

Split and merge paragraph suggestions use editor3's exact
representation: the structural change happens for real, and a marked
`¶` separator character (`Highlights.paragraphSeparator`) records the
suggestion — at the end of the first block for a split, at the old
boundary for a merge. Enter in suggesting mode suggests a split;
Backspace at block start / Delete at block end suggest a merge. The
cancellation pairs work both ways: splitting where the same author
suggested a merge removes the merge (and vice versa) instead of
stacking. Resolution removes the separator either way; rejecting a
split re-joins the blocks, rejecting a merge re-splits them.

Rich paste in suggesting mode (`pasteAddSuggestion`): content is
inserted with formatting through the editor3-compatible importer, and
every inserted character belongs to a single ADD suggestion.
`acceptAllSuggestions`/`rejectAllSuggestions` resolve everything in the
document.

Suite: 1088 specs, 0 failures.

### Remaining wave E parts

The suggestion popup showing author display name/avatar (the popup
currently shows the author id with Accept/Reject; editor3's
SuggestionsPopup resolves users via the users service), and the
authoring-react toolbar placement for accept-all/reject-all.

---

## Still open (beyond wave E)

- Comment replies UI; find-replace sidebar wiring; field config /
  difference components.
- Phase 4: editor-agnostic types in `superdesk-api.d.ts`, a
  Tiptap-backed `Editor3Html` equivalent, migration of the ~17
  draft-js-importing consumers (widgets reading `draftjsState`,
  macros, templates, extensions).
- Phase 5: Playwright suite duplication, pilot with `body_html` drift
  monitoring, default flip.
- Infrastructure: publish superdesk-ui-framework `react18` to npm and
  replace the `file:` dependency; `createRoot` migration of the
  Angular↔React bridges; production `draftjsState` fixture harvesting.
