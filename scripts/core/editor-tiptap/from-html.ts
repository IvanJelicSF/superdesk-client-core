import docsSoap from 'docs-soap';
import {DOMParser as PmDOMParser} from '@tiptap/pm/model';
import {editorTiptapSchema} from './schema';
import {getStyleFingerprints, IStyleFingerprint} from 'core/editor3/html/from-html';
import {CUSTOM_EDITOR_TAG_ATTR} from 'core/editor3/components/customStyleMap';
import {logger} from 'core/services/logger';

/**
 * Converts HTML to an editor-tiptap ProseMirror document (as JSON). This is
 * the equivalent of editor3's `getContentStateFromHtml` (`html/from-html/`),
 * used for paste handling and HTML-based fields.
 *
 * Where editor3 had to smuggle information through Draft.js's convertFromHTML
 * (private-use-area text markers for custom tags), ProseMirror's schema-driven
 * DOMParser handles marks and blocks natively; only the atomic structures
 * (tables, embeds, media) still use editor3's placeholder technique: they are
 * extracted from the tree before parsing and their placeholders replaced with
 * the corresponding nodes afterwards.
 */

interface IPmJsonNode {
    type: string;
    attrs?: {[key: string]: any};
    content?: Array<IPmJsonNode>;
    marks?: Array<{type: string; attrs?: {[key: string]: any}}>;
    text?: string;
}

interface IPrunedContent {
    iframes: {[key: string]: string};
    scripts: {[key: string]: string};
    figures: {[key: string]: string};
    tables: {[key: string]: string};
    media: {[key: string]: {media: any}};
}

const MARKER_REGEX = /^BLOCK_(TABLE|MEDIA|FIGURE|IFRAME|SCRIPT)_(\d+)$/;

function emptyDoc(): IPmJsonNode {
    return {
        type: 'doc',
        attrs: {customData: {highlightsData: {}, lastHighlightIds: {}}},
        content: [{type: 'paragraph'}],
    };
}

export function htmlToPmDoc(
    html: string,
    associations: {[id: string]: any} = {},
    styleFingerprints?: Array<IStyleFingerprint>,
): IPmJsonNode {
    if (html.length < 1) {
        return emptyDoc();
    }

    const tree = document.createElement('div');

    tree.innerHTML = docsSoap.default(html); // needed for Google docs

    cleanUpDraftTables(tree);

    const pruned: IPrunedContent = {iframes: {}, scripts: {}, figures: {}, tables: {}, media: {}};

    tree.innerHTML = manageEmbeds(tree.innerHTML, associations, pruned);
    pruneNodes(tree, pruned);

    if (tree.innerHTML.trim() === '') {
        return emptyDoc();
    }

    normalizeCssTagSpans(tree, styleFingerprints ?? getStyleFingerprints());

    const content = parseTree(tree)
        .map((node) => resolveMarker(node, pruned))
        .filter((node) => node != null);

    return {
        type: 'doc',
        attrs: {customData: {highlightsData: {}, lastHighlightIds: {}}},
        content: content.length > 0 ? content : [{type: 'paragraph'}],
    };
}

/**
 * Parses a prepared DOM tree into block nodes, replicating Draft.js's
 * convertFromHTML text handling: &nbsp; and carriage returns are normalized,
 * "loose" inline runs (content outside any block element, e.g. trailing
 * `<br>`s in a Google Docs wrapper) are trimmed at the edges the way Draft
 * trimmed its accumulated loose text, whitespace inside blocks is preserved
 * (Draft's Sourcefabric fork does not trim pasted spaces), and empty
 * paragraphs are dropped.
 */
function parseTree(tree: HTMLElement): Array<IPmJsonNode> {
    normalizeTextNodes(tree);
    trimLooseRuns(tree);

    const parsed = PmDOMParser.fromSchema(editorTiptapSchema)
        .parse(tree, {preserveWhitespace: true})
        .toJSON();

    return (parsed.content ?? []).filter(
        (node) => !(node.type === 'paragraph' && (node.content ?? []).length === 0),
    );
}

function normalizeTextNodes(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node != null) {
        node.nodeValue = node.nodeValue.replace(/\r/g, '').replace(/\u00A0/g, ' ');
        node = walker.nextNode();
    }
}

