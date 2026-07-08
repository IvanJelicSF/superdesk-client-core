import * as React from 'react';
import {NodeViewWrapper, ReactNodeViewProps} from '@tiptap/react';
import {gettext} from 'core/utils';

/**
 * Renders an embedded article (read-only preview of its body),
 * like editor3's article embed block.
 */
export function ArticleEmbedNodeView(props: ReactNodeViewProps): JSX.Element {
    const item = props.node.attrs.item ?? {};

    return (
        <NodeViewWrapper className="editor-tiptap--article-embed" data-test-id="tiptap-article-embed">
            <div className="embed-block">
                <div className="embed-block__header">
                    <i className="icon-composite" />
                    <span>{item.headline ?? gettext('Embedded article')}</span>
                </div>

                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{__html: item.body_html ?? ''}} />
            </div>
        </NodeViewWrapper>
    );
}
