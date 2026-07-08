import * as React from 'react';
import classNames from 'classnames';
import {Editor} from '@tiptap/core';
import {undo, redo} from '@tiptap/pm/history';
import {Input} from 'superdesk-ui-framework/react';
import {showModal} from '@sourcefabric/common';
import {gettext} from 'core/utils';
import {ModalSimple} from 'core/ui/components/modal-simple';
import {
    toggleList,
    isListActive,
    setLink,
    insertTable,
    isTableActive,
    runTableCommand,
    toggleTableHeader,
} from 'core/editor-tiptap/commands';
import {showUploadDialogAndInsert, insertEmbedFromInput} from './insertion';
import {promptComment, promptAnnotation} from './highlights-ui';
import {isSuggestingMode, toggleSuggestingMode} from 'core/editor-tiptap/suggestions';

interface IButtonProps {
    icon: string;
    label: string;
    active?: boolean;
    onToggle(): void;
}

/**
 * Uses the same classes as editor3's StyleButton so existing styles apply.
 */
class ToolbarButton extends React.PureComponent<IButtonProps> {
    render() {
        const {icon, label, active, onToggle} = this.props;

        return (
            <span
                className={classNames({
                    'Editor3-styleButton': true,
                    'Editor3-activeButton': active === true,
                })}
                data-flow="down"
                data-sd-tooltip={label}
                onMouseDown={(event) => {
                    // prevent the editor from losing focus
                    event.preventDefault();
                    onToggle();
                }}
            >
                <i className={icon} />
            </span>
        );
    }
}

interface ILinkModalProps {
    closeModal(): void;
    initialHref: string;
    onSubmit(href: string): void;
}

class LinkModal extends React.PureComponent<ILinkModalProps, {href: string}> {
    constructor(props: ILinkModalProps) {
        super(props);

        this.state = {href: props.initialHref};
    }

    render() {
        const submit = () => {
            this.props.onSubmit(this.state.href.trim());
            this.props.closeModal();
        };

        return (
            <ModalSimple
                title={gettext('Link')}
                closeModal={this.props.closeModal}
                footerButtons={[
                    {label: gettext('Cancel'), onClick: this.props.closeModal},
                    {label: gettext('Apply'), onClick: submit, primary: true},
                ]}
            >
                <Input
                    type="text"
                    label={gettext('URL')}
                    value={this.state.href}
                    onChange={(href) => {
                        this.setState({href});
                    }}
                />
            </ModalSimple>
        );
    }
}

interface IEmbedModalProps {
    closeModal(): void;
    onSubmit(input: string): void;
}

class EmbedModal extends React.PureComponent<IEmbedModalProps, {input: string}> {
    constructor(props: IEmbedModalProps) {
        super(props);

        this.state = {input: ''};
    }

    render() {
        const submit = () => {
            if (this.state.input.trim().length > 0) {
                this.props.onSubmit(this.state.input);
            }

            this.props.closeModal();
        };

        return (
            <ModalSimple
                title={gettext('Embed')}
                closeModal={this.props.closeModal}
                footerButtons={[
                    {label: gettext('Cancel'), onClick: this.props.closeModal},
                    {label: gettext('Embed'), onClick: submit, primary: true},
                ]}
            >
                <Input
                    type="text"
                    label={gettext('URL or embed code')}
                    value={this.state.input}
                    onChange={(input) => {
                        this.setState({input});
                    }}
                />
            </ModalSimple>
        );
    }
}

interface IProps {
    editor: Editor;
}

export class Toolbar extends React.PureComponent<IProps> {
    constructor(props: IProps) {
        super(props);

        this.handleTransaction = this.handleTransaction.bind(this);
    }

    private handleTransaction() {
        this.forceUpdate(); // active states depend on the selection
    }

    componentDidMount() {
        this.props.editor.on('transaction', this.handleTransaction);
    }

    componentWillUnmount() {
        this.props.editor.off('transaction', this.handleTransaction);
    }

    private insertEmbed() {
        const {editor} = this.props;

        showModal(({closeModal}) => (
            <EmbedModal
                closeModal={closeModal}
                onSubmit={(input) => {
                    insertEmbedFromInput(editor, input);
                }}
            />
        ));
    }

    private editLink() {
        const {editor} = this.props;
        const currentHref: string = editor.getAttributes('link').href ?? '';

        showModal(({closeModal}) => (
            <LinkModal
                closeModal={closeModal}
                initialHref={currentHref}
                onSubmit={(href) => {
                    setLink(editor, {href});
                }}
            />
        ));
    }

