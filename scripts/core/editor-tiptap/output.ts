import {Node as PmNode} from '@tiptap/pm/model';
import {editorTiptapSchema} from './schema';
import {pmDocToHtml, collectAnnotationIds} from './to-html';
import {convertDraftToPmDoc} from './from-draftjs';
import {logger} from 'core/services/logger';

/**
 * Article output helpers for the Tiptap editor — the equivalents of what
 * editor3 computed on save: the plain-text value, the `annotations` field
 * (see `getAnnotationsForStorage` in `core/editor3/store`), and embedded
 * article associations (see `copyEmbeddedArticlesIntoAssociations`).
 */

export function toPmNode(doc: PmNode | {[key: string]: any}): PmNode {
    return doc instanceof PmNode ? doc : PmNode.fromJSON(editorTiptapSchema, doc);
}

function childrenOf(node: PmNode): Array<PmNode> {
    const children: Array<PmNode> = [];

    node.forEach((child) => {
        children.push(child);
    });

    return children;
}

/**
 * Plain text of the document, matching Draft.js's `getPlainText`: one line
 * per block in document order (list items flattened), atomic blocks
 * contributing a single space; table/quote cell content was a separate
 * content state in Draft.js and is not included.
 */
export function pmDocToPlainText(doc: PmNode | {[key: string]: any}): string {
    const lines: Array<string> = [];

    // Draft.js kept line breaks as '\n' characters inside block text;
    // ProseMirror stores them as hardBreak nodes
    const textOf = (block: PmNode): string => {
        let text = '';

        block.forEach((child) => {
            text += child.isText ? child.text : '\n';
        });

        return text;
    };

    const visitBlocks = (nodes: Array<PmNode>) => {
        for (const node of nodes) {
            switch (node.type.name) {
                case 'paragraph':
                case 'heading':
                case 'blockquote':
                case 'codeBlock':
                    lines.push(textOf(node));
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
                    lines.push(' ');
                    break;
                default:
                    break;
            }
        }
    };

    visitBlocks(childrenOf(toPmNode(doc)));

    return lines.join('\n');
}

/**
 * The `msg` of an annotation is a serialized document: Draft.js raw format
 * on content converted from editor3, ProseMirror JSON once annotations are
 * authored in the Tiptap editor.
 */
function annotationMsgToHtml(msg: string): string {
    const parsed = JSON.parse(msg);

    if (parsed?.type === 'doc') {
        return pmDocToHtml(parsed);
    }

    return pmDocToHtml(convertDraftToPmDoc(parsed));
}

/**
 * Annotations in the storage format of `fields_meta[field].annotations` /
 * `IArticle.annotations`: `{id, type, body}`, ids being 1-based order of
 * first appearance — identical to editor3's `getAnnotationsForStorage`
 * (whose ids also match the `annotation-id` attributes in the HTML output).
 */
export function getAnnotationsForStorage(
    doc: PmNode | {[key: string]: any},
): Array<{id: number; type: string; body: string}> {
    const docNode = toPmNode(doc);
    const annotationIds = collectAnnotationIds(childrenOf(docNode));
    const highlightsData = docNode.attrs.customData?.highlightsData ?? {};
    const annotations: Array<{id: number; type: string; body: string}> = [];

    annotationIds.forEach((id, styleName) => {
        const data = highlightsData[styleName]?.data;

        if (data == null) {
            logger.warn(`editor-tiptap: annotation ${styleName} has no data; skipped in output`);
            return;
        }

        annotations.push({
            id,
            type: data.annotationType,
            body: annotationMsgToHtml(data.msg),
        });
    });

    return annotations;
}

/**
 * Returns items of embedded articles, for copying into
 * `IArticle.associations` on save (equivalent of editor3's
 * `copyEmbeddedArticlesIntoAssociations`).
 */
export function getEmbeddedArticles(doc: PmNode | {[key: string]: any}): Array<any> {
    const items: Array<any> = [];

    toPmNode(doc).descendants((node) => {
        if (node.type.name === 'articleEmbed' && node.attrs.item != null) {
            items.push(node.attrs.item);
        }

        return true;
    });

    return items;
}

/**
 * A minimal document from plain text: one paragraph per line (the
 * equivalent of Draft.js's `ContentState.createFromText`). Used when a
 * field only has a string value and no stored editor state.
 */
export function plainTextToPmDoc(text: string): {[key: string]: any} {
    const lines = text.split('\n');

    return {
        type: 'doc',
        attrs: {customData: {highlightsData: {}, lastHighlightIds: {}}},
        content: lines.map((line) => (
            line.length > 0
                ? {type: 'paragraph', content: [{type: 'text', text: line}]}
                : {type: 'paragraph'}
        )),
    };
}
