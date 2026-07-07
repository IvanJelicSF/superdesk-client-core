import {ICustomFieldType, ICommonFieldConfig} from 'superdesk-api';
import {Editor as TiptapEditor} from '@tiptap/core';
import {gettext} from 'core/utils';
import {convertDraftToPmDoc} from 'core/editor-tiptap';
import {getEditorTiptapExtensions} from 'core/editor-tiptap/extensions';
import {Editor} from './editor';
import {Preview} from './preview';

/**
 * Tiptap-based rich text field (editor3 replacement, migration Phase 2).
 * Development-only until feature parity is reached; enabled per instance
 * via `appConfig.features.tiptapEditor`.
 */

export interface ITiptapValueOperational {
    // the live editor holds the document; storage JSON is derived on demand
    editor: TiptapEditor;
}

export interface ITiptapValueStorage {
    // ProseMirror document JSON (`fields_meta[field].tiptapState`)
    tiptapState?: {[key: string]: any};

    // editor3 storage shape: present when a field previously configured
    // with editor3 is opened with the Tiptap editor (lazy data conversion)
    rawContentState?: any;
}

export type ITiptapFieldConfig = ICommonFieldConfig;

export const TIPTAP_FIELD_TYPE = 'editor-tiptap';

function createOperationalValue(docJson: {[key: string]: any} | null): ITiptapValueOperational {
    const editor = new TiptapEditor({
        extensions: getEditorTiptapExtensions(),
        content: docJson ?? {type: 'doc', content: [{type: 'paragraph'}]},
    });

    return {editor};
}

export function tiptapToOperationalFormat(value: ITiptapValueStorage): ITiptapValueOperational {
    if (value?.tiptapState != null) {
        return createOperationalValue(value.tiptapState);
    }

    if (value?.rawContentState != null) {
        // lazy migration: the value was last saved by editor3
        return createOperationalValue(convertDraftToPmDoc(value.rawContentState));
    }

    return createOperationalValue(null);
}

export function getTiptapField()
: ICustomFieldType<ITiptapValueOperational, ITiptapValueStorage, ITiptapFieldConfig, never> {
    const field: ICustomFieldType<ITiptapValueOperational, ITiptapValueStorage, ITiptapFieldConfig, never> = {
        id: TIPTAP_FIELD_TYPE,
        generic: true,
        label: gettext('Tiptap editor (experimental)'),
        editorComponent: Editor,
        previewComponent: Preview,

        hasValue: (valueOperational) => valueOperational.editor.state.doc.textContent.trim().length > 0,

        getEmptyValue: () => createOperationalValue(null),

        toStorageFormat: (valueOperational): ITiptapValueStorage => {
            return {tiptapState: valueOperational.editor.getJSON()};
        },

        toOperationalFormat: (value: ITiptapValueStorage): ITiptapValueOperational => {
            return tiptapToOperationalFormat(value);
        },
    };

    return field;
}
