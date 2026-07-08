import {Editor} from '@tiptap/core';
import {Node as PmNode, Mark} from '@tiptap/pm/model';
import {EditorState} from '@tiptap/pm/state';
import {IEditorTiptapCustomData} from './schema';
import {toPmNode} from './output';

/**
 * Comments and annotations for the Tiptap editor — the equivalents of
 * editor3's `highlightsManager` (`helpers/highlights.ts`). Ranges are
 * `highlight` marks named `<KEY>-<n>`; payloads live in the document
 * attribute sidecar (`doc.attrs.customData.highlightsData`), exactly as
 * converted from editor3's first-block data.
 */

export interface IHighlightRange {
    styleName: string;
    highlightKey: string;
    from: number;
    to: number;
    text: string;
}

export function getCustomData(editor: Editor): IEditorTiptapCustomData {
    return editor.state.doc.attrs.customData ?? {highlightsData: {}, lastHighlightIds: {}};
}

export function getHighlightData(editor: Editor, styleName: string): any {
    return getCustomData(editor).highlightsData[styleName];
}

/**
 * Adds a highlight of the given config key (COMMENT, ANNOTATION, ...) to
 * the selection. Returns the generated style name, or null when there is
 * no selection to highlight.
 */
export function addHighlight(
    editor: Editor,
    highlightKey: string,
    data: {[key: string]: any},
): string | null {
    const {from, to, empty} = editor.state.selection;

    if (empty) {
        return null;
    }

    const customData = getCustomData(editor);
    const nextId = (customData.lastHighlightIds?.[highlightKey] ?? 0) + 1;
    const styleName = `${highlightKey}-${nextId}`;

    editor.commands.command(({state, tr, dispatch}) => {
        if (dispatch) {
            tr.addMark(from, to, state.schema.marks.highlight.create({styleName, highlightKey}));
            tr.setDocAttribute('customData', {
                ...customData,
                lastHighlightIds: {
                    ...customData.lastHighlightIds,
                    [highlightKey]: nextId,
                },
                highlightsData: {
                    ...customData.highlightsData,
                    [styleName]: {data, type: highlightKey},
                },
            });
            dispatch(tr);
        }

        return true;
    });

    return styleName;
}

export function updateHighlightData(editor: Editor, styleName: string, data: {[key: string]: any}): boolean {
    const customData = getCustomData(editor);

    if (customData.highlightsData[styleName] == null) {
        return false;
    }

    return editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            tr.setDocAttribute('customData', {
                ...customData,
                highlightsData: {
                    ...customData.highlightsData,
                    [styleName]: {...customData.highlightsData[styleName], data},
                },
            });
            dispatch(tr);
        }

        return true;
    });
}

function findMarkRanges(doc: PmNode, styleName: string): Array<{from: number; to: number; mark: Mark; text: string}> {
    const ranges: Array<{from: number; to: number; mark: Mark; text: string}> = [];

    doc.descendants((node, pos) => {
        if (node.isText) {
            const mark = node.marks.find(
                (nodeMark) => nodeMark.type.name === 'highlight' && nodeMark.attrs.styleName === styleName,
            );

            if (mark != null) {
                ranges.push({from: pos, to: pos + node.nodeSize, mark, text: node.text ?? ''});
            }
        }

        return true;
    });

    return ranges;
}

/**
 * Text covered by a highlight (the equivalent of editor3's
 * `getRangeAndTextForStyle`).
 */
export function getHighlightedText(editor: Editor, styleName: string): string {
    return findMarkRanges(editor.state.doc, styleName).map(({text}) => text).join('');
}

function removeHighlightAndUpdateData(
    editor: Editor,
    styleName: string,
    updateCustomData: (customData: IEditorTiptapCustomData) => IEditorTiptapCustomData,
): boolean {
    const ranges = findMarkRanges(editor.state.doc, styleName);

    return editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            for (const range of ranges) {
                tr.removeMark(range.from, range.to, range.mark);
            }

            tr.setDocAttribute('customData', updateCustomData(getCustomData(editor)));
            dispatch(tr);
        }

        return true;
    });
}

export function removeHighlight(editor: Editor, styleName: string): boolean {
    return removeHighlightAndUpdateData(editor, styleName, (customData) => {
        const highlightsData = {...customData.highlightsData};

        delete highlightsData[styleName];

        return {...customData, highlightsData};
    });
}

/**
 * Resolves a comment: the mark is removed and the comment moves to the
 * resolved history with the covered text and resolution metadata — the
 * same shape editor3's `resolveComment` produced.
 */
export function resolveComment(
    editor: Editor,
    styleName: string,
    resolutionInfo: {resolverUserId: string; date: Date | string},
): boolean {
    const entry = getHighlightData(editor, styleName);

    if (entry == null) {
        return false;
    }

    const commentedText = getHighlightedText(editor, styleName);

    return removeHighlightAndUpdateData(editor, styleName, (customData) => {
        const highlightsData = {...customData.highlightsData};

        delete highlightsData[styleName];

        return {
            ...customData,
            highlightsData,
            resolvedCommentsHistory: [
                ...(customData.resolvedCommentsHistory ?? []),
                {data: {...entry.data, commentedText, resolutionInfo}},
            ],
        };
    });
}

/**
 * Highlights at a document position, e.g. for showing a popup on click.
 */
export function getHighlightsAt(state: EditorState, pos: number): Array<{styleName: string; highlightKey: string}> {
    const resolved = state.doc.resolve(pos);
    const marks = resolved.marks();

    return marks
        .filter((mark) => mark.type.name === 'highlight')
        .map((mark) => ({styleName: mark.attrs.styleName, highlightKey: mark.attrs.highlightKey}));
}

/**
 * The `__PUBLIC_API__comments` value: plain comment payloads, exposed for
 * the server and consumers outside the editor (the equivalent of editor3's
 * `addCommentsForServer`).
 */
export function getPublicApiComments(docJson: {[key: string]: any} | PmNode): Array<any> {
    const doc = docJson instanceof PmNode ? docJson : toPmNode(docJson);
    const highlightsData = doc.attrs.customData?.highlightsData ?? {};

    return Object.keys(highlightsData)
        .filter((styleName) => styleName.indexOf('COMMENT-') === 0)
        .map((styleName) => highlightsData[styleName].data);
}
