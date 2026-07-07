import {Node as PmNode, Mark} from '@tiptap/pm/model';
import {editorTiptapSchema} from './schema';
import {trimStartExact, trimEndExact} from 'core/helpers/utils';
import {customEditorTags} from 'apps/workspace/content/components/get-content-profiles-form-config';
import {CUSTOM_EDITOR_TAG_ATTR} from 'core/editor3/components/customStyleMap';
import {isQumuWidget, postProccessQumuEmbed} from 'core/editor3/components/embeds/QumuWidget';
import {MULTI_LINE_QUOTE_CLASS} from 'core/editor3/components/multi-line-quote/MultiLineQuote';
import {sdApi} from 'api';
import {configurableAlgorithms} from 'core/ui/configurable-algorithms';
import {logger} from 'core/services/logger';

/**
 * Serializes an editor-tiptap ProseMirror document to `body_html` markup.
 *
 * Output parity with editor3's `editor3StateToHtml` (which delegates to
 * `draft-js-export-html`) is a hard requirement — published content must not
 * drift when an article is converted (see the migration plan's golden tests).
 * The algorithm below therefore mirrors `MarkupGenerator` from
 * draft-js-export-html@1.3.3 and editor3's `AtomicBlockParser`, including
 * whitespace, indentation, and style-nesting behavior.
 */

const BREAK = '<br>';
const INDENT = '  ';

// Inner-most to outer-most, matching the merged style order produced by
// draft-js-export-html's combineOrderedStyles with editor3's options.
const STYLE_ORDER: Array<{mark: string; element: string}> = [
    {mark: 'bold', element: 'b'},
    {mark: 'italic', element: 'i'},
    {mark: 'underline', element: 'u'},
    {mark: 'strike', element: 's'},
    {mark: 'code', element: 'code'},
    {mark: 'subscript', element: 'sub'},
    {mark: 'superscript', element: 'sup'},
];

interface ISerializeContext {
    disabled: Array<string>;
    tagStyles: Set<string>;
    // per-scope annotation ids: styleName -> 1-based id in order of first appearance
    annotationIds: Map<string, number>;
    // doc-level Draft.js-style entity ordinals, used as rawKey fallback for
    // media nodes that were not converted from a draftjsState (see below)
    entityOrdinals?: Map<PmNode, number>;
    isCodeBlock?: boolean;
}

export interface IPmToHtmlOptions {
    // set of disabled elements, ie. ['table'] will ignore tables
    disabled?: Array<string>;
    tagStylesOverride?: Set<string>;
}

export function pmDocToHtml(doc: PmNode | {[key: string]: any}, options: IPmToHtmlOptions = {}): string {
    const docNode = doc instanceof PmNode ? doc : PmNode.fromJSON(editorTiptapSchema, doc);

    docNode.check();

    const tagStyles = options.tagStylesOverride
        ?? new Set(customEditorTags.map(({editor3Style}) => editor3Style));
    const blocks = childrenOf(docNode);

    return serializeScope(blocks, options.disabled ?? [], tagStyles, collectEntityOrdinals(blocks));
}

function childrenOf(node: PmNode): Array<PmNode> {
    const children: Array<PmNode> = [];

    node.forEach((child) => {
        children.push(child);
    });

    return children;
}

/**
 * A "scope" corresponds to one Draft.js content state: the main document, a
 * table cell, or a quote / custom block body — each was serialized in editor3
 * by its own `editor3StateToHtml` call, with its own annotation numbering and
 * its own leading/trailing empty-paragraph trim.
 */
function serializeScope(
    blocks: Array<PmNode>,
    disabled: Array<string>,
    tagStyles: Set<string>,
    entityOrdinals?: Map<PmNode, number>,
): string {
    const ctx: ISerializeContext = {
        disabled,
        tagStyles,
        annotationIds: collectAnnotationIds(blocks),
        entityOrdinals,
    };

    const generated = blocks.map((block) => serializeBlock(block, ctx)).join('').trim();

    return trimStartExact(
        trimEndExact(
            generated,
            '<p><br></p>',
        ),
        '<p><br></p>',
    ).trim();
}

/**
 * Assigns 1-based ids to annotation highlights in order of first appearance,
 * matching `getAnnotationsFromContentState` (which enumerates unique style
 * names in character order). Nested table/quote/custom-block content is a
 * separate scope and is deliberately not visited.
 */
