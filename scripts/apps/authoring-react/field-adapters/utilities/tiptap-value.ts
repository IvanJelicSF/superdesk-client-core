import {IArticle} from 'superdesk-api';
import {plainTextToPmDoc} from 'core/editor-tiptap';
import {ITiptapValueStorage, ITiptapFieldConfig} from '../../fields/tiptap';
import {computeTiptapOutput} from './compute-tiptap-output';

/**
 * Storage plumbing for Tiptap fields — the equivalents of
 * `storeEditor3ValueBase` and `retrieveStoredValueEditor3Generic`.
 *
 * The stored editor state lives in `fields_meta[field].tiptapState`;
 * `draftjsState` written by editor3 is returned as-is and converted lazily
 * by the field's `toOperationalFormat` (lazy data migration).
 */

export function retrieveStoredValueTiptapGeneric(
    fieldId: string,
    article: IArticle,
): ITiptapValueStorage {
    const fieldMeta = article.fields_meta?.[fieldId];

    if (fieldMeta?.tiptapState?.[0] != null) {
        return {tiptapState: fieldMeta.tiptapState[0]};
    }

    if (fieldMeta?.draftjsState?.[0] != null) {
        // saved by editor3; converted on open
        return {rawContentState: fieldMeta.draftjsState[0]};
    }

    if (typeof article[fieldId] === 'string' && article[fieldId].length > 0) {
        /**
         * This is only for compatibility with angular based authoring.
         * Create a document in case only a text value is present.
         */
        return {tiptapState: plainTextToPmDoc(article[fieldId])};
    }

    return {tiptapState: plainTextToPmDoc('')};
}

export function storeTiptapValueBase(
    fieldId: string,
    article: IArticle,
    value: ITiptapValueStorage,
    config: ITiptapFieldConfig,
    plainTextInMultiLineMode?: boolean,
): {article: IArticle; stringValue: string; annotations: Array<any>} {
    const tiptapState = value.tiptapState;

    const {stringValue, annotations} = computeTiptapOutput(
        tiptapState,
        config,
        plainTextInMultiLineMode,
    );

    const articleUpdated: IArticle = {
        ...article,
        fields_meta: {
            ...(article.fields_meta ?? {}),
            [fieldId]: {
                tiptapState: [tiptapState],
            },
        },
    };

    if (annotations.length > 0) {
        articleUpdated.fields_meta[fieldId].annotations = annotations;
    }

    return {article: articleUpdated, stringValue, annotations};
}
