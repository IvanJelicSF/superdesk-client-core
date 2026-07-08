import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {addHighlight, resolveComment} from '../highlights';
import {createAddSuggestion, acceptSuggestion} from '../suggestions';
import {
    getTiptapStateFromItem,
    getResolvedCommentsFromTiptapState,
    getResolvedSuggestionsFromTiptapState,
    getUnresolvedCommentsFromTiptapState,
    getHighlightedTextInState,
} from '../article-access';

/**
 * The read helpers used by consumers outside the editor (track-changes
 * widgets) against a document produced by the editing modules and stored
 * in the `fields_meta` shape.
 */

const date = '2026-07-08T00:00:00Z';

describe('editor-tiptap article access', () => {
    it('reads comments and suggestions from a stored article', () => {
        const editor = new Editor({
            extensions: [...getEditorTiptapExtensions(), editingBehavior],
            content: {type: 'doc', content: [
                {type: 'paragraph', content: [{type: 'text', text: 'commented text here'}]},
            ]},
        });

        // one comment stays unresolved, one gets resolved
        editor.commands.setTextSelection({from: 1, to: 10});
        addHighlight(editor, 'COMMENT', {data: {msg: 'first comment', author: 'admin', replies: []}});

        editor.commands.setTextSelection({from: 11, to: 15});
        addHighlight(editor, 'COMMENT', {data: {msg: 'second comment', author: 'admin', replies: []}});
        resolveComment(editor, 'COMMENT-2', {resolverUserId: 'user-1', date});

        // one accepted suggestion
        editor.commands.setTextSelection(16);
        createAddSuggestion(editor, 'new ', {author: 'author_id', date});
        acceptSuggestion(editor, 'ADD_SUGGESTION-1', {author: 'resolver_id', date});

        const item = {
            fields_meta: {
                body_html: {tiptapState: [editor.getJSON()]},
            },
        };

        const state = getTiptapStateFromItem(item, 'body_html');

        expect(state).not.toBe(null);
        expect(getTiptapStateFromItem(item, 'headline')).toBe(null);

        const unresolved = getUnresolvedCommentsFromTiptapState(state);

        expect(unresolved.length).toBe(1);
        expect(unresolved[0].highlightId).toBe('COMMENT-1');
        expect(unresolved[0].data.msg).toBe('first comment');
        expect(unresolved[0].data.commentedText).toBe('commented');

        const resolved = getResolvedCommentsFromTiptapState(state);

        expect(resolved.length).toBe(1);
        expect(resolved[0].data.msg).toBe('second comment');
        expect(resolved[0].data.commentedText).toBe('text');
        expect(resolved[0].data.resolutionInfo.resolverUserId).toBe('user-1');

        const suggestions = getResolvedSuggestionsFromTiptapState(state);

        expect(suggestions.length).toBe(1);
        expect(suggestions[0].suggestionText).toBe('new ');
        expect(suggestions[0].suggestionInfo.author).toBe('author_id');
        expect(suggestions[0].resolutionInfo).toEqual(
            {resolverUserId: 'resolver_id', date, accepted: true},
        );

        expect(getHighlightedTextInState(state, 'COMMENT-1')).toBe('commented');

        editor.destroy();
    });
});
