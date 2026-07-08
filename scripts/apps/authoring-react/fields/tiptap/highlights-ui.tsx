import * as React from 'react';
import {createRoot, Root} from 'react-dom/client';
import {Editor, Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {ContentState, convertToRaw} from 'draft-js';
import ng from 'core/services/ng';
import {gettext} from 'core/utils';
import {showModal} from '@sourcefabric/common';
import {Input} from 'superdesk-ui-framework/react';
import {ModalSimple} from 'core/ui/components/modal-simple';
import {getAuthorInfo} from 'core/editor3/actions/highlights';
import {
    addHighlight,
    updateHighlightData,
    removeHighlight,
    resolveComment,
    getHighlightData,
    getHighlightsAt,
    pmDocToPlainText,
} from 'core/editor-tiptap';
import {acceptSuggestion, rejectSuggestion} from 'core/editor-tiptap/suggestions';

/**
 * Comment / annotation UI for the Tiptap field: creation modals and the
 * on-click popup with resolve / edit / remove actions (the equivalents of
 * editor3's CommentInput/CommentPopup and AnnotationInput/AnnotationPopup).
 */

/**
 * Message bodies are stored as serialized documents: Draft.js raw on
 * content converted from editor3, and also for newly created highlights,
 * for compatibility with existing consumers (widgets, annotations
 * library) that expect the Draft.js format.
 */
function plainTextToMsg(text: string): string {
    return JSON.stringify(convertToRaw(ContentState.createFromText(text)));
}

export function msgToPlainText(msg: string): string {
    try {
        const parsed = JSON.parse(msg);

        if (parsed?.type === 'doc') {
            return pmDocToPlainText(parsed);
        }

        return (parsed?.blocks ?? []).map(({text}) => text).join('\n');
    } catch (_error) {
        return msg;
    }
}

interface IHighlightInputModalProps {
    closeModal(): void;
    title: string;
    initialText: string;
    onSubmit(text: string): void;
}

class HighlightInputModal extends React.PureComponent<IHighlightInputModalProps, {text: string}> {
    constructor(props: IHighlightInputModalProps) {
        super(props);

        this.state = {text: props.initialText};
    }

    render() {
        const submit = () => {
            if (this.state.text.trim().length > 0) {
                this.props.onSubmit(this.state.text.trim());
            }

            this.props.closeModal();
        };

        return (
            <ModalSimple
                title={this.props.title}
                closeModal={this.props.closeModal}
                footerButtons={[
                    {label: gettext('Cancel'), onClick: this.props.closeModal},
                    {label: gettext('Save'), onClick: submit, primary: true},
                ]}
            >
                <Input
                    type="text"
                    label={gettext('Message')}
                    value={this.state.text}
                    onChange={(text) => {
                        this.setState({text});
                    }}
                />
            </ModalSimple>
        );
    }
}

export function promptComment(editor: Editor): void {
    if (editor.state.selection.empty) {
        return;
    }

    showModal(({closeModal}) => (
        <HighlightInputModal
            closeModal={closeModal}
            title={gettext('Comment')}
            initialText=""
            onSubmit={(text) => {
                addHighlight(editor, 'COMMENT', {
                    data: {
                        msg: text,
                        replies: [],
                        resolutionInfo: null,
                        ...getAuthorInfo(),
                    },
                });
            }}
        />
    ));
}

export function promptAnnotation(editor: Editor, existingStyleName?: string): void {
    const existingData = existingStyleName == null ? null : getHighlightData(editor, existingStyleName)?.data;

    if (existingStyleName == null && editor.state.selection.empty) {
        return;
    }

    showModal(({closeModal}) => (
        <HighlightInputModal
            closeModal={closeModal}
            title={gettext('Annotation')}
            initialText={existingData == null ? '' : msgToPlainText(existingData.msg)}
            onSubmit={(text) => {
                if (existingStyleName == null) {
                    addHighlight(editor, 'ANNOTATION', {
                        data: {
                            msg: plainTextToMsg(text),
                            annotationType: 'regular',
                            ...getAuthorInfo(),
                        },
                    });
                } else {
                    updateHighlightData(editor, existingStyleName, {
                        data: {
                            ...existingData,
                            msg: plainTextToMsg(text),
                            date: new Date(),
                        },
                    });
                }
            }}
        />
    ));
}

interface IHighlightsPopupProps {
    editor: Editor;
    highlights: Array<{styleName: string; highlightKey: string}>;
    targetRect: {bottom: number; left: number};
    onClose(): void;
}

class HighlightsPopup extends React.PureComponent<IHighlightsPopupProps> {
    render() {
        const {editor, highlights, targetRect, onClose} = this.props;

        return (
            <div
                style={{position: 'fixed', inset: 0, zIndex: 1040}}
                onClick={onClose}
            >
                <div
                    className="editor-popup__main"
                    style={{
                        position: 'absolute',
                        top: targetRect.bottom + 4,
                        left: targetRect.left,
                        background: 'var(--sd-item__main-Bg, #fff)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        borderRadius: 4,
                        padding: 12,
                        minWidth: 280,
                        maxWidth: 400,
                    }}
                    onClick={(event) => {
                        event.stopPropagation();
                    }}
                >
                    {
                        highlights.map(({styleName, highlightKey}) => {
                            const entry = getHighlightData(editor, styleName);

                            if (entry == null) {
                                return null;
                            }

                            const isComment = highlightKey === 'COMMENT';
                            const isSuggestion = highlightKey === 'ADD_SUGGESTION'
                                || highlightKey === 'DELETE_SUGGESTION';

                            if (isSuggestion) {
                                const resolverData = () => ({
                                    author: ng.get('session').identity._id,
                                    date: new Date(),
                                });

                                return (
                                    <div key={styleName} style={{marginBottom: 8}}>
                                        <div style={{fontSize: 12, opacity: 0.7}}>
                                            {entry.author} · {
                                                highlightKey === 'ADD_SUGGESTION'
                                                    ? gettext('Suggested addition')
                                                    : gettext('Suggested removal')
                                            }
                                        </div>

                                        <div>
                                            <button
                                                className="btn btn--small"
                                                onClick={() => {
                                                    acceptSuggestion(editor, styleName, resolverData());
                                                    onClose();
                                                }}
                                            >
                                                {gettext('Accept')}
                                            </button>

                                            <button
                                                className="btn btn--small"
                                                onClick={() => {
                                                    rejectSuggestion(editor, styleName, resolverData());
                                                    onClose();
                                                }}
                                            >
                                                {gettext('Reject')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            const message = isComment ? entry.data.msg : msgToPlainText(entry.data.msg);

                            return (
                                <div key={styleName} style={{marginBottom: 8}}>
                                    <div style={{fontSize: 12, opacity: 0.7}}>
                                        {entry.data.author} · {isComment ? gettext('Comment') : gettext('Annotation')}
                                    </div>

                                    <p>{message}</p>

                                    <div>
                                        {
                                            isComment && (
                                                <button
                                                    className="btn btn--small"
                                                    onClick={() => {
                                                        resolveComment(editor, styleName, {
                                                            resolverUserId: ng.get('session').identity._id,
                                                            date: new Date(),
                                                        });
                                                        onClose();
                                                    }}
                                                >
                                                    {gettext('Resolve')}
                                                </button>
                                            )
                                        }

                                        {
                                            !isComment && (
                                                <button
                                                    className="btn btn--small"
                                                    onClick={() => {
                                                        onClose();
                                                        promptAnnotation(editor, styleName);
                                                    }}
                                                >
                                                    {gettext('Edit')}
                                                </button>
                                            )
                                        }

                                        <button
                                            className="btn btn--small"
                                            onClick={() => {
                                                removeHighlight(editor, styleName);
                                                onClose();
                                            }}
                                        >
                                            {gettext('Remove')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        );
    }
}

let openPopup: {root: Root; container: HTMLElement} | null = null;

function closePopup(): void {
    if (openPopup != null) {
        const {root, container} = openPopup;

        openPopup = null;
        root.unmount();
        container.remove();
    }
}

function showHighlightsPopup(props: Omit<IHighlightsPopupProps, 'onClose'>): void {
    closePopup();

    const container = document.createElement('div');

    document.body.appendChild(container);

    const root = createRoot(container);

    openPopup = {root, container};
    root.render(<HighlightsPopup {...props} onClose={closePopup} />);
}

/**
 * Opens the popup when highlighted text is clicked.
 */
export const highlightsClickHandling = Extension.create({
    name: 'highlightsClickHandling',

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                props: {
                    handleClickOn(view, pos, node, nodePos, event) {
                        const highlights = getHighlightsAt(view.state, pos);

                        if (highlights.length < 1) {
                            return false;
                        }

                        const targetRect = (event.target as HTMLElement).getBoundingClientRect();

                        showHighlightsPopup({editor, highlights, targetRect});

                        return true;
                    },
                },
            }),
        ];
    },
});
