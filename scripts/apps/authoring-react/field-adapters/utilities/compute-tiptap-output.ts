import {IEditor3Output} from 'superdesk-api';
import {pmDocToHtml, pmDocToPlainText, getAnnotationsForStorage} from 'core/editor-tiptap';
import {ITiptapFieldConfig} from '../../fields/tiptap';

/**
 * Computes the article output of a Tiptap field on save — the equivalent of
 * `computeEditor3Output`: the string value (HTML, or plain text for
 * single-line fields) and the annotations in storage format.
 */
export function computeTiptapOutput(
    tiptapState: {[key: string]: any},
    config: ITiptapFieldConfig,

    // return multi line text for fields with '\n'
    plainTextInMultiLineMode?: boolean,
): IEditor3Output {
    const generatedValue = (() => {
        if (config.singleLine || plainTextInMultiLineMode) {
            return pmDocToPlainText(tiptapState);
        } else {
            return pmDocToHtml(tiptapState);
        }
    })();

    return {
        stringValue: generatedValue,
        annotations: getAnnotationsForStorage(tiptapState),
    };
}
