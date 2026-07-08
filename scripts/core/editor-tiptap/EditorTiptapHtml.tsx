import * as React from 'react';
import {Editor} from '@tiptap/core';
import {EditorContent} from '@tiptap/react';
import {IEditor3HtmlProps} from 'superdesk-api';
import {getEditorTiptapExtensions} from './extensions';
import {editingBehavior} from './editing';
import {htmlToPmDoc} from './from-html';
import {pmDocToHtml} from './to-html';

/**
 * A Tiptap-backed drop-in for `Editor3Html`: html in, html out, using
 * the editor3-compatible importer and byte-parity serializer. Exposed to
 * extensions while the Tiptap editor is behind the feature flag so
 * consumers can be migrated independently.
 *
 * `editorFormat` is not supported yet — the built-in toolbar isn't
 * rendered; text formatting works via keyboard shortcuts.
 */
export class EditorTiptapHtml extends React.Component<IEditor3HtmlProps> {
    private editor: Editor;

    constructor(props: IEditor3HtmlProps) {
        super(props);

        this.editor = new Editor({
            extensions: [...getEditorTiptapExtensions(), editingBehavior],
            content: htmlToPmDoc(this.props.value ?? '', {}),
            editable: this.props.readOnly !== true,
        });

        this.editor.on('update', () => {
            this.props.onChange(pmDocToHtml(this.editor.getJSON()));
        });
    }

    componentDidUpdate(prevProps: Readonly<IEditor3HtmlProps>) {
        if (this.props.readOnly !== prevProps.readOnly) {
            this.editor.setEditable(this.props.readOnly !== true);
        }

        // reload own state when the incoming value no longer matches
        // what this editor produced (see Editor3Html for reasoning)
        if (this.props.value !== prevProps.value
            && this.props.value !== pmDocToHtml(this.editor.getJSON())
        ) {
            this.editor.commands.setContent(htmlToPmDoc(this.props.value ?? '', {}));
        }
    }

    componentWillUnmount() {
        this.editor.destroy();
    }

    render() {
        return <EditorContent editor={this.editor as any} />;
    }
}
