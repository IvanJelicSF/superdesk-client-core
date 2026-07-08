import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {getHighlightData, getHighlightedText, getCustomData} from '../highlights';
import {
    createAddSuggestion,
    createDeleteSuggestion,
    acceptSuggestion,
    rejectSuggestion,
} from '../suggestions';
import {pmDocToHtml} from '../to-html';

/**
 * Cases ported from editor3's suggestions reducer specs
 * (`core/editor3/reducers/tests/suggestions_*.spec.tsx`) — the acceptance
 * contract for the suggestions module.
 */

const date = '2026-07-08T00:00:00Z';
const author = {author: 'author_id', date};
const otherAuthor = {author: 'other_author', date};

function createEditor(text: string = ''): Editor {
    return new Editor({
        extensions: [...getEditorTiptapExtensions(), editingBehavior],
        content: {
            type: 'doc',
            content: [
                text === ''
                    ? {type: 'paragraph'}
                    : {type: 'paragraph', content: [{type: 'text', text}]},
            ],
        },
    });
}

describe('editor-tiptap suggestions', () => {
    let editor: Editor;

    afterEach(() => {
        editor?.destroy();
    });

    it('suggests new text on empty content', () => {
        editor = createEditor();

        const styleName = createAddSuggestion(editor, 'test', author);

        expect(styleName).toBe('ADD_SUGGESTION-1');
        expect(editor.state.doc.textContent).toBe('test');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('test');
        expect(getHighlightData(editor, 'ADD_SUGGESTION-1')).toEqual({
            author: 'author_id',
            date,
            type: 'ADD_SUGGESTION',
        });
    });

    it('suggests text in the middle of existing text', () => {
        editor = createEditor('initial');

        editor.commands.setTextSelection(3); // after 'in' (draft offset 2)
        createAddSuggestion(editor, 'test', author);

        expect(editor.state.doc.textContent).toBe('intestitial');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('test');
    });

    it('extends the suggestion when inserting adjacent to the same author insert suggestion', () => {
        editor = createEditor();

        createAddSuggestion(editor, 'initial', author);
        editor.commands.setTextSelection(3);
        createAddSuggestion(editor, 'test', author);

        expect(editor.state.doc.textContent).toBe('intestitial');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('intestitial');
        expect(getCustomData(editor).lastHighlightIds.ADD_SUGGESTION).toBe(1);
    });

    it('creates a new suggestion when inserting into another author insert suggestion', () => {
        editor = createEditor();

        createAddSuggestion(editor, 'initial', author);
        editor.commands.setTextSelection(3);

        const styleName = createAddSuggestion(editor, 'test', otherAuthor);

        expect(styleName).toBe('ADD_SUGGESTION-2');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-2')).toBe('test');
        expect(getHighlightData(editor, 'ADD_SUGGESTION-2').author).toBe('other_author');
    });

    it('marks a selection as a delete suggestion, keeping the text', () => {
        editor = createEditor('delete this word');

        editor.commands.setTextSelection({from: 8, to: 12});
        createDeleteSuggestion(editor, 'delete', author);

        expect(editor.state.doc.textContent).toBe('delete this word');
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('this');
        expect(getHighlightData(editor, 'DELETE_SUGGESTION-1')).toEqual({
            author: 'author_id',
            date,
            type: 'DELETE_SUGGESTION',
        });
    });

    it('extends the delete suggestion on consecutive backspaces', () => {
        editor = createEditor('some text');

        editor.commands.setTextSelection(10); // end
        createDeleteSuggestion(editor, 'backspace', author);

        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('t');
        expect(editor.state.selection.from).toBe(9); // moved before the marked char

        createDeleteSuggestion(editor, 'backspace', author);
        createDeleteSuggestion(editor, 'backspace', author);

        expect(editor.state.doc.textContent).toBe('some text');
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('ext');
        expect(getCustomData(editor).lastHighlightIds.DELETE_SUGGESTION).toBe(1);
        expect(editor.state.selection.from).toBe(7);
    });

    it('really deletes a character the same author suggested adding', () => {
        editor = createEditor('base');

        editor.commands.setTextSelection(3);
        createAddSuggestion(editor, 'xy', author);
        expect(editor.state.doc.textContent).toBe('baxyse');

        // cursor is after 'xy'; backspace removes 'y' for real
        editor.commands.setTextSelection(5);
        createDeleteSuggestion(editor, 'backspace', author);

        expect(editor.state.doc.textContent).toBe('baxse');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('x');
        expect(getHighlightData(editor, 'DELETE_SUGGESTION-1')).toBeUndefined();
    });

    it('removes the suggestion data once all its characters are deleted', () => {
        editor = createEditor('ab');

        editor.commands.setTextSelection(2);
        createAddSuggestion(editor, 'x', author);
        expect(getHighlightData(editor, 'ADD_SUGGESTION-1')).toBeTruthy();

        editor.commands.setTextSelection(3);
        createDeleteSuggestion(editor, 'backspace', author);

        expect(editor.state.doc.textContent).toBe('ab');
        expect(getHighlightData(editor, 'ADD_SUGGESTION-1')).toBeUndefined();
    });

    it('skips over characters already suggested for deletion', () => {
        editor = createEditor('word');

        editor.commands.setTextSelection(5);
        createDeleteSuggestion(editor, 'backspace', author);
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('d');

        // same position again: the char is already marked, so the cursor
        // just moves over it and the next backspace marks the previous char
        editor.commands.setTextSelection(5);
        createDeleteSuggestion(editor, 'backspace', author);
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('d');
        expect(editor.state.selection.from).toBe(4);
    });

    it('accepting an ADD suggestion keeps the text and drops the mark', () => {
        editor = createEditor('before after');

        editor.commands.setTextSelection(8);
        createAddSuggestion(editor, 'new ', author);
        expect(editor.state.doc.textContent).toBe('before new after');

        acceptSuggestion(editor, 'ADD_SUGGESTION-1', {author: 'resolver_id', date});

        expect(editor.state.doc.textContent).toBe('before new after');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('');
        expect(getHighlightData(editor, 'ADD_SUGGESTION-1')).toBeUndefined();
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>before new after</p>');

        const history = getCustomData(editor).resolvedSuggestionsHistory;

        expect(history.length).toBe(1);
        expect(history[0].suggestionText).toBe('new ');
        expect(history[0].suggestionInfo.author).toBe('author_id');
        expect(history[0].resolutionInfo).toEqual({resolverUserId: 'resolver_id', date, accepted: true});
    });

    it('rejecting an ADD suggestion removes the text', () => {
        editor = createEditor('before after');

        editor.commands.setTextSelection(8);
        createAddSuggestion(editor, 'new ', author);

        rejectSuggestion(editor, 'ADD_SUGGESTION-1', {author: 'resolver_id', date});

        expect(editor.state.doc.textContent).toBe('before after');
        expect(getHighlightData(editor, 'ADD_SUGGESTION-1')).toBeUndefined();

        const history = getCustomData(editor).resolvedSuggestionsHistory;

        expect(history[0].resolutionInfo.accepted).toBe(false);
    });

    it('accepting a DELETE suggestion removes the text', () => {
        editor = createEditor('remove this word');

        editor.commands.setTextSelection({from: 8, to: 13});
        createDeleteSuggestion(editor, 'delete', author);

        acceptSuggestion(editor, 'DELETE_SUGGESTION-1', {author: 'resolver_id', date});

        expect(editor.state.doc.textContent).toBe('remove word');
        expect(getHighlightData(editor, 'DELETE_SUGGESTION-1')).toBeUndefined();
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>remove word</p>');
    });

    it('rejecting a DELETE suggestion keeps the text and drops the mark', () => {
        editor = createEditor('keep this word');

        editor.commands.setTextSelection({from: 6, to: 10});
        createDeleteSuggestion(editor, 'delete', author);

        rejectSuggestion(editor, 'DELETE_SUGGESTION-1', {author: 'resolver_id', date});

        expect(editor.state.doc.textContent).toBe('keep this word');
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('');
        expect(getHighlightData(editor, 'DELETE_SUGGESTION-1')).toBeUndefined();
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>keep this word</p>');
    });

    it('replaces a selection as delete suggestion plus add suggestion', () => {
        editor = createEditor('replace this word');

        editor.commands.setTextSelection({from: 9, to: 13});
        createAddSuggestion(editor, 'that', author);

        expect(editor.state.doc.textContent).toContain('this');
        expect(editor.state.doc.textContent).toContain('that');
        expect(getHighlightedText(editor, 'DELETE_SUGGESTION-1')).toBe('this');
        expect(getHighlightedText(editor, 'ADD_SUGGESTION-1')).toBe('that');
    });
});
