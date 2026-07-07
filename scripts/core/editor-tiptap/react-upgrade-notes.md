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

## Step 2 — React 18: blocked on superdesk-ui-framework typings

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
