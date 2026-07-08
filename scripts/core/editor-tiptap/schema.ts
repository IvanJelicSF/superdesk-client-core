import {Schema} from '@tiptap/pm/model';

/**
 * Highlight config keys as used in editor3 (`highlightsConfig.ts`). Highlight
 * inline styles are named `<KEY>-<n>` (e.g. `ANNOTATION-1`, `ADD_SUGGESTION-2`)
 * and their payload lives in the `highlightsData` sidecar (see `IEditorTiptapCustomData`).
 */
export const HIGHLIGHT_KEYS = [
    'COMMENT',
    'ANNOTATION',
    'ADD_SUGGESTION',
    'DELETE_SUGGESTION',
    'TOGGLE_BOLD_SUGGESTION',
    'TOGGLE_ITALIC_SUGGESTION',
    'TOGGLE_UNDERLINE_SUGGESTION',
    'TOGGLE_SUBSCRIPT_SUGGESTION',
    'TOGGLE_SUPERSCRIPT_SUGGESTION',
    'TOGGLE_STRIKETHROUGH_SUGGESTION',
    'BLOCK_STYLE_SUGGESTION',
    'SPLIT_PARAGRAPH_SUGGESTION',
    'MERGE_PARAGRAPHS_SUGGESTION',
    'DELETE_EMPTY_PARAGRAPH_SUGGESTION',
    'ADD_LINK_SUGGESTION',
    'REMOVE_LINK_SUGGESTION',
    'CHANGE_LINK_SUGGESTION',
] as const;

export function getHighlightKeyFromStyleName(styleName: string): string | null {
    const delimiterIndex = styleName.lastIndexOf('-');

    if (delimiterIndex === -1) {
        return null;
    }

    const key = styleName.slice(0, delimiterIndex);

    return (HIGHLIGHT_KEYS as ReadonlyArray<string>).includes(key) ? key : null;
}

/**
 * Sidecar metadata stored on the doc node, equivalent to what editor3 keeps in
 * the first block's data (`editor3CustomData.ts`).
 */
export interface IEditorTiptapCustomData {
    // keyed by highlight style name, e.g. `ANNOTATION-1`
    highlightsData: {[styleName: string]: any};
    lastHighlightIds: {[highlightKey: string]: number};
    resolvedCommentsHistory?: Array<any>;
    resolvedSuggestionsHistory?: Array<any>;
    __PUBLIC_API__comments?: Array<any>;
}

/**
 * ProseMirror schema mirroring the editor3 content model.
 *
 * Divergences from stock tiptap extensions are intentional to match Draft.js
 * semantics: blockquote and codeBlock contain inline content directly (a
 * Draft.js block is a flat run of styled text), and table cells contain
 * arbitrary blocks (a Draft.js table cell is a full nested content state).
 */
