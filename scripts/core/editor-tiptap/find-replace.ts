import {Editor, Extension} from '@tiptap/core';
import {Plugin, PluginKey, EditorState} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {Node as PmNode} from '@tiptap/pm/model';
import {pmDocToPlainText, getPlainTextSegments} from './output';

/**
 * Find & replace for the Tiptap editor. Highlights are decorations only —
 * unlike editor3, which stored HIGHLIGHT inline styles in the content and
 * had to strip them on export. Matching runs per block (matches cannot
 * span blocks, like in editor3).
 */

export interface IFindReplaceQuery {
    term: string;
    caseSensitive: boolean;
}

interface IMatch {
    from: number;
    to: number;
}

interface IFindReplacePluginState {
    query: IFindReplaceQuery | null;
    matches: Array<IMatch>;
    activeIndex: number;
    decorations: DecorationSet;
}

export const findReplacePluginKey = new PluginKey<IFindReplacePluginState>('findReplace');

// same colors editor3 used for its HIGHLIGHT / HIGHLIGHT_STRONG styles
const MATCH_STYLE = 'background-color: rgba(255, 235, 59, 0.2);';
const ACTIVE_MATCH_STYLE = 'background-color: rgba(255, 235, 59, 0.8);';

function findMatches(doc: PmNode, query: IFindReplaceQuery): Array<IMatch> {
    if (query.term.length < 1) {
        return [];
    }

    const plainText = pmDocToPlainText(doc);
    const segments = getPlainTextSegments(doc);
    const haystack = query.caseSensitive ? plainText : plainText.toLowerCase();
    const needle = query.caseSensitive ? query.term : query.term.toLowerCase();
    const matches: Array<IMatch> = [];

    for (const segment of segments) {
        let searchFrom = segment.start;
        const segmentEnd = segment.start + segment.length;

        while (searchFrom < segmentEnd) {
            const index = haystack.indexOf(needle, searchFrom);

            if (index < 0 || index + needle.length > segmentEnd) {
                break;
            }

            matches.push({
                from: segment.pmStart + (index - segment.start),
                to: segment.pmStart + (index - segment.start) + needle.length,
            });

            searchFrom = index + needle.length;
        }
    }

    return matches;
}

function buildState(doc: PmNode, query: IFindReplaceQuery | null, activeIndex: number): IFindReplacePluginState {
    const matches = query == null ? [] : findMatches(doc, query);
    const boundedIndex = matches.length > 0 ? ((activeIndex % matches.length) + matches.length) % matches.length : 0;
    const decorations = DecorationSet.create(doc, matches.map((match, index) => Decoration.inline(
        match.from,
        match.to,
        {style: index === boundedIndex ? ACTIVE_MATCH_STYLE : MATCH_STYLE},
    )));

    return {query, matches, activeIndex: boundedIndex, decorations};
}

export const findReplace = Extension.create({
    name: 'findReplace',

    addProseMirrorPlugins() {
        return [
            new Plugin<IFindReplacePluginState>({
                key: findReplacePluginKey,

                state: {
                    init: (_config, state) => buildState(state.doc, null, 0),
                    apply: (tr, prev, _oldState, newState) => {
                        const meta = tr.getMeta(findReplacePluginKey);

                        if (meta != null) {
                            return buildState(
                                newState.doc,
                                meta.query !== undefined ? meta.query : prev.query,
                                meta.activeIndex !== undefined ? meta.activeIndex : prev.activeIndex,
                            );
                        }

                        if (tr.docChanged && prev.query != null) {
                            return buildState(newState.doc, prev.query, prev.activeIndex);
                        }

                        return prev;
                    },
                },

                props: {
                    decorations(state: EditorState) {
                        return findReplacePluginKey.getState(state)?.decorations;
                    },
                },
            }),
        ];
    },
});

export function getFindReplaceState(editor: Editor): IFindReplacePluginState | undefined {
    return findReplacePluginKey.getState(editor.state);
}

export function setFindReplaceQuery(editor: Editor, query: IFindReplaceQuery | null): void {
    editor.view.dispatch(editor.state.tr.setMeta(findReplacePluginKey, {query, activeIndex: 0}));
}

function step(editor: Editor, delta: number): void {
    const state = getFindReplaceState(editor);

    if (state == null || state.matches.length < 1) {
        return;
    }

    editor.view.dispatch(
        editor.state.tr.setMeta(findReplacePluginKey, {activeIndex: state.activeIndex + delta}),
    );
}

export function findNext(editor: Editor): void {
    step(editor, 1);
}

export function findPrev(editor: Editor): void {
    step(editor, -1);
}

/**
 * Replaces the active match; the next match becomes active.
 */
export function replaceMatch(editor: Editor, replacement: string): void {
    const state = getFindReplaceState(editor);
    const match = state?.matches[state.activeIndex];

    if (match == null) {
        return;
    }

    const tr = editor.state.tr.insertText(replacement, match.from, match.to);

    tr.setMeta(findReplacePluginKey, {activeIndex: state.activeIndex});
    editor.view.dispatch(tr);
}

export function replaceAllMatches(editor: Editor, replacement: string): void {
    const state = getFindReplaceState(editor);

    if (state == null || state.matches.length < 1) {
        return;
    }

    const tr = editor.state.tr;

    // in reverse, so earlier positions stay valid
    [...state.matches].reverse().forEach((match) => {
        tr.insertText(replacement, match.from, match.to);
    });

    editor.view.dispatch(tr);
}
