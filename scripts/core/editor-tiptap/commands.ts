import {Editor, findParentNode} from '@tiptap/core';
import {Node as PmNode, Slice} from '@tiptap/pm/model';
import {wrapInList, liftListItem} from '@tiptap/pm/schema-list';
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
