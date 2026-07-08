import {IArticle, IAuthoringFieldV2, IFieldAdapter, IEditor3Config, IEditor3ValueStorage} from 'superdesk-api';
import {appConfig} from 'appConfig';
import {gettext} from 'core/utils';
import {retrieveStoredValueEditor3Generic, storeEditor3ValueBase} from '.';
import {copyEmbeddedArticlesIntoAssociations} from '../copy-embedded-articles-into-associations';
import {editor3ToOperationalFormat} from '../fields/editor3';
import {getEmbeddedArticles} from 'core/editor-tiptap';
import {TIPTAP_FIELD_TYPE, ITiptapFieldConfig, ITiptapValueStorage} from '../fields/tiptap';
import {retrieveStoredValueTiptapGeneric, storeTiptapValueBase} from './utilities/tiptap-value';

function tiptapEnabled(): boolean {
    return appConfig.features?.tiptapEditor === true;
}

function storeTiptapValue(
    value: ITiptapValueStorage,
    item: IArticle,
    config: ITiptapFieldConfig,
    preferIncomplete: boolean,
): IArticle {
    if (preferIncomplete) {
        return {
            ...item,
            fields_meta: {
                ...(item.fields_meta ?? {}),
                body_html: {
                    tiptapState: [value.tiptapState],
                },
            },
        };
    }

    const result = storeTiptapValueBase('body_html', item, value, config);
    const articleUpdated = {...result.article};

    articleUpdated.body_html = result.stringValue;

    // Keep compatibility with existing output format.
    // (only applicable to body_html field)
    articleUpdated.annotations = result.annotations;

    /**
     * Putting embedded articles into associations.
     * It's meant for external use after the item is published.
     */
    for (const embeddedItem of getEmbeddedArticles(value.tiptapState)) {
        if (articleUpdated.associations == null) {
            articleUpdated.associations = {};
        }

        articleUpdated.associations[embeddedItem._id] = embeddedItem;
    }

    return articleUpdated;
}

export const body_html: IFieldAdapter<IArticle> = {
    getFieldV2: (fieldEditor, fieldSchema) => {
        if (tiptapEnabled()) {
            const tiptapConfig: ITiptapFieldConfig = {
                singleLine: false,
                maxLength: fieldSchema?.maxlength,
            };

            const tiptapFieldV2: IAuthoringFieldV2 = {
                id: 'body_html',
                name: gettext('Body HTML'),
                fieldType: TIPTAP_FIELD_TYPE,
                fieldConfig: tiptapConfig,
            };

            return tiptapFieldV2;
        }

        const fieldConfig: IEditor3Config = {
            editorFormat: fieldEditor.formatOptions ?? [],
            minLength: fieldSchema?.minlength,
            maxLength: fieldSchema?.maxlength,
            maxSoftLength: fieldEditor?.maxSoftLength,
            showFloatingCount: fieldEditor?.showFloatingCount,
            cleanPastedHtml: fieldEditor?.cleanPastedHTML,
            singleLine: false,
            disallowedCharacters: [],
        };

        const fieldV2: IAuthoringFieldV2 = {
            id: 'body_html',
            name: gettext('Body HTML'),
            fieldType: 'editor3',
            fieldConfig,
        };

        return fieldV2;
    },

    retrieveStoredValue: (item: IArticle, authoringStorage) => {
        if (tiptapEnabled()) {
            return retrieveStoredValueTiptapGeneric('body_html', item);
        }

        return retrieveStoredValueEditor3Generic(
            'body_html',
            item,
            authoringStorage,
        );
    },

    storeValue: (value: IEditor3ValueStorage | ITiptapValueStorage, item, config, preferIncomplete) => {
        if (tiptapEnabled()) {
            return storeTiptapValue(value as ITiptapValueStorage, item, config, preferIncomplete);
        }

        if (preferIncomplete) {
            return {
                ...item,
                fields_meta: {
                    ...(item.fields_meta ?? {}),
                    body_html: {
                        draftjsState: [value.rawContentState],
                    },
                },
            };
        } else {
            const result = storeEditor3ValueBase(
                'body_html',
                item,
                value,
                config,
            );

            const articleUpdated = {...result.article};

            articleUpdated.body_html = result.stringValue;

            // Keep compatibility with existing output format.
            // (only applicable to body_html field)
            articleUpdated.annotations = result.annotations;

            const contentState = editor3ToOperationalFormat(value as IEditor3ValueStorage, item.language).contentState;

            copyEmbeddedArticlesIntoAssociations(contentState, articleUpdated);

            return articleUpdated;
        }
    },
};
