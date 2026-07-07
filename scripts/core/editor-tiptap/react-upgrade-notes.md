# React upgrade notes (Tiptap migration, Phase 0)

## Step 1 — React 17: done

`react`/`react-dom` 17.0.2, `@types/react` 17.0.93, `@types/react-dom` 17.0.26,
enzyme adapter `@wojtekmaj/enzyme-adapter-react-17`. No API changes were needed:
typecheck (11 projects) and the full unit suite passed unchanged. `.npmrc` sets
`legacy-peer-deps` because several pinned dependencies still declare `react ^16`
peer ranges (webpack aliases `react`/`react-dom` to the root copy, so only one
React is bundled regardless).

**React 17 already satisfies `@tiptap/react` (requires ≥17), so Phase 2 of the
migration is unblocked.**

## Step 2 — React 18: done (2026-07-07)

Landed with `superdesk-ui-framework` switched to the `react18` branch working
tree (`file:../superdesk-ui-framework-IvanJelicSF`, to be replaced with a
published version, e.g. `7.0.0-dev2`). What the pass involved:

- react/react-dom 18.3.1, @types/react 18.3.31, @types/react-dom 18.3.7,
  enzyme adapter `@cfaester/enzyme-adapter-react-18`;
- mechanical rename of all 106 `React.StatelessComponent` usages to
  `React.FunctionComponent`;
- `children?: React.ReactNode` declarations across ~90 component prop types,
  including the public API typings in `superdesk-api.d.ts` (container-style
  components: List.Item/Row/Column, ListItemActionsMenu, GroupLabel,
  TopMenuDropdownButton, Center, editor/preview containers, panels, …);
- `@types/react-redux` bumped to 7.1.34 (7.1.9 lacked `children` on
  `ProviderProps` under React 18);
- explicit type arguments for `SortableElement`/`SortableContainer`
  (react-sortable-hoc's typings reference the removed `React.SFC`, collapsing
  inference — hidden by `skipLibCheck`, surfaced at usage sites);
- react-redux `connect` generic order corrected in EmbedBlock
  (was `<TState, TOwn, TDispatch>`, must be `<TState, TDispatch, TOwn>`);
- in-tree extensions aligned to root `@types/react@18` (own copies of
  @types/react 16/17 caused dual-ReactNode conflicts); sams also gained the
  `react-id-generator` dependency its lockfile silently relied on;
- `ReactDOM.render`/`unmountComponentAtNode` call sites were left on the
  legacy API deliberately — they behave as in React 17 (with a console
  warning) and migrate to `createRoot` per-bridge as a follow-up.

The section below is kept for the record of the original blocker analysis.

## Step 2 (analysis) — React 18: blocked on superdesk-ui-framework typings

A trial upgrade (react 18.3.1, @types/react 18.3.31) produced **501 type
errors** in the core project, in three buckets:

1. ~106 × `React.StatelessComponent` no longer exists in `@types/react@18`
   → mechanical rename to `React.FunctionComponent`.
2. ~230 × implicit `children` removal — components must declare
   `children?: React.ReactNode` in their props. Errors split between component
   definitions in this repo (fixable) and **usage sites of superdesk-ui-framework
   components** (`ModalSimple`, `Select`, panels, …) whose props interfaces are
   compiled against `@types/react@16` and do not declare `children`.
   These cannot be fixed from this repo.
3. ~174 × overload-resolution failures, mostly the same ui-framework children
   issue surfacing through generic component signatures.

The newest published `superdesk-ui-framework` (7.0.0-dev1, exactly what this
repo uses) is built/typed against React 16.14. **React 18 therefore requires a
ui-framework release typed for React 18 first**, then a mechanical pass here
(SFC renames + children declarations), and finally the `ReactDOM.render` →
`createRoot` migration in the Angular↔React bridges (13 render / 14 unmount
call sites; both keep working in React 18's legacy mode until migrated).

The error census: `tsc` on the trial produced TS2694 ×106 (SFC), TS2339 ×75 +
TS2322 ×112 + TS2559 ×32 (children), TS2769 ×174 (overloads), TS2786/TS2307 ×2.

### Update — ui-framework React 18 work done (2026-07-07)

The `react18` branch of superdesk-ui-framework (working tree
`~/sf/repos/superdesk-ui-framework-IvanJelicSF`) upgrades the framework to
react/react-dom 18.3.1 with `@types/react` 18.3.31:

- explicit `children` declarations added across ~30 component files, so the
  published typings (`react/index.d.ts`) no longer rely on React 16's implicit
  children — this unblocks bucket 2/3 above;
- `@superdesk/primereact` (still typed for React 16) is augmented via
  `app-typescript/primereact-react18-compat.ts` (Dialog/OverlayPanel children);
  the augmentation is emitted into the published typings;
- all internal `ReactDOM.render`/`unmountComponentAtNode` call sites migrated
  to `createRoot` (Toast, Dropdown, ShowPopup, _Positioner, docs bridges);
- enzyme adapter swapped to `@cfaester/enzyme-adapter-react-18`; full lint
  suite (tsc, prettier, eslint, tslint, playground tsc, unit tests) and
  production build pass.

Once this is released to npm (e.g. 7.0.0-dev2), this repo can bump the
dependency and proceed with its own React 18 pass (SFC renames + children
declarations + `createRoot` in the Angular↔React bridges).