function collectAnnotationIds(blocks: Array<PmNode>): Map<string, number> {
    const ids = new Map<string, number>();

    const visitInline = (block: PmNode) => {
        block.forEach((child) => {
            for (const mark of child.marks) {
                if (mark.type.name === 'highlight'
                    && mark.attrs.highlightKey === 'ANNOTATION'
                    && !ids.has(mark.attrs.styleName)
                ) {
                    ids.set(mark.attrs.styleName, ids.size + 1);
                }
            }
        });
    };

    const visitBlocks = (nodes: Array<PmNode>) => {
        for (const node of nodes) {
            switch (node.type.name) {
                case 'paragraph':
                case 'heading':
                case 'blockquote':
                case 'codeBlock':
                    visitInline(node);
                    break;
                case 'bulletList':
                case 'orderedList':
                case 'listItem':
                    visitBlocks(childrenOf(node));
                    break;
                default:
                    break; // separate scopes (table etc.) and atoms
            }
        }
    };

    visitBlocks(blocks);

    return ids;
}

/**
 * Draft.js assigned entity keys by order of first appearance in the content
 * (links and atomic entities alike), and media markup embeds that key as
 * `editor_<key>`. Media converted from a draftjsState carries the original
 * key in its `rawKey` attr; media created by import or editing does not, and
 * falls back to these ordinals so the output matches what editor3 would
 * produce for the same content.
 */
function collectEntityOrdinals(blocks: Array<PmNode>): Map<PmNode, number> {
    const ordinals = new Map<PmNode, number>();
    let counter = 0;

    const visitInline = (block: PmNode) => {
        let openLink: {[key: string]: any} | null = null;

        block.forEach((child) => {
            const linkMark = getLinkMark(child.marks);

            if (linkMark == null) {
                openLink = null;
            } else {
                const attrs = linkHtmlAttrs(linkMark);

                if (openLink == null || !attrsEqual(openLink, attrs)) {
                    counter++;
                    openLink = attrs;
                }
            }
        });
    };

    const visitBlocks = (nodes: Array<PmNode>) => {
        for (const node of nodes) {
            switch (node.type.name) {
                case 'paragraph':
                case 'heading':
                case 'blockquote':
                case 'codeBlock':
                    visitInline(node);
                    break;
                case 'bulletList':
                case 'orderedList':
                case 'listItem':
                    visitBlocks(childrenOf(node));
                    break;
                case 'media':
                case 'embed':
                case 'articleEmbed':
                case 'table':
                case 'multiLineQuote':
                case 'customBlock':
                    // cell content is a separate Draft.js content state
                    // with its own numbering, so it is not visited
                    ordinals.set(node, counter);
                    counter++;
                    break;
                default:
                    break;
            }
        }
    };

    visitBlocks(blocks);

    return ordinals;
}

function serializeBlock(node: PmNode, ctx: ISerializeContext): string {
    switch (node.type.name) {
        case 'paragraph':
            return `<p>${inlineContent(node, ctx)}</p>\n`;
        case 'heading':
            return `<h${node.attrs.level}>${inlineContent(node, ctx)}</h${node.attrs.level}>\n`;
        case 'blockquote':
            return `<blockquote>${inlineContent(node, ctx)}</blockquote>\n`;
        case 'codeBlock':
            return `<pre><code>${inlineContent(node, {...ctx, isCodeBlock: true})}</code></pre>\n`;
        case 'bulletList':
        case 'orderedList':
            return serializeList(node, 0, ctx);
        case 'media':
            return renderMedia(node, ctx) + '\n';
        case 'embed':
            return renderEmbed(node) + '\n';
        case 'articleEmbed':
            return `<div data-association-key="${node.attrs.item._id}">${node.attrs.item.body_html}</div>\n`;
        case 'table':
            return renderTable(node, ctx) + '\n';
        case 'multiLineQuote':
            return renderMultiLineQuote(node, ctx) + '\n';
        case 'customBlock':
            return renderCustomBlock(node, ctx) + '\n';
        default:
            logger.warn(`editor-tiptap: cannot serialize node type ${node.type.name}`);
            return '';
    }
}

function serializeList(list: PmNode, level: number, ctx: ISerializeContext): string {
    const tag = list.type.name === 'orderedList' ? 'ol' : 'ul';
    const out: Array<string> = [];

    out.push(INDENT.repeat(level) + `<${tag}>\n`);

    for (const listItem of childrenOf(list)) {
        const children = childrenOf(listItem);
        const paragraph = children[0];
        const childLists = children.slice(1);

        out.push(INDENT.repeat(level + 1) + '<li>' + inlineContent(paragraph, ctx));

        if (childLists.length > 0) {
            out.push('\n');

            for (const childList of childLists) {
                out.push(serializeList(childList, level + 2, ctx));
            }

            out.push(INDENT.repeat(level + 1));
        }

        out.push('</li>\n');
    }

    out.push(INDENT.repeat(level) + `</${tag}>\n`);

    return out.join('');
}

interface IStylePiece {
    text: string;
    marks: ReadonlyArray<Mark>;
}

interface IEntityGroup {
    linkAttrs: {[key: string]: any} | null;
    pieces: Array<IStylePiece>;
}

