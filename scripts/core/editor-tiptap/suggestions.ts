import {Editor, Extension} from '@tiptap/core';
import {Mark} from '@tiptap/pm/model';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {IEditorTiptapCustomData} from './schema';
import {getCustomData, getHighlightData, addHighlightAtRange, removeHighlight} from './highlights';

/**
 * Track changes (suggestions) for the Tiptap editor — the equivalent of
 * editor3's suggestions reducer (`reducers/suggestions.tsx`), whose spec
 * files are the acceptance contract for this module.
 *
 * Design: pure mark-based, not prosemirror-changeset. The persisted
 * format requires marks plus `highlightsData` payloads (converted editor3
 * documents carry them), and the behavioral contract is mark-centric
 * (per-author style names, adjacency merging, char-level rules), while
 * changeset computes after-the-fact diffs between document versions and
 * would need translation to the stored format anyway.
 *
 * Semantics replicated from editor3:
 * - inserted text gets an ADD_SUGGESTION mark; an insertion adjacent to
 *   (or inside) an ADD suggestion of the same author extends that
 *   suggestion instead of creating a new one;
 * - deleting doesn't remove text: it gets a DELETE_SUGGESTION mark, with
 *   the same-author adjacency rule. Deleting a character the same author
 *   just suggested adding removes it for real; a character already
 *   marked as a delete suggestion is skipped over;
 * - suggestion data is stored flat (`{author, date, type}`), unlike the
 *   `{data: {...}}` wrapper comments and annotations use.
 */

export interface ISuggestionData {
    author: string;
    date: Date | string;

    [key: string]: any;
}

const CHANGE_SUGGESTION_KEYS = ['ADD_SUGGESTION', 'DELETE_SUGGESTION'];

// --- suggesting mode ---

export const suggestingModePluginKey = new PluginKey<{enabled: boolean}>('suggestingMode');

export function isSuggestingMode(editor: Editor): boolean {
    return suggestingModePluginKey.getState(editor.state)?.enabled === true;
}

export function toggleSuggestingMode(editor: Editor): void {
    editor.view.dispatch(
        editor.state.tr.setMeta(suggestingModePluginKey, {enabled: !isSuggestingMode(editor)}),
    );
}

// --- mark inspection helpers ---

function getSuggestionMarkAt(
    editor: Editor,
    pos: number,
    side: 'before' | 'after',
    keys: Array<string> = CHANGE_SUGGESTION_KEYS,
): Mark | null {
    const resolved = editor.state.doc.resolve(pos);
    const node = side === 'before' ? resolved.nodeBefore : resolved.nodeAfter;

    if (node == null || !node.isText) {
        return null;
    }

    return node.marks.find(
        (mark) => mark.type.name === 'highlight' && keys.includes(mark.attrs.highlightKey),
    ) ?? null;
}

function getReusableStyleName(
    editor: Editor,
    pos: number,
    highlightKey: string,
    author: string,
): string | null {
    for (const side of ['before', 'after'] as const) {
        const mark = getSuggestionMarkAt(editor, pos, side, [highlightKey]);

        if (mark != null && getHighlightData(editor, mark.attrs.styleName)?.author === author) {
            return mark.attrs.styleName;
        }
    }

    return null;
}

function markRangeAsSuggestion(
    editor: Editor,
    range: {from: number; to: number},
    highlightKey: string,
    data: ISuggestionData,
): string {
    const reusable = getReusableStyleName(editor, range.from, highlightKey, data.author)
        ?? getReusableStyleName(editor, range.to, highlightKey, data.author);

    if (reusable != null) {
        editor.commands.command(({state, tr, dispatch}) => {
            if (dispatch) {
                tr.addMark(
                    range.from,
                    range.to,
                    state.schema.marks.highlight.create({styleName: reusable, highlightKey}),
                );
                dispatch(tr);
            }

            return true;
        });

        return reusable;
    }

    return addHighlightAtRange(editor, highlightKey, data, range);
}

// --- creating suggestions ---

/**
 * Inserts text as an ADD suggestion at the selection (editor3's
 * CREATE_ADD_SUGGESTION). A non-collapsed selection first becomes a
 * DELETE suggestion, matching editor3's behavior of suggesting the
 * replacement rather than removing text.
 */
