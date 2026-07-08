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
const PARAGRAPH_SUGGESTION_KEYS = ['SPLIT_PARAGRAPH_SUGGESTION', 'MERGE_PARAGRAPHS_SUGGESTION'];

// the marked character editor3 used to represent a suggested paragraph
// split or merge (`Highlights.paragraphSeparator`)
export const PARAGRAPH_SEPARATOR = '\u00B6';

// draft-js inline style names, stored in `originalStyle` for editor3 compat
export const DRAFT_STYLE_BY_MARK = {
    bold: 'BOLD',
    italic: 'ITALIC',
    underline: 'UNDERLINE',
    strike: 'STRIKETHROUGH',
    subscript: 'SUBSCRIPT',
    superscript: 'SUPERSCRIPT',
};

export const STYLE_SUGGESTION_KEY_BY_MARK = {
    bold: 'TOGGLE_BOLD_SUGGESTION',
    italic: 'TOGGLE_ITALIC_SUGGESTION',
    underline: 'TOGGLE_UNDERLINE_SUGGESTION',
    strike: 'TOGGLE_STRIKETHROUGH_SUGGESTION',
    subscript: 'TOGGLE_SUBSCRIPT_SUGGESTION',
    superscript: 'TOGGLE_SUPERSCRIPT_SUGGESTION',
};

const MARK_BY_STYLE_SUGGESTION_KEY = Object.keys(STYLE_SUGGESTION_KEY_BY_MARK).reduce(
    (result, markName) => {
        result[STYLE_SUGGESTION_KEY_BY_MARK[markName]] = markName;

        return result;
    },
    {},
);

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
        const {$from} = editor.state.selection;

        // at a block edge, deleting means merging blocks — editor3's
        // setMergeParagraphSuggestion
        if (action === 'backspace' && $from.parentOffset === 0) {
            createMergeParagraphsSuggestion(editor, data);
            return;
        }

        if (action === 'delete' && $from.parentOffset === $from.parent.content.size) {
            const after = editor.state.doc.resolve($from.after());

            if (after.nodeAfter?.isTextblock) {
                editor.commands.setTextSelection(after.pos + 2);
                createMergeParagraphsSuggestion(editor, data);
            }
            return;
        }

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
            continue; // block boundary within a range, or an atomic node
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

/**
 * Toggles an inline style as a suggestion (editor3's
 * CREATE_CHANGE_STYLE_SUGGESTION): the style is applied immediately and
 * the range is marked with a TOGGLE_<STYLE>_SUGGESTION highlight whose
 * `originalStyle` records what rejecting should restore. Toggling the
 * style back (same author, same range) removes the suggestion instead.
 */
export function createChangeStyleSuggestion(editor: Editor, markName: string, data: ISuggestionData): string | null {
    const highlightKey = STYLE_SUGGESTION_KEY_BY_MARK[markName];
    const {from, to, empty} = editor.state.selection;

    if (highlightKey == null || empty) {
        return null;
    }

    const markType = editor.state.schema.marks[markName];
    const wasActive = editor.state.doc.rangeHasMark(from, to, markType);
    const originalStyle = wasActive ? DRAFT_STYLE_BY_MARK[markName] : '';
    const existing = getUniformSuggestionMark(editor, {from, to}, highlightKey);

    if (existing != null) {
        const oldData = getHighlightData(editor, existing.attrs.styleName);
        const draftStyle = DRAFT_STYLE_BY_MARK[markName];
        const toggledBack = (oldData?.originalStyle === draftStyle && originalStyle === '')
            || (oldData?.originalStyle === '' && originalStyle === draftStyle);

        editor.commands.command(({tr, dispatch}) => {
            if (dispatch) {
                tr.removeMark(from, to, existing);
                dispatch(tr);
            }

            return true;
        });

        if (toggledBack) {
            editor.chain().setTextSelection({from, to}).toggleMark(markName)
                .run();

            if (getHighlightedTextLength(editor, existing.attrs.styleName) < 1) {
                removeHighlight(editor, existing.attrs.styleName);
            }

            return null;
        }

        // the range switches to a new suggestion inheriting the older origin
        const inherited = {...data, originalStyle: oldData?.originalStyle ?? ''};

        editor.chain().setTextSelection({from, to}).toggleMark(markName)
            .run();

        return addHighlightAtRange(editor, highlightKey, inherited, {from, to});
    }

    editor.chain().setTextSelection({from, to}).toggleMark(markName)
        .run();

    return addHighlightAtRange(editor, highlightKey, {...data, originalStyle}, {from, to});
}

