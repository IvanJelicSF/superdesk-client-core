import {Extension} from '@tiptap/core';
import {history, undo, redo} from '@tiptap/pm/history';
import {Plugin} from '@tiptap/pm/state';
import {splitListItem, sinkListItem, liftListItem} from '@tiptap/pm/schema-list';
import {insertExternalHtml} from './commands';

/**
 * Editing behavior of the Superdesk Tiptap editor: undo/redo history,
 * keyboard shortcuts for formatting and lists, and paste handling that
 * routes external HTML through the same importer editor3 used
 * (Google Docs cleanup, embed handling, whitespace semantics — see
 * from-html.ts). Internal ProseMirror clipboard content is left to the
 * default handling to preserve full fidelity.
 */
export const editingBehavior = Extension.create({
    name: 'editingBehavior',

    addKeyboardShortcuts() {
        const pmCommand = (command) => () =>
            this.editor.commands.command(({state, dispatch}) => command(state, dispatch));

        return {
            'Mod-z': pmCommand(undo),
            'Mod-y': pmCommand(redo),
            'Shift-Mod-z': pmCommand(redo),

            'Mod-b': () => this.editor.commands.toggleMark('bold'),
            'Mod-i': () => this.editor.commands.toggleMark('italic'),
            'Mod-u': () => this.editor.commands.toggleMark('underline'),

            'Enter': pmCommand(splitListItem(this.editor.schema.nodes.listItem)),
            'Tab': pmCommand(sinkListItem(this.editor.schema.nodes.listItem)),
            'Shift-Tab': pmCommand(liftListItem(this.editor.schema.nodes.listItem)),
        };
    },

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            history(),

            new Plugin({
                props: {
                    handlePaste(view, event) {
                        const html = event.clipboardData?.getData('text/html') ?? '';

                        if (html === '' || html.includes('data-pm-slice')) {
                            // plain text or internal ProseMirror content
                            return false;
                        }

                        return insertExternalHtml(editor, html);
                    },
                },
            }),
        ];
    },
});