export function createAddSuggestion(editor: Editor, text: string, data: ISuggestionData): string {
    if (!editor.state.selection.empty) {
        createDeleteSuggestion(editor, 'delete', data);
    }

    const from = editor.state.selection.from;
    const range = {from, to: from + text.length};

    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.insertText(text, from);
            dispatch(tr);
        }

        return true;
    });

    // inserted text inherits marks at the cursor; suggestion marks of the
    // surrounding text (another author's, or delete suggestions) must not
    // leak onto it
    stripSuggestionMarks(editor, range);

    return markRangeAsSuggestion(editor, range, 'ADD_SUGGESTION', data);
}

function stripSuggestionMarks(editor: Editor, range: {from: number; to: number}): void {
    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
                if (node.isText) {
                    node.marks
                        .filter((mark) => mark.type.name === 'highlight'
                            && CHANGE_SUGGESTION_KEYS.includes(mark.attrs.highlightKey))
                        .forEach((mark) => {
                            tr.removeMark(
                                Math.max(pos, range.from),
                                Math.min(pos + node.nodeSize, range.to),
                                mark,
                            );
                        });
                }

                return true;
            });
            dispatch(tr);
        }

        return true;
    });
}

/**
 * Marks the selection (or the adjacent character, on a collapsed
 * selection) as a DELETE suggestion — editor3's CREATE_DELETE_SUGGESTION.
 */
export function createDeleteSuggestion(
    editor: Editor,
    action: 'backspace' | 'delete',
    data: ISuggestionData,
): void {
    let {from, to} = editor.state.selection;

    if (from === to) {
        if (action === 'backspace') {
            from = from - 1;
        } else {
            to = to + 1;
        }

        if (from < 1 || to > editor.state.doc.content.size) {
            return;
        }
    }

    // walk characters from the end so earlier positions stay valid when
    // characters are actually removed (own ADD suggestions)
    let cursor = action === 'backspace' ? from : to;

    for (let pos = to - 1; pos >= from; pos--) {
        const resolved = editor.state.doc.resolve(pos);
        const charNode = resolved.nodeAfter;

        if (charNode == null || !charNode.isText) {
            continue; // block boundary or atomic node; paragraph merge suggestions are not implemented yet
        }

        const suggestionMark = charNode.marks.find(
            (mark) => mark.type.name === 'highlight' && CHANGE_SUGGESTION_KEYS.includes(mark.attrs.highlightKey),
        );
        const markData = suggestionMark == null
            ? null
            : getHighlightData(editor, suggestionMark.attrs.styleName);

        if (markData?.type === 'DELETE_SUGGESTION') {
            // already suggested for deletion: skip over it
            if (action === 'backspace') {
                cursor = pos;
            }
            continue;
        }

        if (markData?.type === 'ADD_SUGGESTION' && markData.author === data.author) {
            // the same author suggested adding this character: remove it
            const styleName = suggestionMark.attrs.styleName;

            editor.commands.command(({tr, dispatch}) => {
                if (dispatch) {
                    tr.delete(pos, pos + 1);
                    dispatch(tr);
                }

                return true;
            });

            if (getHighlightedTextLength(editor, styleName) < 1) {
                removeHighlight(editor, styleName);
            }

            if (cursor > pos) {
                cursor = cursor - 1;
            }
            continue;
        }

        markRangeAsSuggestion(editor, {from: pos, to: pos + 1}, 'DELETE_SUGGESTION', data);

        if (action === 'backspace') {
            cursor = pos;
        }
    }

    editor.commands.setTextSelection(Math.max(1, Math.min(cursor, editor.state.doc.content.size)));
}

function getHighlightedTextLength(editor: Editor, styleName: string): number {
    let length = 0;

    editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some(
            (mark) => mark.type.name === 'highlight' && mark.attrs.styleName === styleName,
        )) {
            length += node.nodeSize;
        }

        return true;
    });

    return length;
}

// --- resolving suggestions ---

function findSuggestionRanges(editor: Editor, styleName: string): Array<{from: number; to: number; mark: Mark}> {
    const ranges: Array<{from: number; to: number; mark: Mark}> = [];

    editor.state.doc.descendants((node, pos) => {
        if (node.isText) {
            const mark = node.marks.find(
                (nodeMark) => nodeMark.type.name === 'highlight' && nodeMark.attrs.styleName === styleName,
            );

            if (mark != null) {
                ranges.push({from: pos, to: pos + node.nodeSize, mark});
            }
        }

        return true;
    });

    return ranges;
}