/**
 * A same-key suggestion mark covering the entire range, if there is one.
 */
function getUniformSuggestionMark(
    editor: Editor,
    range: {from: number; to: number},
    highlightKey: string,
): Mark | null {
    let found: Mark | null = null;
    let uniform = true;

    editor.state.doc.nodesBetween(range.from, range.to, (node) => {
        if (node.isText) {
            const mark = node.marks.find(
                (nodeMark) => nodeMark.type.name === 'highlight'
                    && nodeMark.attrs.highlightKey === highlightKey,
            );

            if (mark == null || (found != null && mark.attrs.styleName !== found.attrs.styleName)) {
                uniform = false;
            } else {
                found = mark;
            }
        }

        return true;
    });

    return uniform ? found : null;
}

/**
 * Draft block-type strings editor3 stored in BLOCK_STYLE_SUGGESTION data,
 * mapped to schema nodes.
 */
function getBlockNodeForDraftType(blockType: string): {name: string; attrs?: {[key: string]: any}} | null {
    const headingMatch = blockType.match(/^H([1-6])$/);

    if (headingMatch != null) {
        return {name: 'heading', attrs: {level: Number(headingMatch[1])}};
    }

    return blockType === 'quote' ? {name: 'blockquote'} : null;
}

/**
 * Changes block style as a suggestion (editor3's
 * CREATE_CHANGE_BLOCK_STYLE_SUGGESTION): the type toggles immediately and
 * the whole block text is marked. `blockType` uses editor3's strings
 * ('H1'..'H6', 'quote') so converted documents resolve identically.
 */
export function createBlockStyleSuggestion(editor: Editor, blockType: string, data: ISuggestionData): string | null {
    const target = getBlockNodeForDraftType(blockType);

    if (target == null) {
        return null;
    }

    const {$from, $to} = editor.state.selection;
    const range = {from: $from.start(), to: $to.end()};

    toggleBlockNode(editor, range, target);

    return addHighlightAtRange(editor, 'BLOCK_STYLE_SUGGESTION', {...data, blockType}, range);
}

function toggleBlockNode(
    editor: Editor,
    range: {from: number; to: number},
    target: {name: string; attrs?: {[key: string]: any}},
): void {
    editor.chain().setTextSelection(range)
        .toggleNode(target.name, 'paragraph', target.attrs)
        .run();
}

/**
 * Adds a link as a suggestion (editor3's CREATE_LINK_SUGGESTION): the
 * link applies immediately, the range gets an ADD_LINK_SUGGESTION mark.
 */
export function createLinkSuggestion(
    editor: Editor,
    link: {href: string},
    data: ISuggestionData,
): string | null {
    const {from, to, empty} = editor.state.selection;

    if (empty) {
        return null;
    }

    editor.commands.command(({state, tr, dispatch}) => {
        if (dispatch) {
            tr.addMark(from, to, state.schema.marks.link.create({href: link.href}));
            dispatch(tr);
        }

        return true;
    });

    return addHighlightAtRange(editor, 'ADD_LINK_SUGGESTION', {...data, link}, {from, to});
}

/**
 * The full extent of the link mark around `pos`.
 */
function getLinkRangeAt(editor: Editor, pos: number): {from: number; to: number; mark: Mark} | null {
    const doc = editor.state.doc;
    const resolved = doc.resolve(pos);
    const node = resolved.nodeAfter ?? resolved.nodeBefore;
    const mark = node?.marks.find((nodeMark) => nodeMark.type.name === 'link');

    if (mark == null) {
        return null;
    }

    let from: number | null = null;
    let to: number | null = null;

    doc.descendants((child, childPos) => {
        if (!child.isText || !mark.isInSet(child.marks)) {
            return true;
        }

        const childEnd = childPos + child.nodeSize;

        if (childPos <= pos && pos <= childEnd) {
            from = childPos;
            to = childEnd;
        } else if (to === childPos && from != null) {
            to = childEnd; // adjacent continuation of the same link
        }

        return true;
    });

    return from == null || to == null ? null : {from, to, mark};
}