function getLinkMark(marks: ReadonlyArray<Mark>): Mark | null {
    return marks.find((mark) => mark.type.name === 'link') ?? null;
}

function nonLinkMarksEqual(a: ReadonlyArray<Mark>, b: ReadonlyArray<Mark>): boolean {
    const aRest = a.filter((mark) => mark.type.name !== 'link');
    const bRest = b.filter((mark) => mark.type.name !== 'link');

    return aRest.length === bRest.length && aRest.every((mark, i) => mark.eq(bRest[i]));
}

function inlineContent(block: PmNode, ctx: ISerializeContext): string {
    if (block.childCount === 0) {
        // Prevent element collapse if completely empty.
        return BREAK;
    }

    const children = childrenOf(block);

    // Whitespace preservation operates on the whole block text (as in
    // draft-js-export-html), so it is applied to the concatenated text before
    // slicing it back per inline node. hardBreak counts as one '\n' character,
    // exactly like the newline characters Draft.js kept inline.
    const virtualText = children.map((child) => (child.isText ? child.text : '\n')).join('');
    const preserved = preserveWhitespace(virtualText);

    const groups: Array<IEntityGroup> = [];
    let offset = 0;

    for (const child of children) {
        const childLength = child.isText ? (child.text as string).length : 1;
        const text = child.isText ? preserved.slice(offset, offset + childLength) : '\n';
        const linkMark = getLinkMark(child.marks);
        const linkAttrs = linkMark == null ? null : linkHtmlAttrs(linkMark);

        offset += childLength;

        const lastGroup: IEntityGroup | undefined = groups[groups.length - 1];
        const group = lastGroup != null && attrsEqual(lastGroup.linkAttrs, linkAttrs)
            ? lastGroup
            : (groups.push({linkAttrs, pieces: []}), groups[groups.length - 1]);

        const lastPiece = group.pieces[group.pieces.length - 1];

        if (lastPiece != null && nonLinkMarksEqual(lastPiece.marks, child.marks)) {
            lastPiece.text += text;
        } else {
            group.pieces.push({text, marks: child.marks});
        }
    }

    return groups.map((group) => {
        const content = group.pieces.map((piece) => renderStylePiece(piece, ctx)).join('');

        if (group.linkAttrs != null) {
            return `<a${stringifyAttrs(group.linkAttrs)}>${content}</a>`;
        }

        return content;
    }).join('');
}

/**
 * Mirrors the LINK branch of `entityStyleFn` in `editor3StateToHtml`,
 * including attribute order.
 */
function linkHtmlAttrs(linkMark: Mark): {[key: string]: any} {
    const {href, target, attachment} = linkMark.attrs;

    if (attachment != null) {
        return {'data-attachment': attachment};
    }

    if (target != null) {
        return {href, target};
    }

    return {href};
}

