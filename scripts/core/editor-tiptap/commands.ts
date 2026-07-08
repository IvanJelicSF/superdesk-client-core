import {Editor, findParentNode} from '@tiptap/core';
import {TextSelection} from '@tiptap/pm/state';
import {Node as PmNode, Slice} from '@tiptap/pm/model';
import {wrapInList, liftListItem} from '@tiptap/pm/schema-list';
import {
    isInTable,
    addRowAfter,
    addColumnAfter,
    deleteRow,
    deleteColumn,
    deleteTable,
} from '@tiptap/pm/tables';
import {htmlToPmDoc} from './from-html';

/**
 * Editing commands for the Tiptap editor that are not covered by
 * tiptap's generic core commands (toggleMark, toggleNode, ...). List
 * commands operate on the schema-generated node types directly instead
 * of relying on tiptap's list extensions.
 */

export function isListActive(editor: Editor, listTypeName: 'bulletList' | 'orderedList'): boolean {
    return findParentNode((node) => node.type.name === listTypeName)(editor.state.selection) != null;
}

export function toggleList(editor: Editor, listTypeName: 'bulletList' | 'orderedList'): boolean {
    const {state} = editor;
    const listType = state.schema.nodes[listTypeName];
    const listItemType = state.schema.nodes.listItem;
    const activeList = findParentNode(
        (node) => node.type.name === 'bulletList' || node.type.name === 'orderedList',
    )(state.selection);

    return editor.commands.command(({state: currentState, dispatch}) => {
        if (activeList == null) {
            return wrapInList(listType)(currentState, dispatch);
        }

        if (activeList.node.type === listType) {
            return liftListItem(listItemType)(currentState, dispatch);
        }

        // a list of the other type: change its type in place
        if (dispatch) {
            dispatch(currentState.tr.setNodeMarkup(activeList.pos, listType));
        }

        return true;
    });
}

/**
 * Inserts external HTML at the current selection, importing it the same
 * way editor3 imported pasted content (see from-html.ts).
 */
export function insertExternalHtml(editor: Editor, html: string, associations: {[id: string]: any} = {}): boolean {
    const doc = PmNode.fromJSON(editor.schema, htmlToPmDoc(html, associations));
    const slice = Slice.maxOpen(doc.content);

    return editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            dispatch(tr.replaceSelection(slice).scrollIntoView());
        }

        return true;
    });
}

export function isTableActive(editor: Editor): boolean {
    return isInTable(editor.state);
}

/**
 * Inserts an empty table at the selection (editor3's default was
 * 1 row × 2 columns).
 */
export function insertTable(editor: Editor, numRows: number = 1, numCols: number = 2): boolean {
    const {schema} = editor;
    const rows = [];

    for (let i = 0; i < numRows; i++) {
        const cells = [];

        for (let j = 0; j < numCols; j++) {
            cells.push(schema.nodes.tableCell.createAndFill());
        }

        rows.push(schema.nodes.tableRow.create(null, cells));
    }

    const table = schema.nodes.table.create(null, rows);

    return editor.commands.command(({tr, dispatch}) => {
        if (dispatch) {
            const offset = tr.selection.anchor + 1;

            tr.replaceSelectionWith(table)
                .scrollIntoView()
                .setSelection(TextSelection.near(tr.doc.resolve(offset)));

            dispatch(tr);
        }

        return true;
    });
}

const tableCommands = {addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable};

export function runTableCommand(editor: Editor, commandName: keyof typeof tableCommands): boolean {
    return editor.commands.command(
        ({state, dispatch}) => tableCommands[commandName](state, dispatch),
    );
}

/**
 * Toggles the header row: the `withHeader` attribute drives `<thead>`
 * serialization; first-row cell types are kept in sync for editing.
 */
export function toggleTableHeader(editor: Editor): boolean {
    const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);

    if (tableParent == null) {
        return false;
    }

    return editor.commands.command(({state, tr, dispatch}) => {
        if (!dispatch) {
            return true;
        }

        const withHeader = tableParent.node.attrs.withHeader !== true;
        const cellType = withHeader ? state.schema.nodes.tableHeader : state.schema.nodes.tableCell;

        tr.setNodeMarkup(tableParent.pos, null, {...tableParent.node.attrs, withHeader});

        const firstRow = tableParent.node.child(0);

        // position of the first cell node: table pos + 1 (into the table)
        // + 1 (into the first row)
        let cellPos = tableParent.pos + 2;

        firstRow.forEach((cell) => {
            tr.setNodeMarkup(cellPos, cellType, cell.attrs);
            cellPos += cell.nodeSize;
        });

        dispatch(tr);

        return true;
    });
}

/**
 * Applies a link to the selection; empty href removes the link.
 * The `attachment`/`target` semantics match the editor3 link mark.
 */
export function setLink(editor: Editor, attrs: {href?: string; target?: string; attachment?: string}): boolean {
    if ((attrs.href ?? '') === '' && (attrs.attachment ?? '') === '') {
        return editor.chain().focus().extendMarkRange('link')
            .unsetMark('link')
            .run();
    }

    return editor.chain().focus().extendMarkRange('link')
        .setMark('link', {
            href: attrs.href ?? null,
            target: attrs.target ?? null,
            attachment: attrs.attachment ?? null,
        })
        .run();
}
