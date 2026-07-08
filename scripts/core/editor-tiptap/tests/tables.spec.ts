import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {insertTable, isTableActive, runTableCommand, toggleTableHeader} from '../commands';
import {pmDocToHtml} from '../to-html';
import {convertDraftToPmDoc} from '../from-draftjs';

function createEditor(content?: {[key: string]: any}): Editor {
    return new Editor({
        extensions: [...getEditorTiptapExtensions(), editingBehavior],
        content,
    });
}

describe('editor-tiptap tables', () => {
    let editor: Editor;

    afterEach(() => {
        editor?.destroy();
    });

    it('inserts a table with editor3 default dimensions and serializes it', () => {
        editor = createEditor();

        insertTable(editor);

        expect(isTableActive(editor)).toBe(true);
        expect(pmDocToHtml(editor.getJSON())).toBe('<table><tbody><tr><td></td><td></td></tr></tbody></table>');
    });

    it('adds and removes rows and columns', () => {
        editor = createEditor();

        insertTable(editor);
        editor.commands.insertContent('a');

        runTableCommand(editor, 'addRowAfter');
        expect(pmDocToHtml(editor.getJSON()))
            .toBe('<table><tbody><tr><td><p>a</p></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>');

        runTableCommand(editor, 'addColumnAfter');
        expect(pmDocToHtml(editor.getJSON()))
            .toBe(
                '<table><tbody><tr><td><p>a</p></td><td></td><td></td></tr>'
                + '<tr><td></td><td></td><td></td></tr></tbody></table>',
            );

        runTableCommand(editor, 'deleteColumn');
        runTableCommand(editor, 'deleteRow');
        expect(pmDocToHtml(editor.getJSON()))
            .toBe('<table><tbody><tr><td></td><td></td></tr></tbody></table>');

        runTableCommand(editor, 'deleteTable');
        expect(pmDocToHtml(editor.getJSON())).toBe('');
    });

    it('toggles the header row, switching thead serialization like editor3', () => {
        editor = createEditor();

        insertTable(editor, 2, 2);
        editor.commands.insertContent('h');

        toggleTableHeader(editor);
        expect(pmDocToHtml(editor.getJSON()))
            .toBe(
                '<table><thead><tr><th><p>h</p></th><th></th></tr></thead>'
                + '<tbody><tr><td></td><td></td></tr></tbody></table>',
            );

        toggleTableHeader(editor);
        expect(pmDocToHtml(editor.getJSON()))
            .toBe(
                '<table><tbody><tr><td><p>h</p></td><td></td></tr>'
                + '<tr><td></td><td></td></tr></tbody></table>',
            );
    });

    it('loads converted editor3 tables and keeps them editable', () => {
        const cellRaw = (text: string) => ({
            blocks: [{
                key: 'c' + text, text, type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {},
            }],
            entityMap: {},
        });
        const tableData = {numRows: 1, numCols: 2, withHeader: false, cells: [[cellRaw('x'), cellRaw('y')]]};
        const raw: any = {
            blocks: [{
                key: 't1',
                text: ' ',
                type: 'atomic',
                depth: 0,
                inlineStyleRanges: [],
                entityRanges: [{offset: 0, length: 1, key: 0}],
                data: {data: JSON.stringify(tableData)},
            }],
            entityMap: {0: {type: 'TABLE', mutability: 'MUTABLE', data: {data: tableData}}},
        };

        editor = createEditor(convertDraftToPmDoc(raw));

        expect(pmDocToHtml(editor.getJSON()))
            .toBe('<table><tbody><tr><td><p>x</p></td><td><p>y</p></td></tr></tbody></table>');

        // place the cursor inside the first cell and extend the table
        editor.commands.setTextSelection(3);
        expect(isTableActive(editor)).toBe(true);

        runTableCommand(editor, 'addRowAfter');
        expect(pmDocToHtml(editor.getJSON()))
            .toBe(
                '<table><tbody><tr><td><p>x</p></td><td><p>y</p></td></tr>'
                + '<tr><td></td><td></td></tr></tbody></table>',
            );
    });
});
