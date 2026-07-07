import * as React from 'react';
import {IPreviewComponentProps} from 'superdesk-api';
import {pmDocToHtml} from 'core/editor-tiptap';
import {ITiptapValueOperational, ITiptapFieldConfig} from './index';

type IProps = IPreviewComponentProps<ITiptapValueOperational, ITiptapFieldConfig>;

export class Preview extends React.PureComponent<IProps> {
    render() {
        const html = pmDocToHtml(this.props.value.editor.getJSON());

        // eslint-disable-next-line react/no-danger
        return <div dangerouslySetInnerHTML={{__html: html}} />;
    }
}
