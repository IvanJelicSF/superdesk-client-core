import {Editor} from '@tiptap/core';
import {undo, redo} from '@tiptap/pm/history';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {toggleList, isListActive, setLink, insertExternalHtml} from '../commands';
import {pmDocToHtml} from '../to-html';

function paragraphDoc(text: string) {
    return {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text}]}]};
}

function createEditor(content?: {[key: string]: any}): Editor {
    return new Editor({
        extensions: [...getEditorTiptapExtensions(), editingBehavior],
        content,
    });
}

describe('editor-tiptap editing behavior', () => {
    let editor: Editor;

    afterEach(() => {
        editor?.destroy();
    });

    it('toggles marks on a selection', () => {
        editor = createEditor(paragraphDoc('hello world'));

        editor.commands.setTextSelection({from: 1, to: 6});
        editor.commands.toggleMark('bold');

        expect(pmDocToHtml(editor.getJSON())).toBe('<p><b>hello</b> world</p>');

        editor.commands.toggleMark('bold');
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>hello world</p>');
    });

    it('supports undo and redo', () => {
        editor = createEditor();

        editor.commands.insertContent('first');
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>first</p>');

        editor.commands.command(({state, dispatch}) => undo(state, dispatch));
        expect(pmDocToHtml(editor.getJSON())).toBe('');

        editor.commands.command(({state, dispatch}) => redo(state, dispatch));
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>first</p>');
    });

    it('toggles headings and blockquote', () => {
        editor = createEditor(paragraphDoc('title'));

        editor.commands.toggleNode('heading', 'paragraph', {level: 2});
        expect(pmDocToHtml(editor.getJSON())).toBe('<h2>title</h2>');

        editor.commands.toggleNode('heading', 'paragraph', {level: 2});
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>title</p>');

        editor.commands.toggleNode('blockquote', 'paragraph');
        expect(pmDocToHtml(editor.getJSON())).toBe('<blockquote>title</blockquote>');
    });

    it('toggles lists, switches list types, and lifts items out', () => {
        editor = createEditor(paragraphDoc('item'));

        toggleList(editor, 'bulletList');
        expect(isListActive(editor, 'bulletList')).toBe(true);
        expect(pmDocToHtml(editor.getJSON())).toBe('<ul>\n  <li>item</li>\n</ul>');

        toggleList(editor, 'orderedList');
        expect(isListActive(editor, 'orderedList')).toBe(true);
        expect(pmDocToHtml(editor.getJSON())).toBe('<ol>\n  <li>item</li>\n</ol>');

        toggleList(editor, 'orderedList');
        expect(isListActive(editor, 'orderedList')).toBe(false);
        expect(pmDocToHtml(editor.getJSON())).toBe('<p>item</p>');
    });

    it('applies and removes links', () => {
        editor = createEditor(paragraphDoc('a link here'));

        editor.commands.setTextSelection({from: 3, to: 7});
        setLink(editor, {href: 'https://example.com'});

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>a <a href="https://example.com">link</a> here</p>');

        editor.commands.setTextSelection({from: 4, to: 4}); // cursor inside the link
        setLink(editor, {href: ''});

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>a link here</p>');
    });

    it('inserts external HTML through the editor3-compatible importer', () => {
        editor = createEditor(paragraphDoc('start end'));

        editor.commands.setTextSelection({from: 6, to: 6});

        // note: a single-paragraph Google Docs paste (docs-internal-guid with
        // one <p>) loses formatting in docs-soap — a bug shared with editor3;
        // this fixture is the common styled-span clipboard shape
        insertExternalHtml(
            editor,
            '<p><span style="font-weight:700;">PASTED</span></p>',
        );

        expect(pmDocToHtml(editor.getJSON())).toBe('<p>start<b>PASTED</b> end</p>');
    });
});
