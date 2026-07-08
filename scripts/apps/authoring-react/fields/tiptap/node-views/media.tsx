import * as React from 'react';
import {NodeViewWrapper, ReactNodeViewProps} from '@tiptap/react';
import {gettext} from 'core/utils';

/**
 * Renders a MEDIA node (image / video / audio) with an editable caption,
 * like editor3's media block.
 */
export function MediaNodeView(props: ReactNodeViewProps): JSX.Element {
    const {node, updateAttributes, editor} = props;
    const media = node.attrs.media ?? {};
    const rendition = media.renditions?.viewImage ?? media.renditions?.original;
    const href = rendition?.href;
    const readOnly = !editor.isEditable;

    return (
        <NodeViewWrapper className="editor-tiptap--media" data-test-id="tiptap-media">
            <figure className="image-block">
                {(() => {
                    switch (media.type) {
                        case 'video':
                            return <video controls src={href} width="100%" />;
                        case 'audio':
                            return <audio controls src={href} style={{width: '100%'}} />;
                        default:
                            return <img src={href} alt={media.alt_text ?? ''} style={{maxWidth: '100%'}} />;
                    }
                })()}

                <figcaption>
                    <textarea
                        className="image-block__description"
                        placeholder={gettext('Write a caption')}
                        value={media.description_text ?? ''}
                        disabled={readOnly}
                        onChange={(event) => {
                            updateAttributes({
                                media: {...media, description_text: event.target.value},
                            });
                        }}
                    />
                </figcaption>
            </figure>
        </NodeViewWrapper>
    );
}