// elements that Draft.js's convertFromHTML treated as block configs: their
// text content belongs to a block and is kept verbatim
const DRAFT_TEXT_BLOCK_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'FIGURE', 'TD', 'TH',
]);
// containers whose child lists are walked for loose runs but whose own
// tag does not make content non-loose
const CONTAINER_TAGS = new Set(['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']);

function isElement(node: Node): node is HTMLElement {
    return node.nodeType === Node.ELEMENT_NODE;
}

function containsBlockElement(el: HTMLElement): boolean {
    return el.querySelector(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, figure, td, th, ul, ol, table',
    ) != null;
}

/**
 * Trims the edges of "loose" inline runs — maximal sequences of inline
 * content between block elements, outside any block element. Draft.js
 * accumulated such content into an implicit block and trimmed it, so a
 * lone `<br>` between paragraphs disappears, while `a<br>b` keeps its
 * line break.
 */
function trimLooseRuns(container: HTMLElement): void {
    const runs: Array<Array<Node>> = [];
    let currentRun: Array<Node> = [];

    for (const child of Array.from(container.childNodes)) {
        const isBoundary = isElement(child) && (
            DRAFT_TEXT_BLOCK_TAGS.has(child.tagName)
            || CONTAINER_TAGS.has(child.tagName)
            || containsBlockElement(child)
        );

        if (isBoundary) {
            runs.push(currentRun);
            currentRun = [];

            if (isElement(child) && !DRAFT_TEXT_BLOCK_TAGS.has(child.tagName)) {
                // container or inline wrapper holding block elements
                // (e.g. Google Docs' <b> around the whole payload)
                trimLooseRuns(child);
            }
        } else {
            currentRun.push(child);
        }
    }

    runs.push(currentRun);

    for (const run of runs) {
        trimRunEdges(run);
    }
}

/**
 * Removes leading/trailing whitespace and line breaks from a run of inline
 * nodes, mirroring Draft.js's trim of its accumulated block text.
 */
function trimRunEdges(run: Array<Node>): void {
    const inlineAtoms: Array<Node> = [];

    const collect = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE || (isElement(node) && node.tagName === 'BR')) {
            inlineAtoms.push(node);
        } else if (isElement(node)) {
            Array.from(node.childNodes).forEach(collect);
        }
    };

    run.forEach(collect);

    const trimSide = (atoms: Array<Node>, fromEnd: boolean) => {
        for (const atom of fromEnd ? atoms.slice().reverse() : atoms) {
            if (isElement(atom)) { // <br>
                atom.remove();
                continue;
            }

            const trimmed = fromEnd
                ? atom.nodeValue.replace(/\s+$/, '')
                : atom.nodeValue.replace(/^\s+/, '');

            if (trimmed === '') {
                atom.parentNode?.removeChild(atom);
                continue;
            }

            atom.nodeValue = trimmed;
            break;
        }
    };

    trimSide(inlineAtoms, false);
    trimSide(inlineAtoms.filter((atom) => atom.parentNode != null), true);
}

/**
 * When copy & pasting between windows without an editor instance around we
 * get internal Draft.js table markup with editors inside cells; replace the
 * inner editor markup with the contents of the text span inside.
 * (port of editor3's `cleanUpDraftTables`)
 */
function cleanUpDraftTables(tree: HTMLElement): void {
    tree.querySelectorAll('.table-inside > table').forEach((table) => {
        table.querySelectorAll('th, td').forEach((cell) => {
            const textSpan = cell.querySelector('span[data-text="true"]');

            if (textSpan != null) {
                cell.innerHTML = textSpan.innerHTML;
            }
        });

        const figure = table.closest('figure');

        if (figure != null) {
            figure.replaceWith(table);
        }
    });
}

/**
 * Handles `<!-- EMBED START/END -->` sections produced by editor3's own
 * serializer: with a resolvable association they become media blocks,
 * otherwise external embeds. (port of editor3's `manageEmbeds`)
 */