function attrsEqual(a: {[key: string]: any} | null, b: {[key: string]: any} | null): boolean {
    if (a == null || b == null) {
        return a === b;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
}

function renderStylePiece(piece: IStylePiece, ctx: ISerializeContext): string {
    let content = encodeContent(piece.text);

    const has = (markName: string) => piece.marks.some((mark) => mark.type.name === markName);

    for (const {mark, element} of STYLE_ORDER) {
        // If our block type is CODE then don't wrap inline code elements.
        if (mark === 'code' && ctx.isCodeBlock === true) {
            continue;
        }

        if (has(mark)) {
            content = `<${element}>${content}</${element}>`;
        }
    }

    // Equivalent of editor3's `inlineStyleFn`: annotation span first,
    // custom editor tag span otherwise; a single wrapper either way.
    const annotationMark = piece.marks.find(
        (mark) => mark.type.name === 'highlight' && ctx.annotationIds.has(mark.attrs.styleName),
    );

    if (annotationMark != null) {
        return `<span annotation-id="${ctx.annotationIds.get(annotationMark.attrs.styleName)}">${content}</span>`;
    }

    const tagMark = piece.marks.find(
        (mark) => mark.type.name === 'customTag' && ctx.tagStyles.has(mark.attrs.tagId),
    );

    if (tagMark != null) {
        return `<span ${CUSTOM_EDITOR_TAG_ATTR}="${encodeAttr(tagMark.attrs.tagId)}">${content}</span>`;
    }

    return content;
}

// --- atomic blocks (ports of editor3's AtomicBlockParser) ---

function renderMedia(node: PmNode, ctx: ISerializeContext): string {
    const {media} = node.attrs;
    const rawKey = node.attrs.rawKey ?? ctx.entityOrdinals?.get(node) ?? 0;
    const rendition = media.renditions.original || media.renditions.viewImage;
    const href = rendition.href;
    const alt = media.alt_text || '';

    let type;
    let content;
    const desc = media.description_text;

    switch (media.type) {
        case 'video':
            type = 'Video';
            content = `<video controls src="${href}" alt="${alt}" width="100%" height="100%" />`;
            break;
        case 'audio':
            type = 'Audio';
            content = `<audio controls src="${href}" alt="${alt}" width="100%" height="100%" />`;
            break;
        default:
            type = 'Image';
            content = `<img src="${href}" alt="${alt}" />`;
    }

    const id = `${type} {id: "editor_${rawKey}"}`;

    if (desc) {
        content += `\n    <figcaption>${desc}</figcaption>`;
    }

    return `
<!-- EMBED START ${id} -->
<figure>
    ${content}
</figure>
<!-- EMBED END ${id} -->
`.trim();
}

function renderEmbed(node: PmNode): string {
    const {data, description} = node.attrs;
    const descriptionHtml = typeof description === 'string' && description.length > 0
        ? `<p class="embed-block__description">${description}</p>`
        : '';
    const finalHtml = isQumuWidget(data.html) ? postProccessQumuEmbed(data.html) : data.html;

    return `<div class="embed-block">${finalHtml}${descriptionHtml}</div>`.trim();
}

function serializeCell(cell: PmNode, ctx: ISerializeContext): string {
    // table cell content was serialized in editor3 via
    // `editor3StateToHtml(cellContentState, ['table'])`
    return serializeScope(childrenOf(cell), ['table'], ctx.tagStyles);
}

function renderTable(table: PmNode, ctx: ISerializeContext): string {
    if (ctx.disabled.indexOf('table') > -1) {
        return '';
    }

    const withHeader = table.attrs.withHeader === true;
    const rows = childrenOf(table);
    let html = '<table>';

    if (withHeader) {
        html += '<thead><tr>';

        for (const cell of childrenOf(rows[0])) {
            html += `<th>${serializeCell(cell, ctx)}</th>`;
        }

        html += '</tr></thead>';
    }

    if (!withHeader || rows.length > 1) {
        html += '<tbody>';

        for (const row of rows.slice(withHeader ? 1 : 0)) {
            html += '<tr>';

            for (const cell of childrenOf(row)) {
                html += `<td>${serializeCell(cell, ctx)}</td>`;
            }

            html += '</tr>';
        }

        html += '</tbody>';
    }

    html += '</table>';

    return html;
}

function renderMultiLineQuote(node: PmNode, ctx: ISerializeContext): string {
    if (ctx.disabled.indexOf('table') > -1) {
        return '';
    }

    return `<div class="${MULTI_LINE_QUOTE_CLASS}">`
        + serializeScope(childrenOf(node), [], ctx.tagStyles)
        + '</div>';
}

function renderCustomBlock(node: PmNode, ctx: ISerializeContext): string {
    if (ctx.disabled.indexOf('table') > -1) {
        return '';
    }

    const vocabulary = sdApi.vocabularies.getAll().get(node.attrs.vocabularyId);
    const contentHtml = serializeScope(childrenOf(node), [], ctx.tagStyles);

    const attributes: Array<{name: string; value: string}> = [
        {name: 'data-custom-block-type', value: vocabulary._id},
        ...(
            configurableAlgorithms.editor3?.customBlocks?.getAdditionalWrapperAttributes(
                vocabulary,
                contentHtml,
            ) ?? []
        ),
    ];

    const attributesString = attributes.map(({name, value}) => `${name}="${value}"`).join(' ');

    return `<div ${attributesString}>${contentHtml}</div>`;
}

// --- text encoding (ports of draft-js-export-html helpers) ---

function preserveWhitespace(text: string): string {
    const length = text.length;
    // Prevent leading/trailing/consecutive whitespace collapse.
    const newText = new Array(length);

    for (let i = 0; i < length; i++) {
        if (text[i] === ' ' && (i === 0 || i === length - 1 || text[i - 1] === ' ')) {
            newText[i] = '\xA0';
        } else {
            newText[i] = text[i];
        }
    }

    return newText.join('');
}

function encodeContent(text: string): string {
    return text
        .split('&').join('&amp;')
        .split('<').join('&lt;')
        .split('>').join('&gt;')
        .split('\xA0').join('&nbsp;')
        .split('\n').join(BREAK + '\n');
}

function encodeAttr(text: string): string {
    return text
        .split('&').join('&amp;')
        .split('<').join('&lt;')
        .split('>').join('&gt;')
        .split('"').join('&quot;');
}

function stringifyAttrs(attrs: {[key: string]: any}): string {
    const parts: Array<string> = [];

    for (const name of Object.keys(attrs)) {
        const value = attrs[name];

        if (value != null) {
            parts.push(` ${name}="${encodeAttr(String(value))}"`);
        }
    }

    return parts.join('');
}
