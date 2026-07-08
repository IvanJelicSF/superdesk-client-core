import {ICustomFieldType, ICommonFieldConfig} from 'superdesk-api';
import {Editor as TiptapEditor} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {gettext} from 'core/utils';
import {convertDraftToPmDoc} from 'core/editor-tiptap';
import {getEditorTiptapExtensions} from 'core/editor-tiptap/extensions';
import {editingBehavior} from 'core/editor-tiptap/editing';
import {Editor} from './editor';
import {Preview} from './preview';
import {createSpellcheckerExtension} from 'core/editor-tiptap/spellchecker';
import {findReplace} from 'core/editor-tiptap/find-replace';
import {MediaNodeView} from './node-views/media';
import {EmbedNodeView} from './node-views/embed';
import {ArticleEmbedNodeView} from './node-views/article-embed';
import {mediaDropHandling} from './insertion';
import {spellcheckerMenu} from './spellchecker-menu';
import {highlightsClickHandling} from './highlights-ui';
import {createSuggestionsExtension} from 'core/editor-tiptap/suggestions';
import {getSuggestionMetadata} from 'core/editor3/actions/suggestions';

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

export interface ITiptapFieldConfig extends ICommonFieldConfig {
    // when set, the stored string value is plain text instead of HTML
    singleLine?: boolean;

    // used for displaying character statistics
    maxLength?: number;
}

export const TIPTAP_FIELD_TYPE = 'editor-tiptap';

function createOperationalValue(docJson: {[key: string]: any} | null, language: string): ITiptapValueOperational {
    const editor = new TiptapEditor({
        extensions: [
            ...getEditorTiptapExtensions({
                nodeViews: {
                    media: ReactNodeViewRenderer(MediaNodeView),
                    embed: ReactNodeViewRenderer(EmbedNodeView),
                    articleEmbed: ReactNodeViewRenderer(ArticleEmbedNodeView),
                },
            }),
            editingBehavior,
            mediaDropHandling,
            findReplace,
            highlightsClickHandling,
            createSuggestionsExtension({
                getAuthorData: getSuggestionMetadata,
            }),
            createSpellcheckerExtension({
                language,
                onContextMenu: (payload) => {
                    spellcheckerMenu.show({...payload, editor});
                },
            }),
        ],
        content: docJson ?? {type: 'doc', content: [{type: 'paragraph'}]},
    });

    return {editor};
}

export function tiptapToOperationalFormat(value: ITiptapValueStorage, language: string): ITiptapValueOperational {
    if (value?.tiptapState != null) {
        return createOperationalValue(value.tiptapState, language);
    }

    if (value?.rawContentState != null) {
        // lazy migration: the value was last saved by editor3
        return createOperationalValue(convertDraftToPmDoc(value.rawContentState), language);
    }

    return createOperationalValue(null, language);
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

        getEmptyValue: (config, language) => createOperationalValue(null, language),

        toStorageFormat: (valueOperational): ITiptapValueStorage => {
            return {tiptapState: valueOperational.editor.getJSON()};
        },

        toOperationalFormat: (value: ITiptapValueStorage, config, language: string): ITiptapValueOperational => {
            return tiptapToOperationalFormat(value, language);
        },
    };

    return field;
}
