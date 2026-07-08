import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {
    addHighlight,
    updateHighlightData,
    removeHighlight,
    resolveComment,
    getHighlightData,
    getHighlightedText,
    getHighlightsAt,
    getCustomData,
    getPublicApiComments,
} from '../highlights';
import {pmDocToHtml} from '../to-html';
import {getAnnotationsForStorage} from '../output';

function createEditor(text: string): Editor {
    return new Editor({
        extensions: [...getEditorTiptapExtensions(), editingBehavior],
        content: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text}]}]},
    });
}

describe('editor-tiptap highlights (comments and annotations)', () => {
    let editor: Editor;

    afterEach(() => {
        editor?.destroy();
    });

    it('adds comments with generated style names and sidecar data', () => {
        editor = createEditor('some commented text');

        editor.commands.setTextSelection({from: 6, to: 15});

        const styleName = addHighlight(editor, 'COMMENT', {data: {msg: 'a comment', author: 'admin'}});

        expect(styleName).toBe('COMMENT-1');
        expect(getCustomData(editor).lastHighlightIds.COMMENT).toBe(1);
        expect(getHighlightData(editor, 'COMMENT-1')).toEqual({
            data: {msg: 'a comment', author: 'admin'},
            type: 'COMMENT',
        });
        expect(getHighlightedText(editor, 'COMMENT-1')).toBe('commented');

        // comments produce no markup in the published output
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>some commented text</p>');

        // ids keep incrementing
        editor.commands.setTextSelection({from: 1, to: 5});
        expect(addHighlight(editor, 'COMMENT', {data: {msg: 'second'}})).toBe('COMMENT-2');
    });

    it('does not add a highlight without a selection', () => {
        editor = createEditor('text');

        editor.commands.setTextSelection(2);
        expect(addHighlight(editor, 'COMMENT', {data: {msg: 'x'}})).toBe(null);
    });

    it('adds annotations that appear in html output and annotations field', () => {
        editor = createEditor('annotated word here');

        editor.commands.setTextSelection({from: 11, to: 15});
        addHighlight(editor, 'ANNOTATION', {data: {
            msg: JSON.stringify({
                blocks: [{
                    key: 'x1',
                    text: 'note body',
                    type: 'unstyled',
                    depth: 0,
                    inlineStyleRanges: [],
                    entityRanges: [],
                    data: {},
                }],
                entityMap: {},
            }),
            annotationType: 'regular',
            author: 'admin',
        }});

        expect(pmDocToHtml(editor.getJSON()))
            .toBe('<p>annotated <span annotation-id="1">word</span> here</p>');

        const annotations = getAnnotationsForStorage(editor.getJSON());

        expect(annotations).toEqual([{id: 1, type: 'regular', body: '<p>note body</p>'}]);
    });

    it('updates highlight data', () => {
        editor = createEditor('text to annotate');

        editor.commands.setTextSelection({from: 1, to: 5});
        addHighlight(editor, 'ANNOTATION', {data: {msg: 'old', annotationType: 'regular'}});

        updateHighlightData(editor, 'ANNOTATION-1', {data: {msg: 'new', annotationType: 'remark'}});

        expect(getHighlightData(editor, 'ANNOTATION-1').data).toEqual({msg: 'new', annotationType: 'remark'});
    });

    it('removes a highlight without touching overlapping ones', () => {
        editor = createEditor('overlapping highlights');

        editor.commands.setTextSelection({from: 1, to: 12});
        addHighlight(editor, 'COMMENT', {data: {msg: 'first'}});

        editor.commands.setTextSelection({from: 5, to: 23});
        addHighlight(editor, 'COMMENT', {data: {msg: 'second'}});

        removeHighlight(editor, 'COMMENT-1');

        expect(getHighlightData(editor, 'COMMENT-1')).toBeUndefined();
        expect(getHighlightedText(editor, 'COMMENT-1')).toBe('');
        expect(getHighlightedText(editor, 'COMMENT-2')).toBe('lapping highlights');
    });

    it('resolves comments into the resolved history', () => {
        editor = createEditor('resolve this comment');

        editor.commands.setTextSelection({from: 9, to: 13});
        addHighlight(editor, 'COMMENT', {data: {msg: 'fix it', author: 'admin', replies: []}});

        resolveComment(editor, 'COMMENT-1', {resolverUserId: 'user-1', date: '2026-07-08T00:00:00Z'});

        const customData = getCustomData(editor);

        expect(customData.highlightsData['COMMENT-1']).toBeUndefined();
        expect(getHighlightedText(editor, 'COMMENT-1')).toBe('');
        expect(customData.resolvedCommentsHistory).toEqual([{
            data: {
                msg: 'fix it',
                author: 'admin',
                replies: [],
                commentedText: 'this',
                resolutionInfo: {resolverUserId: 'user-1', date: '2026-07-08T00:00:00Z'},
            },
        }]);
    });

    it('finds highlights at a position', () => {
        editor = createEditor('find me');

        editor.commands.setTextSelection({from: 1, to: 8});
        addHighlight(editor, 'COMMENT', {data: {msg: 'x'}});

        expect(getHighlightsAt(editor.state, 3)).toEqual([{styleName: 'COMMENT-1', highlightKey: 'COMMENT'}]);
    });

    it('exposes comment payloads as __PUBLIC_API__comments data', () => {
        editor = createEditor('public comments');

        editor.commands.setTextSelection({from: 1, to: 7});
        addHighlight(editor, 'COMMENT', {data: {msg: 'visible to server', author: 'admin'}});

        editor.commands.setTextSelection({from: 8, to: 15});
        addHighlight(editor, 'ANNOTATION', {data: {msg: 'not a comment', annotationType: 'regular'}});

        expect(getPublicApiComments(editor.getJSON()))
            .toEqual([{msg: 'visible to server', author: 'admin'}]);
    });
});
