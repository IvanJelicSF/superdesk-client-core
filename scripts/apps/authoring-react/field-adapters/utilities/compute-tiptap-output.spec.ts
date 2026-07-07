/* eslint-disable max-len */
import {IArticle} from 'superdesk-api';
import {computeEditor3Output} from './compute-editor3-output';
import {computeTiptapOutput} from './compute-tiptap-output';
import {retrieveStoredValueTiptapGeneric, storeTiptapValueBase} from './tiptap-value';
import {convertDraftToPmDoc, getEmbeddedArticles} from 'core/editor-tiptap';

/**
 * The output computed on save by the Tiptap field (string value +
 * annotations) must be byte-identical to editor3's for converted content.
 */

const rawWithAnnotations: any = {
    entityMap: {},
    blocks: [{
        key: '2sso6',
        text: 'lorem ipsum dolor',
        type: 'unstyled',
        depth: 0,
        entityRanges: [],
        inlineStyleRanges: [
            {offset: 6, length: 5, style: 'ANNOTATION-1'},
            {offset: 12, length: 5, style: 'ANNOTATION-2'},
        ],
        data: {
            MULTIPLE_HIGHLIGHTS: {
                lastHighlightIds: {ANNOTATION: 2},
                highlightsData: {
                    'ANNOTATION-1': {
                        data: {
                            email: 'admin@admin.ro',
                            date: '2018-03-30T14:57:53.172Z',
                            msg: JSON.stringify({blocks: [{key: 'ejm11', text: 'Annotation 1', type: 'unstyled', depth: 0, inlineStyleRanges: [{offset: 0, length: 10, style: 'BOLD'}], entityRanges: [], data: {}}], entityMap: {}}),
                            author: 'admin',
                            annotationType: 'regular',
                        },
                        type: 'ANNOTATION',
                    },
                    'ANNOTATION-2': {
                        data: {
                            email: 'admin@admin.ro',
                            date: '2018-03-30T14:58:20.876Z',
                            msg: JSON.stringify({blocks: [{key: '9i73f', text: 'Annotation 2', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}}, {key: 'd3vb3', text: 'Line 2', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}}], entityMap: {}}),
                            author: 'admin',
                            annotationType: 'remark',
                        },
                        type: 'ANNOTATION',
                    },
                },
            },
        },
    }],
};

const rawMultiBlock: any = {
    entityMap: {},
    blocks: [
        {key: 'b1', text: 'first line', type: 'unstyled', depth: 0, inlineStyleRanges: [{offset: 0, length: 5, style: 'BOLD'}], entityRanges: [], data: {}},
        {key: 'b2', text: 'second\nline', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
        {key: 'b3', text: 'a list item', type: 'unordered-list-item', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
        {key: 'b4', text: 'a heading', type: 'header-two', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
    ],
};

describe('editor-tiptap field output', () => {
    beforeEach(window.module('superdesk.apps.spellcheck'));

    it('computes string value and annotations identical to editor3', () => {
        const editor3Output = computeEditor3Output(rawWithAnnotations, {editorFormat: []} as any, 'en');
        const tiptapOutput = computeTiptapOutput(convertDraftToPmDoc(rawWithAnnotations), {});

        expect(tiptapOutput.stringValue).toBe(editor3Output.stringValue);
        expect(tiptapOutput.annotations).toEqual(editor3Output.annotations);

        expect(tiptapOutput.annotations.length).toBe(2);
        expect(tiptapOutput.annotations[0].id).toBe(1);
        expect(tiptapOutput.annotations[0].type).toBe('regular');
        expect(tiptapOutput.annotations[0].body).toBe('<p><b>Annotation</b> 1</p>');
        expect(tiptapOutput.annotations[1].type).toBe('remark');
    });

    it('computes plain text identical to editor3 in single line mode', () => {
        const editor3Output = computeEditor3Output(rawMultiBlock, {editorFormat: [], singleLine: true} as any, 'en');
        const tiptapOutput = computeTiptapOutput(convertDraftToPmDoc(rawMultiBlock), {singleLine: true});

        expect(tiptapOutput.stringValue).toBe(editor3Output.stringValue);
    });

    it('computes plain text identical to editor3 in plainTextInMultiLineMode', () => {
        const editor3Output = computeEditor3Output(rawMultiBlock, {editorFormat: []} as any, 'en', true);
        const tiptapOutput = computeTiptapOutput(convertDraftToPmDoc(rawMultiBlock), {}, true);

        expect(tiptapOutput.stringValue).toBe(editor3Output.stringValue);
    });

    it('stores tiptapState and annotations in fields_meta', () => {
        const doc = convertDraftToPmDoc(rawWithAnnotations);
        const article = {language: 'en'} as IArticle;

        const result = storeTiptapValueBase('body_html', article, {tiptapState: doc}, {});

        expect(result.article.fields_meta.body_html.tiptapState).toEqual([doc]);
        expect(result.article.fields_meta.body_html.annotations.length).toBe(2);
        expect(result.stringValue).toContain('annotation-id="1"');
    });

    it('retrieves tiptapState, falls back to draftjsState, then to the string value', () => {
        const doc = convertDraftToPmDoc(rawMultiBlock);

        expect(
            retrieveStoredValueTiptapGeneric(
                'body_html',
                {fields_meta: {body_html: {tiptapState: [doc]}}} as unknown as IArticle,
            ),
        ).toEqual({tiptapState: doc});

        expect(
            retrieveStoredValueTiptapGeneric(
                'body_html',
                {fields_meta: {body_html: {draftjsState: [rawMultiBlock]}}} as unknown as IArticle,
            ),
        ).toEqual({rawContentState: rawMultiBlock});

        const fromString = retrieveStoredValueTiptapGeneric(
            'headline',
            {headline: 'plain headline'} as unknown as IArticle,
        );

        expect(fromString.tiptapState.content).toEqual([
            {type: 'paragraph', content: [{type: 'text', text: 'plain headline'}]},
        ]);
    });

    it('extracts embedded articles for associations', () => {
        const rawWithArticleEmbed: any = {
            blocks: [
                {key: 'p1', text: 'before', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'a1', text: ' ', type: 'atomic', depth: 0, inlineStyleRanges: [], entityRanges: [{offset: 0, length: 1, key: 0}], data: {}},
            ],
            entityMap: {
                0: {type: 'ARTICLE_EMBED', mutability: 'MUTABLE', data: {item: {_id: 'urn:embedded', body_html: '<p>x</p>'}}},
            },
        };

        const items = getEmbeddedArticles(convertDraftToPmDoc(rawWithArticleEmbed));

        expect(items.length).toBe(1);
        expect(items[0]._id).toBe('urn:embedded');
    });
});