/**
 * Suggests removing the link at the selection (editor3's
 * REMOVE_LINK_SUGGESTION): the link stays until the suggestion is
 * accepted.
 */
export function createRemoveLinkSuggestion(editor: Editor, data: ISuggestionData): string | null {
    const linkRange = getLinkRangeAt(editor, editor.state.selection.from);

    if (linkRange == null) {
        return null;
    }

    return addHighlightAtRange(editor, 'REMOVE_LINK_SUGGESTION', data, linkRange);
}

/**
 * Suggests changing the link at the selection (editor3's
 * CHANGE_LINK_SUGGESTION): the new link applies immediately; `from`/`to`
 * record what rejecting restores, in editor3's shape.
 */
export function createChangeLinkSuggestion(
    editor: Editor,
    link: {href: string},
    data: ISuggestionData,
): string | null {
    const linkRange = getLinkRangeAt(editor, editor.state.selection.from);

    if (linkRange == null) {
        return null;
    }

    const previous = {href: linkRange.mark.attrs.href};

    editor.commands.command(({state, tr, dispatch}) => {
        if (dispatch) {
            tr.removeMark(linkRange.from, linkRange.to, linkRange.mark);
            tr.addMark(linkRange.from, linkRange.to, state.schema.marks.link.create({href: link.href}));
            dispatch(tr);
        }

        return true;
    });

    return addHighlightAtRange(
        editor,
        'CHANGE_LINK_SUGGESTION',
        {...data, to: link, from: previous},
        linkRange,
    );
}

/**
 * A same-author paragraph-suggestion separator character directly before
 * or after `pos`, if any.
 */
function getAdjacentParagraphSeparator(
    editor: Editor,
    pos: number,
    highlightKey: string,
    author: string,
): {from: number; to: number; styleName: string} | null {
    for (const side of ['before', 'after'] as const) {
        const mark = getSuggestionMarkAt(editor, pos, side, [highlightKey]);

        if (mark != null && getHighlightData(editor, mark.attrs.styleName)?.author === author) {
            const from = side === 'before' ? pos - 1 : pos;

            return {from, to: from + 1, styleName: mark.attrs.styleName};
        }
    }

    return null;
}

function removeSeparatorChar(editor: Editor, separator: {from: number; to: number; styleName: string}): void {
    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.delete(separator.from, separator.to);
            dispatch(tr);
        }

        return true;
    });

    if (getHighlightedTextLength(editor, separator.styleName) < 1) {
        removeHighlight(editor, separator.styleName);
    }
}

/**
 * Splits the paragraph as a suggestion (editor3's
 * CREATE_SPLIT_PARAGRAPH_SUGGESTION): the block splits for real and a
 * marked paragraph-separator character records the suggestion at the end
 * of the first block. Splitting right where the same author suggested a
 * merge cancels the merge instead.
 */
export function createSplitParagraphSuggestion(editor: Editor, data: ISuggestionData): string | null {
    const pos = editor.state.selection.from;
    const cancellingMerge = getAdjacentParagraphSeparator(
        editor, pos, 'MERGE_PARAGRAPHS_SUGGESTION', data.author,
    );

    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.split(pos);
            dispatch(tr);
        }

        return true;
    });

    if (cancellingMerge != null) {
        // the split restores what the merge suggestion would have undone
        const mapped = cancellingMerge.from >= pos ? cancellingMerge.from + 2 : cancellingMerge.from;

        removeSeparatorChar(editor, {...cancellingMerge, from: mapped, to: mapped + 1});

        return null;
    }

    // after the split, the first block's content still ends at `pos`
    const separatorPos = pos;

    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.insertText(PARAGRAPH_SEPARATOR, separatorPos);
            dispatch(tr);
        }

        return true;
    });

    stripSuggestionMarks(editor, {from: separatorPos, to: separatorPos + 1});
    editor.commands.setTextSelection(separatorPos + 3);

    return addHighlightAtRange(
        editor,
        'SPLIT_PARAGRAPH_SUGGESTION',
        data,
        {from: separatorPos, to: separatorPos + 1},
    );
}

