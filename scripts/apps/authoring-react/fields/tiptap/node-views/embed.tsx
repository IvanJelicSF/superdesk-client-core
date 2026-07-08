import * as React from 'react';
import {NodeViewWrapper, ReactNodeViewProps} from '@tiptap/react';
import {gettext} from 'core/utils';

/**
 * Renders an EMBED node (oembed / iframe / raw html) with an editable
 * description, like editor3's embed block.
 */
export function EmbedNodeView(props: ReactNodeViewProps): JSX.Element {
    const {node, updateAttributes, editor} = props;
    const html: string = node.attrs.data?.html ?? '';
    const readOnly = !editor.isEditable;

    return (
        <NodeViewWrapper className="editor-tiptap--embed" data-test-id="tiptap-embed">
            <div className="embed-block">
                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{__html: html}} />

                <input
                    type="text"
                    className="embed-block__description"
                    placeholder={gettext('Write a description')}
                    value={node.attrs.description ?? ''}
                    disabled={readOnly}
                    onChange={(event) => {
                        updateAttributes({description: event.target.value});
                    }}
                />
            </div>
        </NodeViewWrapper>
    );
}
