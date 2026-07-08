import * as React from 'react';
import {IEditorComponentProps} from 'superdesk-api';
import {EditorContent} from '@tiptap/react';
import {pmDocToPlainText} from 'core/editor-tiptap';
import {TextStatistics} from 'apps/authoring/authoring/components/text-statistics';
import {ITiptapValueOperational, ITiptapFieldConfig} from './index';
import {Toolbar} from './toolbar';

type IProps = IEditorComponentProps<ITiptapValueOperational, ITiptapFieldConfig, never>;

export class Editor extends React.PureComponent<IProps> {
    constructor(props: IProps) {
        super(props);

        this.handleUpdate = this.handleUpdate.bind(this);
    }

    private handleUpdate() {
        // a fresh object identity is required for authoring-react
        // to register the change
        this.props.onChange({editor: this.props.value.editor});
    }

    componentDidMount() {
        const {editor} = this.props.value;

        editor.setEditable(!this.props.readOnly);
        editor.on('update', this.handleUpdate);
    }

    componentDidUpdate(prevProps: IProps) {
        const {editor} = this.props.value;

        if (prevProps.value.editor !== editor) {
            prevProps.value.editor.off('update', this.handleUpdate);
            editor.on('update', this.handleUpdate);
        }

        if (prevProps.readOnly !== this.props.readOnly) {
            editor.setEditable(!this.props.readOnly);
        }
    }

    componentWillUnmount() {
        this.props.value.editor.off('update', this.handleUpdate);
    }

    render() {
        const Container = this.props.container;
        const {editor} = this.props.value;

        const miniToolbar = (
            <TextStatistics
                text={pmDocToPlainText(editor.state.doc)}
                language={this.props.language}
                limit={this.props.config.maxLength}
            />
        );

        return (
            <Container miniToolbar={miniToolbar}>
                {!this.props.readOnly && (
                    <Toolbar editor={editor} />
                )}

                <EditorContent editor={editor as any} />
            </Container>
        );
    }
}