/**
 * Merges the block with the previous one as a suggestion (editor3's
 * setMergeParagraphSuggestion, reached by deleting at a block edge): the
 * blocks join for real and a marked separator character records where
 * the boundary was. Deleting a same-author split suggestion's separator
 * cancels the split instead.
 */
export function createMergeParagraphsSuggestion(editor: Editor, data: ISuggestionData): string | null {
    const {$from} = editor.state.selection;

    if ($from.parentOffset !== 0 || $from.index(-1) === 0) {
        return null;
    }

    const boundary = $from.before();
    const cancellingSplit = getAdjacentParagraphSeparator(
        editor, boundary - 1, 'SPLIT_PARAGRAPH_SUGGESTION', data.author,
    );

    if (cancellingSplit != null) {
        // deleting the suggested split restores the original single block
        editor.commands.command(({tr, dispatch}) => {
            if (dispatch) {
                tr.join(boundary);
                dispatch(tr);
            }

            return true;
        });
        removeSeparatorChar(editor, {...cancellingSplit, to: cancellingSplit.from + 1});

        return null;
    }

    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.join(boundary);
            dispatch(tr);
        }

        return true;
    });

    const separatorPos = boundary - 1;

    editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.insertText(PARAGRAPH_SEPARATOR, separatorPos);
            dispatch(tr);
        }

        return true;
    });

    stripSuggestionMarks(editor, {from: separatorPos, to: separatorPos + 1});
    editor.commands.setTextSelection(separatorPos);

    return addHighlightAtRange(
        editor,
        'MERGE_PARAGRAPHS_SUGGESTION',
        data,
        {from: separatorPos, to: separatorPos + 1},
    );
}

/**
 * Pastes content as an ADD suggestion (editor3's PASTE_ADD_SUGGESTION):
 * the content is inserted with formatting and every inserted character
 * belongs to the suggestion.
 */
export function pasteAddSuggestion(
    editor: Editor,
    insertContent: (editor: Editor) => void,
    data: ISuggestionData,
): string | null {
    if (!editor.state.selection.empty) {
        createDeleteSuggestion(editor, 'delete', data);
    }

    const from = editor.state.selection.from;

    insertContent(editor);

    const to = editor.state.selection.from;

    if (to <= from) {
        return null;
    }

    stripSuggestionMarks(editor, {from, to});

    return markRangeAsSuggestion(editor, {from, to}, 'ADD_SUGGESTION', data);
}

/**
 * Every unresolved suggestion in the document, newest first.
 */
export function getAllSuggestions(editor: Editor): Array<string> {
    const highlightsData = getCustomData(editor).highlightsData ?? {};
    const suggestionKeys = [
        ...CHANGE_SUGGESTION_KEYS,
        ...PARAGRAPH_SUGGESTION_KEYS,
        ...Object.keys(MARK_BY_STYLE_SUGGESTION_KEY),
        'BLOCK_STYLE_SUGGESTION', 'ADD_LINK_SUGGESTION', 'REMOVE_LINK_SUGGESTION', 'CHANGE_LINK_SUGGESTION',
    ];

    return Object.keys(highlightsData)
        .filter((styleName) => suggestionKeys.some((key) => styleName.indexOf(`${key}-`) === 0));
}

export function acceptAllSuggestions(editor: Editor, resolverData: ISuggestionData): void {
    getAllSuggestions(editor).forEach((styleName) => {
        acceptSuggestion(editor, styleName, resolverData);
    });
}