export const editorTiptapSchema = new Schema({
    nodes: {
        doc: {
            content: 'block+',
            attrs: {
                customData: {default: {}},
            },
        },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{tag: 'p'}],
            toDOM: () => ['p', 0],
        },
        heading: {
            attrs: {level: {default: 1}},
            content: 'inline*',
            group: 'block',
            defining: true,
            parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({tag: `h${level}`, attrs: {level}})),
            toDOM: (node) => [`h${node.attrs.level}`, 0],
        },
        blockquote: {
            content: 'inline*',
            group: 'block',
            defining: true,
            parseDOM: [{tag: 'blockquote'}],
            toDOM: () => ['blockquote', 0],
        },
        codeBlock: {
            content: 'inline*',
            group: 'block',
            defining: true,
            parseDOM: [{tag: 'pre', preserveWhitespace: 'full'}],
            toDOM: () => ['pre', ['code', 0]],
        },
        bulletList: {
            content: 'listItem+',
            group: 'block',
            parseDOM: [{tag: 'ul'}],
            toDOM: () => ['ul', 0],
        },
        orderedList: {
            content: 'listItem+',
            group: 'block',
            parseDOM: [{tag: 'ol'}],
            toDOM: () => ['ol', 0],
        },
        listItem: {
            content: 'paragraph (bulletList | orderedList)*',
            defining: true,
            parseDOM: [{tag: 'li'}],
            toDOM: () => ['li', 0],
        },
        // `tableRole` and the colspan/rowspan/colwidth attributes make the
        // nodes compatible with prosemirror-tables editing commands; the
        // HTML serializer ignores them (editor3 tables had no cell spans)
        table: {
            attrs: {withHeader: {default: false}},
            content: 'tableRow+',
            group: 'block',
            isolating: true,
            tableRole: 'table',
            parseDOM: [{tag: 'table'}],
            toDOM: () => ['table', 0],
        },
        tableRow: {
            content: '(tableCell | tableHeader)+',
            tableRole: 'row',
            parseDOM: [{tag: 'tr'}],
            toDOM: () => ['tr', 0],
        },
        tableHeader: {
            content: 'block+',
            isolating: true,
            tableRole: 'header_cell',
            attrs: {
                colspan: {default: 1},
                rowspan: {default: 1},
                colwidth: {default: null},
            },
            parseDOM: [{tag: 'th'}],
            toDOM: () => ['th', 0],
        },
        tableCell: {
            content: 'block+',
            isolating: true,
            tableRole: 'cell',
            attrs: {
                colspan: {default: 1},
                rowspan: {default: 1},
                colwidth: {default: null},
            },
            parseDOM: [{tag: 'td'}],
            toDOM: () => ['td', 0],
        },
        multiLineQuote: {
            content: 'block+',
            group: 'block',
            isolating: true,
            toDOM: () => ['div', {class: 'multi-line-quote'}, 0],
        },
        customBlock: {
            attrs: {vocabularyId: {default: null}},
            content: 'block+',
            group: 'block',
            isolating: true,
            toDOM: (node) => ['div', {'data-custom-block-type': node.attrs.vocabularyId}, 0],
        },
        media: {
            // full IArticle media object, as stored in the editor3 MEDIA entity
            attrs: {media: {default: null}, rawKey: {default: null}},
            group: 'block',
            atom: true,
            toDOM: () => ['div', {class: 'editor-tiptap--media'}],
        },
        embed: {
            // `data` is the oembed response, `description` the optional caption
            attrs: {data: {default: null}, description: {default: null}, rawKey: {default: null}},
            group: 'block',
            atom: true,
            toDOM: () => ['div', {class: 'editor-tiptap--embed'}],
        },
        articleEmbed: {
            // `item` as stored by editor3 ARTICLE_EMBED entities (needs at least _id and body_html)
            attrs: {item: {default: null}},
            group: 'block',
            atom: true,
            toDOM: () => ['div', {class: 'editor-tiptap--article-embed'}],
        },
        text: {
            group: 'inline',
        },
        hardBreak: {
            inline: true,
            group: 'inline',
            selectable: false,
            marks: '_',
            parseDOM: [{tag: 'br'}],
            toDOM: () => ['br'],
        },
    },
    marks: {
        link: {
            attrs: {
                href: {default: null},
                target: {default: null},
                attachment: {default: null},
            },
            inclusive: false,
            // anchors that are neither links nor attachments are not imported
            // (matching Draft.js's convertFromHTML, which required a href)
            parseDOM: [
                {
                    tag: 'a[href]',
                    getAttrs: (dom: HTMLElement) => ({
                        href: dom.getAttribute('href'),
                        target: dom.getAttribute('target'),
                        attachment: dom.getAttribute('data-attachment'),
                    }),
                },
                {
                    tag: 'a[data-attachment]',
                    getAttrs: (dom: HTMLElement) => ({
                        href: dom.getAttribute('href'),
                        target: dom.getAttribute('target'),
                        attachment: dom.getAttribute('data-attachment'),
                    }),
                },
            ],
            toDOM: (mark) => ['a', {
                href: mark.attrs.href ?? undefined,
                target: mark.attrs.target ?? undefined,
                'data-attachment': mark.attrs.attachment ?? undefined,
            }],
        },
        // the style-attribute rules below mirror Draft.js's
        // `styleFromNodeAttributes` (its `boldValues`/`notBoldValues` and
        // text-decoration handling), so pasted styled spans import the same
        bold: {
            parseDOM: [
                // Google Docs wraps its clipboard payload in <b style="font-weight:normal">
                {tag: 'b', getAttrs: (dom: HTMLElement) => dom.style.fontWeight !== 'normal' && null},
                {tag: 'strong'},
                {
                    style: 'font-weight',
                    getAttrs: ((value: string) =>
                        (['bold', 'bolder', '500', '600', '700', '800', '900'].includes(value) ? null : false)
                    ) as any,
                },
                ...['light', 'lighter', 'normal', '100', '200', '300', '400'].map((value) => ({
                    style: `font-weight=${value}`,
                    clearMark: (mark) => mark.type.name === 'bold',
                })),
            ],
            toDOM: () => ['b'],
        },
        italic: {
            parseDOM: [
                {tag: 'i'},
                {tag: 'em'},
                {style: 'font-style=italic'},
                {style: 'font-style=normal', clearMark: (mark) => mark.type.name === 'italic'},
            ],
            toDOM: () => ['i'],
        },
        underline: {
            parseDOM: [
                {tag: 'u'},
                {style: 'text-decoration=underline'},
                {style: 'text-decoration=none', clearMark: (mark) => mark.type.name === 'underline'},
            ],
            toDOM: () => ['u'],
        },
        strike: {
            parseDOM: [
                {tag: 's'},
                {tag: 'del'},
                {tag: 'strike'},
                {style: 'text-decoration=line-through'},
                {style: 'text-decoration=none', clearMark: (mark) => mark.type.name === 'strike'},
            ],
            toDOM: () => ['s'],
        },
        subscript: {
            parseDOM: [{tag: 'sub'}],
            toDOM: () => ['sub'],
        },
        superscript: {
            parseDOM: [{tag: 'sup'}],
            toDOM: () => ['sup'],
        },
        code: {
            parseDOM: [{tag: 'code'}],
            toDOM: () => ['code'],
        },
        /**
         * Comment / annotation / suggestion ranges. `styleName` keys into
         * `doc.attrs.customData.highlightsData`; `highlightKey` is the
         * config key part of the style name (see HIGHLIGHT_KEYS).
         * `excludes: ''` allows overlapping highlights of the same type.
         */
        highlight: {
            attrs: {
                styleName: {},
                highlightKey: {},
            },
            excludes: '',
            inclusive: false,
            toDOM: (mark) => {
                // in-editor visuals matching editor3's highlightsConfig
                // draftStyleMap; not part of the serialized output
                const styleByKey = {
                    COMMENT: 'background-color: var(--sd-editor-colour__comment-bg);',
                    ANNOTATION: 'border-bottom: 4px solid var(--sd-editor-colour__adding);',
                    ADD_SUGGESTION:
                        'color: var(--sd-editor-colour__adding);'
                        + ' background-color: var(--sd-editor-colour__adding-bg);',
                    DELETE_SUGGESTION:
                        'text-decoration: line-through;'
                        + ' color: var(--sd-editor-colour__removing);'
                        + ' background-color: var(--sd-editor-colour__removing-bg);',
                };
                const removeSuggestionStyle =
                    'color: var(--sd-editor-colour__removing);'
                    + ' background-color: var(--sd-editor-colour__removing-bg);';

                // style / link / block suggestions share one visual
                ['TOGGLE_BOLD', 'TOGGLE_ITALIC', 'TOGGLE_UNDERLINE', 'TOGGLE_STRIKETHROUGH',
                    'TOGGLE_SUBSCRIPT', 'TOGGLE_SUPERSCRIPT', 'BLOCK_STYLE',
                    'ADD_LINK', 'REMOVE_LINK', 'CHANGE_LINK',
                ].forEach((key) => {
                    styleByKey[`${key}_SUGGESTION`] = removeSuggestionStyle;
                });

                return ['span', {
                    'data-highlight': mark.attrs.styleName,
                    style: styleByKey[mark.attrs.highlightKey],
                }];
            },
        },
        /**
         * Custom editor tags (`customEditorTags` in content profile config),
         * stored in editor3 as non-standard inline styles.
         */
        customTag: {
            attrs: {tagId: {}},
            excludes: '',
            parseDOM: [{
                tag: 'span[custom-editor-tag-id]',
                getAttrs: (dom: HTMLElement) => ({tagId: dom.getAttribute('custom-editor-tag-id')}),
            }],
            toDOM: (mark) => ['span', {'custom-editor-tag-id': mark.attrs.tagId}],
        },
    },
});