function resolveSuggestion(
    editor: Editor,
    styleName: string,
    accepted: boolean,
    resolverData: ISuggestionData,
): boolean {
    const entry = getHighlightData(editor, styleName);

    if (entry == null) {
        return false;
    }

    // accepted ADD and rejected DELETE keep the text; the other two remove it
    const keepText = accepted === (entry.type === 'ADD_SUGGESTION');
    const ranges = findSuggestionRanges(editor, styleName);
    const suggestionText = ranges
        .map(({from, to}) => editor.state.doc.textBetween(from, to))
        .join('');

    return editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            // reverse order so earlier positions stay valid on deletions
            for (const range of [...ranges].reverse()) {
                if (keepText) {
                    tr.removeMark(range.from, range.to, range.mark);
                } else {
                    tr.delete(range.from, range.to);
                }
            }

            const customData: IEditorTiptapCustomData = getCustomData(editor);
            const highlightsData = {...customData.highlightsData};

            delete highlightsData[styleName];

            // the entry shape of editor3's moveToSuggestionsHistory
            tr.setDocAttribute('customData', {
                ...customData,
                highlightsData,
                resolvedSuggestionsHistory: [
                    ...(customData.resolvedSuggestionsHistory ?? []),
                    {
                        suggestionText,
                        oldText: undefined,
                        suggestionInfo: {...entry, styleName, suggestionText},
                        resolutionInfo: {
                            resolverUserId: resolverData.author,
                            date: resolverData.date,
                            accepted,
                        },
                    },
                ],
            });
            dispatch(tr);
        }

        return true;
    });
}

/**
 * ADD: keep the text, drop the marks. DELETE: remove the text.
 */
export function acceptSuggestion(editor: Editor, styleName: string, resolverData: ISuggestionData): boolean {
    return resolveSuggestion(editor, styleName, true, resolverData);
}

/**
 * ADD: remove the text. DELETE: keep the text, drop the marks.
 */
export function rejectSuggestion(editor: Editor, styleName: string, resolverData: ISuggestionData): boolean {
    return resolveSuggestion(editor, styleName, false, resolverData);
}

// --- input interception ---

export interface ISuggestionsExtensionOptions {
    getAuthorData(): ISuggestionData;
}

/**
 * When suggesting mode is on, typing and deleting produce suggestions
 * instead of direct edits (editor3 routed the same events to its
 * reducer from `Editor3Component.keyBindingFn`/`handleBeforeInput`).
 */
export function createSuggestionsExtension(options: ISuggestionsExtensionOptions) {
    return Extension.create({
        name: 'suggestions',

        addKeyboardShortcuts() {
            const handleDeleteKey = (action: 'backspace' | 'delete') => () => {
                if (!isSuggestingMode(this.editor)) {
                    return false;
                }

                createDeleteSuggestion(this.editor, action, options.getAuthorData());

                return true;
            };

            return {
                Backspace: handleDeleteKey('backspace'),
                Delete: handleDeleteKey('delete'),
            };
        },

        addProseMirrorPlugins() {
            const editor = this.editor;

            return [
                new Plugin<{enabled: boolean}>({
                    key: suggestingModePluginKey,

                    state: {
                        init: () => ({enabled: false}),
                        apply: (tr, prev) => tr.getMeta(suggestingModePluginKey) ?? prev,
                    },

                    props: {
                        handleTextInput(view, from, to, text) {
                            if (suggestingModePluginKey.getState(view.state)?.enabled !== true) {
                                return false;
                            }

                            createAddSuggestion(editor, text, options.getAuthorData());

                            return true;
                        },

                        handlePaste(view, event) {
                            if (suggestingModePluginKey.getState(view.state)?.enabled !== true) {
                                return false;
                            }

                            const text = event.clipboardData?.getData('text/plain') ?? '';

                            if (text.length > 0) {
                                createAddSuggestion(editor, text, options.getAuthorData());
                            }

                            return true; // rich paste as suggestion is not implemented yet
                        },
                    },
                }),
            ];
        },
    });
}
