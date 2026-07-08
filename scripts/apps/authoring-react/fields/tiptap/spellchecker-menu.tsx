import * as React from 'react';
import {createRoot, Root} from 'react-dom/client';
import {Editor} from '@tiptap/core';
import {gettext} from 'core/utils';
import {
    ISpellcheckerContextMenuPayload,
    replaceWarningText,
    refreshSpellcheck,
} from 'core/editor-tiptap/spellchecker';
import {ISpellcheckerSuggestion} from 'core/editor3/components/spellchecker/interfaces';

type IPayload = ISpellcheckerContextMenuPayload & {editor: Editor};

interface IMenuProps {
    payload: IPayload;
    onClose(): void;
}

interface IMenuState {
    suggestions: Array<ISpellcheckerSuggestion> | null;
}

class SpellcheckerMenu extends React.PureComponent<IMenuProps, IMenuState> {
    constructor(props: IMenuProps) {
        super(props);

        this.state = {suggestions: props.payload.warning.suggestions ?? null};
    }

    componentDidMount() {
        const {warning, spellchecker} = this.props.payload;

        if (this.state.suggestions == null && spellchecker.getSuggestions != null) {
            spellchecker.getSuggestions(warning.text).then((suggestions) => {
                this.setState({suggestions});
            });
        }
    }

    render() {
        const {payload, onClose} = this.props;
        const {warning, spellchecker, targetElement, editor} = payload;
        const rect = targetElement.getBoundingClientRect();
        const suggestions = this.state.suggestions ?? [];

        return (
            <div
                style={{position: 'fixed', inset: 0, zIndex: 1050}}
                onClick={onClose}
                onContextMenu={(event) => {
                    event.preventDefault();
                    onClose();
                }}
            >
                <ul
                    className="dropdown__menu open"
                    style={{
                        position: 'absolute',
                        top: rect.bottom + 2,
                        left: rect.left,
                        display: 'block',
                    }}
                >
                    {
                        suggestions.length < 1 && (
                            <li className="dropdown__menu-item--disabled">
                                {gettext('No suggestions')}
                            </li>
                        )
                    }

                    {
                        suggestions.map((suggestion, index) => (
                            <li key={index}>
                                <button
                                    onClick={() => {
                                        replaceWarningText(editor, warning, suggestion.text);
                                        onClose();
                                    }}
                                >
                                    {suggestion.text}
                                </button>
                            </li>
                        ))
                    }

                    <li className="dropdown__menu-divider" />

                    {
                        Object.values(spellchecker.actions).map((action, index) => (
                            <li key={`action-${index}`}>
                                <button
                                    onClick={() => {
                                        action.perform(warning).then(() => {
                                            refreshSpellcheck(editor);
                                        });
                                        onClose();
                                    }}
                                >
                                    {action.label}
                                </button>
                            </li>
                        ))
                    }
                </ul>
            </div>
        );
    }
}

let openMenu: {root: Root; container: HTMLElement} | null = null;

function close(): void {
    if (openMenu != null) {
        const {root, container} = openMenu;

        openMenu = null;
        root.unmount();
        container.remove();
    }
}

export const spellcheckerMenu = {
    show(payload: IPayload): void {
        close();

        const container = document.createElement('div');

        document.body.appendChild(container);

        const root = createRoot(container);

        openMenu = {root, container};
        root.render(<SpellcheckerMenu payload={payload} onClose={close} />);
    },
    close,
};