    render() {
        const {editor} = this.props;
        const toggleMark = (markName: string) => () => {
            editor.chain().focus().toggleMark(markName)
                .run();
        };
        const toggleHeading = (level: number) => () => {
            editor.chain().focus().toggleNode('heading', 'paragraph', {level})
                .run();
        };
        const pmCommand = (command) => () => {
            editor.commands.command(({state, dispatch}) => command(state, dispatch));
            editor.commands.focus();
        };

        return (
            <div className="Editor3-controls">
                <ToolbarButton
                    icon="icon-bold"
                    label={gettext('Bold')}
                    active={editor.isActive('bold')}
                    onToggle={toggleMark('bold')}
                />
                <ToolbarButton
                    icon="icon-italic"
                    label={gettext('Italic')}
                    active={editor.isActive('italic')}
                    onToggle={toggleMark('italic')}
                />
                <ToolbarButton
                    icon="icon-underline"
                    label={gettext('Underline')}
                    active={editor.isActive('underline')}
                    onToggle={toggleMark('underline')}
                />
                <ToolbarButton
                    icon="icon-strikethrough"
                    label={gettext('Strikethrough')}
                    active={editor.isActive('strike')}
                    onToggle={toggleMark('strike')}
                />
                <ToolbarButton
                    icon="icon-subscript"
                    label={gettext('Subscript')}
                    active={editor.isActive('subscript')}
                    onToggle={toggleMark('subscript')}
                />
                <ToolbarButton
                    icon="icon-superscript"
                    label={gettext('Superscript')}
                    active={editor.isActive('superscript')}
                    onToggle={toggleMark('superscript')}
                />

                {
                    [2, 3, 4].map((level) => (
                        <ToolbarButton
                            key={level}
                            icon={`icon-heading-${level}`}
                            label={gettext('Heading {{level}}', {level})}
                            active={editor.isActive('heading', {level})}
                            onToggle={toggleHeading(level)}
                        />
                    ))
                }

                <ToolbarButton
                    icon="icon-quote"
                    label={gettext('Quote')}
                    active={editor.isActive('blockquote')}
                    onToggle={() => {
                        editor.chain().focus().toggleNode('blockquote', 'paragraph')
                            .run();
                    }}
                />
                <ToolbarButton
                    icon="icon-unordered-list"
                    label={gettext('Unordered list')}
                    active={isListActive(editor, 'bulletList')}
                    onToggle={() => {
                        toggleList(editor, 'bulletList');
                        editor.commands.focus();
                    }}
                />
                <ToolbarButton
                    icon="icon-ordered-list"
                    label={gettext('Ordered list')}
                    active={isListActive(editor, 'orderedList')}
                    onToggle={() => {
                        toggleList(editor, 'orderedList');
                        editor.commands.focus();
                    }}
                />
                <ToolbarButton
                    icon="icon-link"
                    label={gettext('Link')}
                    active={editor.isActive('link')}
                    onToggle={() => {
                        this.editLink();
                    }}
                />

                <ToolbarButton
                    icon="icon-suggestion"
                    label={gettext('Toggle Suggestions Mode')}
                    active={isSuggestingMode(editor)}
                    onToggle={() => {
                        toggleSuggestingMode(editor);
                    }}
                />
                <ToolbarButton
                    icon="icon-comment"
                    label={gettext('Comment')}
                    onToggle={() => {
                        promptComment(editor);
                    }}
                />
                <ToolbarButton
                    icon="icon-pencil"
                    label={gettext('Annotation')}
                    onToggle={() => {
                        promptAnnotation(editor);
                    }}
                />
                <ToolbarButton
                    icon="icon-picture"
                    label={gettext('Media')}
                    onToggle={() => {
                        showUploadDialogAndInsert(editor);
                    }}
                />
                <ToolbarButton
                    icon="icon-code"
                    label={gettext('Embed')}
                    onToggle={() => {
                        this.insertEmbed();
                    }}
                />
                <ToolbarButton
                    icon="icon-table"
                    label={gettext('Table')}
                    active={isTableActive(editor)}
                    onToggle={() => {
                        if (!isTableActive(editor)) {
                            insertTable(editor);
                        }
                    }}
                />

                {
                    isTableActive(editor) && (
                        <React.Fragment>
                            <ToolbarButton
                                icon="icon-plus-sign"
                                label={gettext('Add row')}
                                onToggle={() => {
                                    runTableCommand(editor, 'addRowAfter');
                                }}
                            />
                            <ToolbarButton
                                icon="icon-minus-sign"
                                label={gettext('Remove row')}
                                onToggle={() => {
                                    runTableCommand(editor, 'deleteRow');
                                }}
                            />
                            <ToolbarButton
                                icon="icon-plus-small"
                                label={gettext('Add column')}
                                onToggle={() => {
                                    runTableCommand(editor, 'addColumnAfter');
                                }}
                            />
                            <ToolbarButton
                                icon="icon-minus-small"
                                label={gettext('Remove column')}
                                onToggle={() => {
                                    runTableCommand(editor, 'deleteColumn');
                                }}
                            />
                            <ToolbarButton
                                icon="icon-heading-1"
                                label={gettext('Toggle header row')}
                                onToggle={() => {
                                    toggleTableHeader(editor);
                                }}
                            />
                            <ToolbarButton
                                icon="icon-trash"
                                label={gettext('Remove table')}
                                onToggle={() => {
                                    runTableCommand(editor, 'deleteTable');
                                }}
                            />
                        </React.Fragment>
                    )
                }

                <ToolbarButton
                    icon="icon-revert"
                    label={gettext('Undo')}
                    onToggle={pmCommand(undo)}
                />
                <ToolbarButton
                    icon="icon-redo"
                    label={gettext('Redo')}
                    onToggle={pmCommand(redo)}
                />
            </div>
        );
    }
}