function manageEmbeds(initialHtml: string, associations: {[id: string]: any}, pruned: IPrunedContent): string {
    let html = initialHtml;
    const embedCount = html.match(/<!-- EMBED START.*-->/g)?.length ?? 0;

    for (let i = 0; i < embedCount; i++) {
        const startTag = html.match(/<!-- EMBED START.*-->/);
        const endTag = html.match(/<!-- EMBED END.*-->/);

        if (startTag == null || endTag == null) {
            continue;
        }

        const matchedEmbedText = html.slice(startTag.index, endTag.index + endTag[0].length);
        const associationId = html.match(/<!-- EMBED START (?:Image|Video) {id: "([a-z0-9]*?)"} -->/)?.[1];

        if (associationId != null) {
            if (associations[associationId] == null) {
                // an ID that is not found in associations is left in place;
                // pruneNodes will import the media as an external embed
                continue;
            }

            const nextIndex = Object.keys(pruned.media).length;

            html = html.replace(matchedEmbedText, `<figure>BLOCK_MEDIA_${nextIndex}</figure>`);

            pruned.media[nextIndex] = {media: associations[associationId]};
        } else {
            const nextIndex = Object.keys(pruned.figures).length;

            html = html.replace(matchedEmbedText, `<figure>BLOCK_FIGURE_${nextIndex}</figure>`);

            const wrapper = document.createElement('div');

            wrapper.innerHTML = matchedEmbedText.replace(startTag[0], '').replace(endTag[0], '');

            const el = wrapper.firstElementChild;

            pruned.figures[nextIndex] = el != null && el.tagName === 'FIGURE' && wrapper.childElementCount === 1
                ? el.innerHTML // drop <figure> wrapper
                : wrapper.innerHTML;
        }
    }

    return html;
}

function replaceWithMarker(node: Element, kind: string, index: number): void {
    const figure = document.createElement('figure');

    figure.textContent = `BLOCK_${kind}_${index}`;
    node.replaceWith(figure);
}

/**
 * Extracts atomic structures (tables, iframes, scripts, figures, media) from
 * the tree, replacing them with marker figures that are resolved to the
 * corresponding nodes after parsing. (port of editor3's `pruneNodes`)
 */
function pruneNodes(tree: HTMLElement, pruned: IPrunedContent): void {
    tree.querySelectorAll('iframe').forEach((node) => {
        const nextIndex = Object.keys(pruned.iframes).length;

        pruned.iframes[nextIndex] = node.outerHTML;
        replaceWithMarker(node, 'IFRAME', nextIndex);
    });

    tree.querySelectorAll('script').forEach((node) => {
        const nextIndex = Object.keys(pruned.scripts).length;

        pruned.scripts[nextIndex] = node.outerHTML;
        replaceWithMarker(node, 'SCRIPT', nextIndex);
    });

    tree.querySelectorAll('figure').forEach((node) => {
        if ((node.textContent ?? '').startsWith('BLOCK_')) {
            return; // already handled
        }

        // assume embed
        const nextIndex = Object.keys(pruned.figures).length;

        pruned.figures[nextIndex] = node.innerHTML;
        replaceWithMarker(node, 'FIGURE', nextIndex);
    });

    tree.querySelectorAll('table').forEach((node) => {
        const nextIndex = Object.keys(pruned.tables).length;

        pruned.tables[nextIndex] = node.innerHTML;
        replaceWithMarker(node, 'TABLE', nextIndex);
    });

    // editor3 imported `.media-block` markup (internal editor paste) as a
    // MEDIA entity holding the raw HTML string, which its serializer could
    // not render; it is imported as an external embed instead.
    tree.querySelectorAll('.media-block').forEach((node) => {
        const nextIndex = Object.keys(pruned.figures).length;

        pruned.figures[nextIndex] = node.outerHTML;
        replaceWithMarker(node, 'FIGURE', nextIndex);
    });

    // import external media as embeds
    tree.querySelectorAll('img, audio, video').forEach((node) => {
        const nextIndex = Object.keys(pruned.figures).length;

        pruned.figures[nextIndex] = node.outerHTML;
        replaceWithMarker(node, 'FIGURE', nextIndex);
    });
}

/**
 * Finds spans styled with custom editor tag CSS (from browser clipboard) and
 * normalises them to the custom-editor-tag-id attribute format, which the
 * schema's customTag mark parses natively.
 * (port of editor3's `normalizeCssTagSpans`)
 */
