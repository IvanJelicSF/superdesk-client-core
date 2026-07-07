# `@sourcefabric/draft-js` fork audit

*Phase 1 deliverable of the editor3 → Tiptap migration. Audited 2026-07-07 against
[superdesk/draft-js](https://github.com/superdesk/draft-js) `cbd83316` (the source of the
published `@sourcefabric/draft-js@0.11.5`).*

## Method

The fork repository was cloned and compared with `facebook/draft-js` using git. The merge
base is upstream `85764327` ("Fix flow by allowing optional chaining (#2369)"), a few
commits **after** the upstream `v0.11.5` release. `git diff <merge-base> HEAD -- src/`
is the complete source delta.

## Result: the fork only patches HTML *import*

The entire source difference is confined to
`src/model/encoding/convertFromHTMLToContentBlocks.js` (3 insertions, 4 deletions):

1. **Subscript/superscript import** (`a3eff5fa`): `sub: 'SUBSCRIPT'`, `sup: 'SUPERSCRIPT'`
   added to `HTMLTagToRawInlineStyleMap`, so pasted `<sub>`/`<sup>` become inline styles.
2. **No trimming of pasted text** (`2593b33b`, "Don't trim text when converting html"):
   the `_trimCurrentText()` call in the block-element path is commented out, so
   leading/trailing/multiple spaces inside pasted blocks are preserved.
3. **MSWord-on-Mac paste fix** (`df890ab9`): the upstream `REGEX_LEADING_LF` strip in
   `_addTextNode` is removed, so a text node's leading line feed becomes a space (via the
   general LF→space replacement) instead of disappearing.

The remaining fork commits are non-behavioral: package rename/publish config
(`2a6ac3ed`, `cbd83316`, `30896547`) and an `immutable@3.8.2` dependency pin
(`c9c34090`).

The upstream commits between the `v0.11.5` npm release and the merge base
(`0950285d`, `153482ff`, `d53fa7ab`, `2658dd60`, `85764327`) touch flow types, codegen,
an editor-runtime selection guard, and the playground — none affect data.

## Consequences for the migration

- **The persisted format is stock Draft.js.** `convertFromRaw`/`convertToRaw` and the
  raw `draftjsState` encoding are bit-identical to upstream `draft-js@0.11.5`, so the
  `from-draftjs.ts` converter needs no fork-specific handling. The plan's "unknown
  patches in the fork" risk is retired for the converter and the HTML serializer.
- **All three import patches are already reproduced by `from-html.ts`** and pinned by
  specs in `tests/from-html-parity.spec.ts`:
  - sub/sup: schema `subscript`/`superscript` parse rules
    (*"should parse editor2 inline styles"*);
  - no-trim: ProseMirror parsing with `preserveWhitespace: true`
    (*"preserves pasted whitespace inside blocks (fork patch)"*);
  - leading LF: ProseMirror's LF→space normalization without a leading-LF strip
    (*"keeps a leading line feed as a space (fork MSWord paste patch)"*).
