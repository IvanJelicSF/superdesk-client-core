import {Editor, Extension} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {Node as PmNode} from '@tiptap/pm/model';
import {ISpellchecker, ISpellcheckWarning} from 'core/editor3/components/spellchecker/interfaces';
import {getSpellchecker} from 'core/editor3/components/spellchecker/default-spellcheckers';
import {pmDocToPlainText, getPlainTextSegments} from './output';

/**
 * Spellchecking for the Tiptap editor: a decorations-only plugin (never
 * serialized, as required by the migration plan) built on the same
 * `ISpellchecker` interface editor3 used. Warnings come with offsets into
 * the plain text; `getPlainTextSegments` maps them to document positions.
 */

export interface ISpellcheckWarningWithRange extends ISpellcheckWarning {
    from: number;
    to: number;
}

interface ISpellcheckerPluginState {
    decorations: DecorationSet;
}

export const spellcheckerPluginKey = new PluginKey<ISpellcheckerPluginState>('spellchecker');

const CHECK_DEBOUNCE_MS = 500;

export function warningsToDecorations(doc: PmNode, warnings: Array<ISpellcheckWarning>): DecorationSet {
    const segments = getPlainTextSegments(doc);
    const decorations: Array<Decoration> = [];

    for (const warning of warnings) {
        const segment = segments.find(
            ({start, length}) => warning.startOffset >= start && warning.startOffset < start + length,
        );

        if (segment == null) {
            continue;
        }

        const from = segment.pmStart + (warning.startOffset - segment.start);
        const to = Math.min(from + warning.text.length, segment.pmStart + segment.length);
        const warningWithRange: ISpellcheckWarningWithRange = {...warning, from, to};

        decorations.push(Decoration.inline(
            from,
            to,
            {class: warning.type === 'grammar' ? 'grammar-error' : 'spelling-error'},
            {warning: warningWithRange} as any,
        ));
    }

    return DecorationSet.create(doc, decorations);
}

export interface ISpellcheckerContextMenuPayload {
    warning: ISpellcheckWarningWithRange;
    targetElement: HTMLElement;
    spellchecker: ISpellchecker;
}

export interface ISpellcheckerExtensionOptions {
    language: string;

    // when a decorated word is right-clicked
    onContextMenu?(payload: ISpellcheckerContextMenuPayload): void;

    // testing seam; defaults to editor3's registry for the language
    spellchecker?: ISpellchecker;
}

export function replaceWarningText(
    editor: Editor,
    range: {from: number; to: number},
    replacement: string,
): boolean {
    return editor.chain().focus().insertContentAt({from: range.from, to: range.to}, replacement)
        .run();
}

export function createSpellcheckerExtension(options: ISpellcheckerExtensionOptions) {
    return Extension.create({
        name: 'spellchecker',

        addStorage() {
            return {
                // set once the plugin view is created; used to re-run the
                // check after dictionary changes
                check: null as (() => void) | null,
            };
        },

        addProseMirrorPlugins() {
            const spellchecker = options.spellchecker ?? getSpellchecker(options.language);
            const storage = this.storage;

            if (spellchecker == null) {
                return [];
            }

            let debounceTimer: number | null = null;
            let abortController: AbortController | null = null;

            return [
                new Plugin<ISpellcheckerPluginState>({
                    key: spellcheckerPluginKey,

                    state: {
                        init: () => ({decorations: DecorationSet.empty}),
                        apply: (tr, prev, _oldState, newState) => {
                            const meta = tr.getMeta(spellcheckerPluginKey);

                            if (meta?.warnings != null && meta.forDoc === newState.doc) {
                                return {decorations: warningsToDecorations(newState.doc, meta.warnings)};
                            }

                            if (tr.docChanged) {
                                return {decorations: prev.decorations.map(tr.mapping, tr.doc)};
                            }

                            return prev;
                        },
                    },

                    props: {
                        decorations(state) {
                            return spellcheckerPluginKey.getState(state)?.decorations;
                        },

                        handleDOMEvents: {
                            contextmenu: (view, event) => {
                                const target = event.target as HTMLElement;

                                if (!target.classList.contains('spelling-error')
                                    && !target.classList.contains('grammar-error')
                                ) {
                                    return false;
                                }

                                const pos = view.posAtDOM(target, 0);
                                const decorations = spellcheckerPluginKey.getState(view.state)
                                    ?.decorations.find(pos, pos + 1) ?? [];
                                const decoration = decorations[0];

                                if (decoration == null || options.onContextMenu == null) {
                                    return false;
                                }

                                event.preventDefault();

                                options.onContextMenu({
                                    warning: (decoration as any).spec.warning,
                                    targetElement: target,
                                    spellchecker,
                                });

                                return true;
                            },
                        },
                    },

                    view: (editorView) => {
                        const runCheck = () => {
                            abortController?.abort();
                            abortController = new AbortController();

                            const doc = editorView.state.doc;

                            spellchecker.check(pmDocToPlainText(doc), abortController.signal).then((warnings) => {
                                if (editorView.isDestroyed || editorView.state.doc !== doc) {
                                    return; // stale result; a newer check is scheduled
                                }

                                editorView.dispatch(
                                    editorView.state.tr.setMeta(spellcheckerPluginKey, {warnings, forDoc: doc}),
                                );
                            });
                        };

                        const scheduleCheck = () => {
                            if (debounceTimer != null) {
                                window.clearTimeout(debounceTimer);
                            }

                            debounceTimer = window.setTimeout(runCheck, CHECK_DEBOUNCE_MS);
                        };

                        storage.check = runCheck;
                        scheduleCheck(); // initial pass

                        return {
                            update: (view, prevState) => {
                                if (!view.state.doc.eq(prevState.doc)) {
                                    scheduleCheck();
                                }
                            },
                            destroy: () => {
                                if (debounceTimer != null) {
                                    window.clearTimeout(debounceTimer);
                                }

                                abortController?.abort();
                                storage.check = null;
                            },
                        };
                    },
                }),
            ];
        },
    });
}

/**
 * Re-runs the check, e.g. after a word was added to the dictionary.
 */
export function refreshSpellcheck(editor: Editor): void {
    (editor.storage as any).spellchecker?.check?.();
}