export function rejectAllSuggestions(editor: Editor, resolverData: ISuggestionData): void {
    getAllSuggestions(editor).forEach((styleName) => {
        rejectSuggestion(editor, styleName, resolverData);
    });
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

/**
 * Per-range resolution effects for suggestion types that keep their text:
 * paragraph separators are removed (rejecting also restores the block
 * structure), style/link suggestions restore the original on reject.
 */
function applyResolutionToRange(tr, state, range: {from: number; to: number; mark: Mark}, entry, accepted: boolean) {
    if (PARAGRAPH_SUGGESTION_KEYS.includes(entry.type)) {
        tr.delete(range.from, range.to);

        if (!accepted && entry.type === 'SPLIT_PARAGRAPH_SUGGESTION') {
            tr.join(range.from + 1);
        }

        if (!accepted && entry.type === 'MERGE_PARAGRAPHS_SUGGESTION') {
            tr.split(range.from);
        }

        return;
    }

    tr.removeMark(range.from, range.to, range.mark);

    const styleMarkName = MARK_BY_STYLE_SUGGESTION_KEY[entry.type];

    if (styleMarkName != null && !accepted) {
        // rejecting a style suggestion restores the original: the
        // suggestion either added the style (originalStyle empty; remove
        // it) or removed it (re-apply it)
        if (entry.originalStyle === '') {
            tr.removeMark(range.from, range.to, state.schema.marks[styleMarkName]);
        } else {
            tr.addMark(range.from, range.to, state.schema.marks[styleMarkName].create());
        }
    }

    const hasLink = state.doc.rangeHasMark(range.from, range.to, state.schema.marks.link);
    const removeLink = (entry.type === 'ADD_LINK_SUGGESTION' && !accepted)
        || (entry.type === 'REMOVE_LINK_SUGGESTION' && accepted);

    if (removeLink && hasLink) {
        tr.removeMark(range.from, range.to, state.schema.marks.link);
    }

    if (entry.type === 'CHANGE_LINK_SUGGESTION' && !accepted) {
        tr.removeMark(range.from, range.to, state.schema.marks.link);
        tr.addMark(
            range.from,
            range.to,
            state.schema.marks.link.create({href: entry.from?.href}),
        );
    }
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

    const ranges = findSuggestionRanges(editor, styleName);
    const suggestionText = ranges
        .map(({from, to}) => editor.state.doc.textBetween(from, to))
        .join('');

    const resolved = editor.commands.command(({state, tr, dispatch}) => {
        if (dispatch) {
            // accepted ADD and rejected DELETE keep the text; ADD/DELETE
            // otherwise remove it (editor3's applyChangeSuggestion)
            const removeText = CHANGE_SUGGESTION_KEYS.includes(entry.type)
                && accepted !== (entry.type === 'ADD_SUGGESTION');

            // reverse order so earlier positions stay valid on deletions
            for (const range of [...ranges].reverse()) {
                if (removeText) {
                    tr.delete(range.from, range.to);
                } else {
                    applyResolutionToRange(tr, state, range, entry, accepted);
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

    if (resolved && entry.type === 'BLOCK_STYLE_SUGGESTION' && !accepted && ranges.length > 0) {
        // rejecting toggles the block type back (editor3's toggleBlockType)
        const target = getBlockNodeForDraftType(entry.blockType);

        if (target != null) {
            toggleBlockNode(editor, {from: ranges[0].from, to: ranges[ranges.length - 1].to}, target);
        }
    }

    return resolved;
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

    // used for rich paste in suggesting mode; when absent, pasted content
    // degrades to plain text
    insertHtml?(editor: Editor, html: string): void;
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
                Enter: () => {
                    if (!isSuggestingMode(this.editor)) {
                        return false;
                    }

                    createSplitParagraphSuggestion(this.editor, options.getAuthorData());

                    return true;
                },
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

                            const html = event.clipboardData?.getData('text/html') ?? '';
                            const text = event.clipboardData?.getData('text/plain') ?? '';

                            if (html !== '' && options.insertHtml != null) {
                                // rich paste: content inserted with formatting,
                                // all of it belonging to one ADD suggestion
                                // (editor3's PASTE_ADD_SUGGESTION)
                                pasteAddSuggestion(
                                    editor,
                                    (targetEditor) => options.insertHtml(targetEditor, html),
                                    options.getAuthorData(),
                                );
                            } else if (text.length > 0) {
                                createAddSuggestion(editor, text, options.getAuthorData());
                            }

                            return true;
                        },
                    },
                }),
            ];
        },
    });
}