function normalizeCssTagSpans(tree: HTMLElement, styleFingerprints: Array<IStyleFingerprint>): void {
    if (styleFingerprints.length === 0) {
        return;
    }

    tree.querySelectorAll('span[style]').forEach((node) => {
        const el = node as HTMLElement;

        for (const {styleName, properties} of styleFingerprints) {
            const allMatch = properties.every(({property, acceptedValues}) => {
                const actual = el.style[property]?.toLowerCase().trim();

                return actual && acceptedValues.has(actual);
            });

            if (allMatch) {
                el.setAttribute(CUSTOM_EDITOR_TAG_ATTR, styleName);
                el.removeAttribute('style');
                break;
            }
        }
    });
}

/**
 * Replaces marker paragraphs (`BLOCK_TABLE_0` etc.) produced by parsing the
 * pruned tree with the actual atomic nodes.
 */
function resolveMarker(node: IPmJsonNode, pruned: IPrunedContent): IPmJsonNode | null {
    if (node.type !== 'paragraph' || node.content?.length !== 1) {
        return node;
    }

    const child = node.content[0];

    if (child.type !== 'text' || child.text == null) {
        return node;
    }

    const match = child.text.match(MARKER_REGEX);

    if (match == null) {
        return node;
    }

    const kind = match[1];
    const id = match[2];

    switch (kind) {
        case 'TABLE':
            return buildTableNode(pruned.tables[id]);
        case 'MEDIA':
            return {type: 'media', attrs: {media: pruned.media[id].media, rawKey: null}};
        case 'FIGURE':
            return buildEmbedFromFigure(pruned.figures[id]);
        case 'IFRAME':
            return buildEmbedFromHtml(pruned.iframes[id]);
        case 'SCRIPT':
            return buildEmbedFromHtml(pruned.scripts[id]);
        default:
            logger.warn(`editor-tiptap: unknown import marker ${child.text}`);
            return null;
    }
}

/**
 * Parses an HTML fragment into an array of block nodes (used for table cell
 * content, which is a nested document).
 */
function parseRichTextBlocks(html: string): Array<IPmJsonNode> {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = html;

    const content = parseTree(wrapper);

    return content.length > 0 ? content : [{type: 'paragraph'}];
}

/**
 * Builds a table node from raw `<table>` inner HTML. Mirrors editor3's
 * `createTableBlock`: the column count is taken from the first row, ragged
 * rows are padded/truncated to it, and header information is not preserved
 * (editor3 imported `<th>` cells as regular cells).
 */
function buildTableNode(tableInnerHtml: string): IPmJsonNode | null {
    const tableEl = document.createElement('table');

    tableEl.innerHTML = tableInnerHtml;

    const rows = Array.from(tableEl.querySelectorAll('tr'));

    if (rows.length === 0) {
        return null;
    }

    const numCols = rows[0].querySelectorAll('th, td').length;

    if (numCols === 0) {
        return null;
    }

    const rowNodes: Array<IPmJsonNode> = rows.map((row) => {
        const cells = row.querySelectorAll('th, td');
        const cellNodes: Array<IPmJsonNode> = [];

        for (let j = 0; j < numCols; j++) {
            cellNodes.push({
                type: 'tableCell',
                content: cells[j] != null ? parseRichTextBlocks(cells[j].innerHTML) : [{type: 'paragraph'}],
            });
        }

        return {type: 'tableRow', content: cellNodes};
    });

    return {type: 'table', attrs: {withHeader: false}, content: rowNodes};
}

/**
 * Builds an embed node from figure content, extracting `<figcaption>` as the
 * description. (port of editor3's `createFigureBlock`)
 */
function buildEmbedFromFigure(figureHtml: string): IPmJsonNode {
    const el = document.createElement('div');

    el.innerHTML = figureHtml;

    const descriptionElement = el.querySelector('figcaption');
    const descriptionText = descriptionElement != null ? descriptionElement.innerText : '';

    if (descriptionElement != null) {
        descriptionElement.remove();
    }

    return {
        type: 'embed',
        attrs: {data: {html: el.innerHTML}, description: descriptionText, rawKey: null},
    };
}

function buildEmbedFromHtml(html: string): IPmJsonNode {
    const el = document.createElement('div');

    el.innerHTML = html;

    return {type: 'embed', attrs: {data: {html: el.innerHTML}, description: null, rawKey: null}};
}
