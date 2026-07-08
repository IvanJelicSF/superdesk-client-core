import {Node as PmNode} from '@tiptap/pm/model';
import {toPmNode} from './output';

/**
 * Read helpers for consumers outside the editor (widgets, macros) that
 * inspect the stored editor state of an article. These are the Tiptap
 * counterparts of `editor3CustomData`/`fieldsMeta` helpers reading
 * `fields_meta[field].draftjsState`; here the stored state is
 * `fields_meta[field].tiptapState` (ProseMirror doc JSON with the
 * `customData` sidecar in doc attrs).
 */

export function getTiptapStateFromItem(item: {fields_meta?: any}, fieldId: string): {[key: string]: any} | null {
    return item?.fields_meta?.[fieldId]?.tiptapState?.[0] ?? null;
}

function getCustomDataFromState(docJson: {[key: string]: any}): {[key: string]: any} {
    return docJson?.attrs?.customData ?? {};
}

/**
 * Same entry shape as editor3's RESOLVED_COMMENTS_HISTORY:
 * `{data: {msg, author, replies, commentedText, resolutionInfo, ...}}`.
 */
export function getResolvedCommentsFromTiptapState(docJson: {[key: string]: any}): Array<any> {
    return getCustomDataFromState(docJson).resolvedCommentsHistory ?? [];
}

/**
 * Same entry shape as editor3's RESOLVED_SUGGESTIONS_HISTORY:
 * `{suggestionText, oldText, suggestionInfo, resolutionInfo}`.
 */
export function getResolvedSuggestionsFromTiptapState(docJson: {[key: string]: any}): Array<any> {
    return getCustomDataFromState(docJson).resolvedSuggestionsHistory ?? [];
}

/**
 * Text covered by a highlight in a stored document (the counterpart of
 * `getRangeAndTextForStyleInRawState`).
 */
export function getHighlightedTextInState(docJson: {[key: string]: any}, styleName: string): string {
    const doc: PmNode = toPmNode(docJson);
    let text = '';

    doc.descendants((node) => {
        if (node.isText && node.marks.some(
            (mark) => mark.type.name === 'highlight' && mark.attrs.styleName === styleName,
        )) {
            text += node.text ?? '';
        }

        return true;
    });

    return text;
}

/**
 * Unresolved comments in the shape the inline-comments widget uses:
 * the stored `{data, type}` entry with `commentedText` merged in, plus
 * the `highlightId`.
 */
export function getUnresolvedCommentsFromTiptapState(docJson: {[key: string]: any}): Array<any> {
    const highlightsData = getCustomDataFromState(docJson).highlightsData ?? {};

    return Object.keys(highlightsData)
        .filter((styleName) => styleName.indexOf('COMMENT-') === 0)
        .map((styleName) => ({
            ...highlightsData[styleName],
            data: {
                ...highlightsData[styleName].data,
                commentedText: getHighlightedTextInState(docJson, styleName),
            },
            highlightId: styleName,
        }));
}
