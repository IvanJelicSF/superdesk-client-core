/* eslint-disable max-len, quotes, quote-props */
import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editorTiptapSchema} from '../schema';
import {convertDraftToPmDoc} from '../from-draftjs';
import {pmDocToHtml} from '../to-html';

/**
 * The Tiptap editor's schema is generated from `editorTiptapSchema`
 * (see extensions.ts); these tests pin that the two stay in sync and that
 * documents produced by the Draft.js converter survive a load into the
 * editor unchanged.
 */
describe('editor-tiptap extensions', () => {
    it('generates a schema with the same nodes and marks as editorTiptapSchema', () => {
        const editor = new Editor({extensions: getEditorTiptapExtensions()});

        expect(Object.keys(editor.schema.nodes).sort())
            .toEqual(Object.keys(editorTiptapSchema.nodes).sort());
        expect(Object.keys(editor.schema.marks).sort())
            .toEqual(Object.keys(editorTiptapSchema.marks).sort());

        for (const nodeName of Object.keys(editorTiptapSchema.nodes)) {
            expect(editor.schema.nodes[nodeName].spec.content ?? '')
                .toBe(editorTiptapSchema.nodes[nodeName].spec.content ?? '', `content of ${nodeName}`);
        }

        editor.destroy();
    });

    it('loads a converted document and serializes it to identical HTML', () => {
        const rawContentState: any = {
            blocks: [
                {key: 'h1', text: 'Title', type: 'header-one', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'b1', text: 'bold italic link', type: 'unstyled', depth: 0, inlineStyleRanges: [{offset: 0, length: 4, style: 'BOLD'}, {offset: 5, length: 6, style: 'ITALIC'}], entityRanges: [{offset: 12, length: 4, key: 0}], data: {}},
                {key: 'l1', text: 'item one', type: 'unordered-list-item', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'l2', text: 'item two', type: 'unordered-list-item', depth: 1, inlineStyleRanges: [], entityRanges: [], data: {}},
            ],
            entityMap: {0: {type: 'LINK', mutability: 'MUTABLE', data: {link: {href: 'https://example.com'}}}},
        };

        const docJson = convertDraftToPmDoc(rawContentState);
        const editor = new Editor({extensions: getEditorTiptapExtensions(), content: docJson});

        expect(pmDocToHtml(editor.getJSON())).toBe(pmDocToHtml(docJson));

        editor.destroy();
    });

    it('produces an editable document with typed text reflected in output', () => {
        const editor = new Editor({extensions: getEditorTiptapExtensions()});

        editor.commands.insertContent('hello world');

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>hello world</p>');

        editor.destroy();
    });
});
