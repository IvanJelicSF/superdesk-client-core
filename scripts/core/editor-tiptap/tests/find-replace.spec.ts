import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {
    findReplace,
    setFindReplaceQuery,
    getFindReplaceState,
    findNext,
    findPrev,
    replaceMatch,
    replaceAllMatches,
} from '../find-replace';
import {pmDocToHtml} from '../to-html';

function createEditor(text: string): Editor {
    return new Editor({
        extensions: [...getEditorTiptapExtensions(), editingBehavior, findReplace],
        content: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text}]}]},
    });
}

describe('editor-tiptap find & replace', () => {
    let editor: Editor;

    afterEach(() => {
        editor?.destroy();
    });

    it('finds matches, case-insensitive by default behavior of the query', () => {
        editor = createEditor('The cat and the dog. The end');

        setFindReplaceQuery(editor, {term: 'the', caseSensitive: false});
        expect(getFindReplaceState(editor).matches.length).toBe(3);

        setFindReplaceQuery(editor, {term: 'the', caseSensitive: true});
        expect(getFindReplaceState(editor).matches.length).toBe(1);

        setFindReplaceQuery(editor, null);
        expect(getFindReplaceState(editor).matches.length).toBe(0);
    });

    it('cycles through matches', () => {
        editor = createEditor('a b a b a');

        setFindReplaceQuery(editor, {term: 'a', caseSensitive: false});
        expect(getFindReplaceState(editor).activeIndex).toBe(0);

        findNext(editor);
        expect(getFindReplaceState(editor).activeIndex).toBe(1);

        findNext(editor);
        findNext(editor);
        expect(getFindReplaceState(editor).activeIndex).toBe(0); // wrapped around

        findPrev(editor);
        expect(getFindReplaceState(editor).activeIndex).toBe(2);
    });

    it('replaces the active match only', () => {
        editor = createEditor('one two one');

        setFindReplaceQuery(editor, {term: 'one', caseSensitive: false});
        findNext(editor); // second match active

        replaceMatch(editor, 'three');

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>one two three</p>');
        expect(getFindReplaceState(editor).matches.length).toBe(1);
    });

    it('replaces all matches', () => {
        editor = createEditor('x and x and X');

        setFindReplaceQuery(editor, {term: 'x', caseSensitive: false});
        replaceAllMatches(editor, 'y');

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>y and y and y</p>');
        expect(getFindReplaceState(editor).matches.length).toBe(0);
    });

    it('updates matches as the document changes', () => {
        editor = createEditor('word');

        setFindReplaceQuery(editor, {term: 'word', caseSensitive: false});
        expect(getFindReplaceState(editor).matches.length).toBe(1);

        editor.commands.insertContentAt(editor.state.doc.content.size, ' word');
        expect(getFindReplaceState(editor).matches.length).toBe(2);
    });
});
