import type {
    RawDraftContentState,
    RawDraftContentBlock,
    RawDraftEntity,
} from 'draft-js';
import {getHighlightKeyFromStyleName, IEditorTiptapCustomData} from './schema';
import {logger} from 'core/services/logger';

/**
 * Converts editor3's persisted format (`fields_meta[field].draftjsState`) to a
 * ProseMirror document (as JSON, validatable against `editorTiptapSchema`).
 * This is the lazy-migration entry point: it runs when an article authored in
 * editor3 is opened in the Tiptap editor.
 */

interface IPmJsonNode {
    type: string;
    attrs?: {[key: string]: any};
    content?: Array<IPmJsonNode>;
    marks?: Array<{type: string; attrs?: {[key: string]: any}}>;
    text?: string;
}

type IPmMarkJson = {type: string; attrs?: {[key: string]: any}};

const STYLE_TO_MARK: {[draftStyle: string]: string} = {
    BOLD: 'bold',
    ITALIC: 'italic',
    UNDERLINE: 'underline',
    STRIKETHROUGH: 'strike',
    SUBSCRIPT: 'subscript',
    SUPERSCRIPT: 'superscript',
    CODE: 'code',
};

const HEADER_LEVELS: {[blockType: string]: number} = {
    'header-one': 1,
    'header-two': 2,
    'header-three': 3,
    'header-four': 4,
    'header-five': 5,
    'header-six': 6,
};

function isListItemBlock(block: RawDraftContentBlock): boolean {
    return block.type === 'unordered-list-item' || block.type === 'ordered-list-item';
}

/**
 * Mirrors the LINK handling of `entityStyleFn` in `editor3StateToHtml`.
 */
function linkMarkAttrs(data: any): {href: string | null; target: string | null; attachment: string | null} | null {
    if (data == null) {
        return null;
    }

    if (data.url) {
        return {href: data.url, target: null, attachment: null};
    }

    const link = data.link;

    if (link == null) {
        return null;
    }

    if (link.attachment != null) {
        return {href: null, target: null, attachment: link.attachment};
    }

    if (link.target != null) {
        return {href: link.href ?? null, target: link.target, attachment: null};
    }

    return {href: link.href ?? null, target: null, attachment: null};
}

/**
 * Per code point style/entity info. Draft.js raw ranges are measured in
 * Unicode code points (surrogate pairs count as one), hence `Array.from`.
 */
function convertInline(block: RawDraftContentBlock, entityMap: {[key: string]: RawDraftEntity}): Array<IPmJsonNode> {
    const codePoints = Array.from(block.text);
    const styleNamesPerCp: Array<Array<string>> = codePoints.map(() => []);
    const entityKeyPerCp: Array<string | number | null> = codePoints.map(() => null);

    for (const range of block.inlineStyleRanges ?? []) {
        for (let i = range.offset; i < range.offset + range.length && i < codePoints.length; i++) {
            if (!styleNamesPerCp[i].includes(range.style)) {
                styleNamesPerCp[i].push(range.style);
            }
        }
    }

    for (const range of block.entityRanges ?? []) {
        for (let i = range.offset; i < range.offset + range.length && i < codePoints.length; i++) {
            entityKeyPerCp[i] = range.key;
        }
    }

    const result: Array<IPmJsonNode> = [];
    let runStart = 0;

    const sameRun = (a: number, b: number) =>
        entityKeyPerCp[a] === entityKeyPerCp[b]
        && styleNamesPerCp[a].length === styleNamesPerCp[b].length
        && styleNamesPerCp[a].every((style, idx) => styleNamesPerCp[b][idx] === style);

    const flushRun = (start: number, end: number) => {
        const text = codePoints.slice(start, end).join('');
        const marks = buildMarks(styleNamesPerCp[start], entityKeyPerCp[start], entityMap);

        // Draft.js keeps newlines inside block text; in ProseMirror they
        // become hardBreak nodes carrying the same marks.
        for (const part of splitKeepingNewlines(text)) {
            if (part === '\n') {
                result.push(marks.length > 0 ? {type: 'hardBreak', marks} : {type: 'hardBreak'});
            } else if (part.length > 0) {
                result.push(marks.length > 0 ? {type: 'text', text: part, marks} : {type: 'text', text: part});
            }
        }
    };

    for (let i = 1; i <= codePoints.length; i++) {
        if (i === codePoints.length || !sameRun(runStart, i)) {
            flushRun(runStart, i);
            runStart = i;
        }
    }

    return result;
}

function splitKeepingNewlines(text: string): Array<string> {
    const parts: Array<string> = [];
    let current = '';

    for (const char of text) {
        if (char === '\n') {
            if (current.length > 0) {
                parts.push(current);
                current = '';
            }
            parts.push('\n');
        } else {
            current += char;
        }
    }

    if (current.length > 0) {
        parts.push(current);
    }

    return parts;
}

/**
 * Marks are emitted in schema declaration order so that documents built
 * from this JSON pass `Node.check()`.
 */
function buildMarks(
    styleNames: Array<string>,
    entityKey: string | number | null,
    entityMap: {[key: string]: RawDraftEntity},
): Array<IPmMarkJson> {
    const marks: Array<IPmMarkJson> = [];

    if (entityKey != null) {
        const entity = entityMap[entityKey];

        if (entity != null && entity.type === 'LINK') {
            const attrs = linkMarkAttrs(entity.data);

            if (attrs != null) {
                marks.push({type: 'link', attrs});
            }
        }
    }

    for (const style of styleNames) {
        if (STYLE_TO_MARK[style] != null) {
            marks.push({type: STYLE_TO_MARK[style]});
        }
    }

    for (const style of styleNames) {
        if (STYLE_TO_MARK[style] == null) {
            const highlightKey = getHighlightKeyFromStyleName(style);

            if (highlightKey != null) {
                marks.push({type: 'highlight', attrs: {styleName: style, highlightKey}});
            }
        }
    }

    for (const style of styleNames) {
        if (STYLE_TO_MARK[style] == null && getHighlightKeyFromStyleName(style) == null) {
            marks.push({type: 'customTag', attrs: {tagId: style}});
        }
    }

    return marks;
}

function emptyParagraph(): IPmJsonNode {
    return {type: 'paragraph'};
}

function textBlockToNode(block: RawDraftContentBlock, entityMap: {[key: string]: RawDraftEntity}): IPmJsonNode {
    const content = convertInline(block, entityMap);
    const withContent = (node: IPmJsonNode) => (content.length > 0 ? {...node, content} : node);

    if (HEADER_LEVELS[block.type] != null) {
        return withContent({type: 'heading', attrs: {level: HEADER_LEVELS[block.type]}});
    }

    switch (block.type) {
        case 'blockquote':
            return withContent({type: 'blockquote'});
        case 'code-block':
            return withContent({type: 'codeBlock'});
        default:
            return withContent({type: 'paragraph'});
    }
}

/**
 * Equivalent of `getData` in `core/editor3/helpers/table.tsx`: table-like
 * entities keep their up-to-date payload as a JSON string in the atomic
 * block's data, falling back to the entity data.
 */
function getTableLikeData(block: RawDraftContentBlock, entity: RawDraftEntity): any {
    const blockData: any = (block.data as any)?.data;

    if (!blockData && (entity.data as any)?.data != null) {
        return (entity.data as any).data;
    }

    if (typeof blockData === 'string') {
        return JSON.parse(blockData);
    }

    return blockData;
}

function convertCellContent(
    cellRaw: RawDraftContentState | null | undefined,
    customData: IEditorTiptapCustomData,
): Array<IPmJsonNode> {
    if (cellRaw == null) {
        return [emptyParagraph()];
    }

    mergeCustomData(customData, cellRaw, {mainScope: false});

    const nodes = convertBlocks(cellRaw.blocks ?? [], cellRaw.entityMap ?? {}, customData);

    return nodes.length > 0 ? nodes : [emptyParagraph()];
}

function convertAtomicBlock(
    block: RawDraftContentBlock,
    entityMap: {[key: string]: RawDraftEntity},
    customData: IEditorTiptapCustomData,
): IPmJsonNode | null {
    const entityKey = block.entityRanges?.[0]?.key;

    if (entityKey == null) {
        return null;
    }

    const entity = entityMap[entityKey];

    if (entity == null) {
        return null;
    }

    const data: any = entity.data;
    const rawKey = String(entityKey);

    switch (entity.type) {
        case 'MEDIA':
            return {type: 'media', attrs: {media: data.media, rawKey}};

        case 'EMBED':
            return {
                type: 'embed',
                attrs: {data: data.data, description: data.description ?? null, rawKey},
            };

        case 'TABLE': {
            const tableData = getTableLikeData(block, entity);

            if (tableData == null) {
                return null;
            }

            const {numRows = 0, numCols = 0, withHeader = false} = tableData;
            const cells: Array<Array<RawDraftContentState>> = tableData.cells ?? [];
            const rows: Array<IPmJsonNode> = [];

            for (let i = 0; i < numRows; i++) {
                const cellType = withHeader && i === 0 ? 'tableHeader' : 'tableCell';
                const rowCells: Array<IPmJsonNode> = [];

                for (let j = 0; j < numCols; j++) {
                    rowCells.push({
                        type: cellType,
                        content: convertCellContent(cells[i]?.[j], customData),
                    });
                }

                rows.push({type: 'tableRow', content: rowCells});
            }

            if (rows.length === 0) {
                return null;
            }

            return {type: 'table', attrs: {withHeader: withHeader === true}, content: rows};
        }

        case 'MULTI-LINE_QUOTE': {
            const quoteData = getTableLikeData(block, entity);

            return {
                type: 'multiLineQuote',
                content: convertCellContent(quoteData?.cells?.[0]?.[0], customData),
            };
        }

        case 'CUSTOM_BLOCK': {
            const blockData = getTableLikeData(block, entity);

            return {
                type: 'customBlock',
                attrs: {vocabularyId: blockData?.vocabularyId ?? null},
                content: convertCellContent(blockData?.cells?.[0]?.[0], customData),
            };
        }

        case 'ARTICLE_EMBED':
            return {type: 'articleEmbed', attrs: {item: data.item}};

        default:
            logger.warn(`editor-tiptap: cannot convert entity type ${entity.type}`);
            return null;
    }
}

/**
 * Replicates the nesting rule of editor3's HTML export: a run of consecutive
 * list blocks nests one level deeper when the next block's depth is exactly
 * one above the current (Draft.js normalizes depths so bigger jumps don't
 * occur in persisted content). Sibling items of a different list type start
 * a new list at the same level.
 */
function buildLists(
    items: Array<RawDraftContentBlock>,
    entityMap: {[key: string]: RawDraftEntity},
): Array<IPmJsonNode> {
    const lists: Array<IPmJsonNode> = [];
    let currentList: IPmJsonNode | null = null;
    let i = 0;

    while (i < items.length) {
        const block = items[i];
        const paragraphContent = convertInline(block, entityMap);
        const listItemContent: Array<IPmJsonNode> = [
            paragraphContent.length > 0
                ? {type: 'paragraph', content: paragraphContent}
                : emptyParagraph(),
        ];

        let j = i + 1;

        if (j < items.length && items[j].depth === block.depth + 1) {
            const childDepth = items[j].depth;
            const childStart = j;

            while (j < items.length && items[j].depth >= childDepth) {
                j++;
            }

            listItemContent.push(...buildLists(items.slice(childStart, j), entityMap));
        }

        const listType = block.type === 'ordered-list-item' ? 'orderedList' : 'bulletList';

        if (currentList == null || currentList.type !== listType) {
            currentList = {type: listType, content: []};
            lists.push(currentList);
        }

        (currentList.content as Array<IPmJsonNode>).push({type: 'listItem', content: listItemContent});
        i = j;
    }

    return lists;
}

function convertBlocks(
    blocks: Array<RawDraftContentBlock>,
    entityMap: {[key: string]: RawDraftEntity},
    customData: IEditorTiptapCustomData,
): Array<IPmJsonNode> {
    const nodes: Array<IPmJsonNode> = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i];

        if (isListItemBlock(block)) {
            let j = i;

            while (j < blocks.length && isListItemBlock(blocks[j])) {
                j++;
            }

            nodes.push(...buildLists(blocks.slice(i, j), entityMap));
            i = j;
        } else if (block.type === 'atomic') {
            const node = convertAtomicBlock(block, entityMap, customData);

            if (node != null) {
                nodes.push(node);
            }

            i++;
        } else {
            nodes.push(textBlockToNode(block, entityMap));
            i++;
        }
    }

    return nodes;
}

/**
 * Editor3 stores highlight payloads and other custom data on the first
 * block (`editor3CustomData.ts`); in the ProseMirror doc it becomes a doc
 * attribute. Table/quote cell content states may carry their own highlight
 * data; those entries are merged in, skipping style names already taken by
 * the main scope (annotation output ids are positional, so a skipped rename
 * does not affect HTML output).
 */
function mergeCustomData(
    customData: IEditorTiptapCustomData,
    raw: RawDraftContentState,
    options: {mainScope: boolean},
): void {
    const firstBlockData: any = raw.blocks?.[0]?.data ?? {};
    const multipleHighlights = firstBlockData.MULTIPLE_HIGHLIGHTS ?? {};
    const highlightsData = multipleHighlights.highlightsData ?? {};

    for (const styleName of Object.keys(highlightsData)) {
        if (customData.highlightsData[styleName] == null) {
            customData.highlightsData[styleName] = highlightsData[styleName];
        } else if (!options.mainScope) {
            logger.warn(`editor-tiptap: dropping colliding highlight data for ${styleName} in nested content`);
        }
    }

    if (options.mainScope) {
        customData.lastHighlightIds = multipleHighlights.lastHighlightIds ?? {};

        if (firstBlockData.RESOLVED_COMMENTS_HISTORY != null) {
            customData.resolvedCommentsHistory = firstBlockData.RESOLVED_COMMENTS_HISTORY;
        }

        if (firstBlockData.RESOLVED_SUGGESTIONS_HISTORY != null) {
            customData.resolvedSuggestionsHistory = firstBlockData.RESOLVED_SUGGESTIONS_HISTORY;
        }

        if (firstBlockData.__PUBLIC_API__comments != null) {
            customData.__PUBLIC_API__comments = firstBlockData.__PUBLIC_API__comments;
        }
    }
}

export function convertDraftToPmDoc(raw: RawDraftContentState): IPmJsonNode {
    const customData: IEditorTiptapCustomData = {highlightsData: {}, lastHighlightIds: {}};

    mergeCustomData(customData, raw, {mainScope: true});

    const content = convertBlocks(raw.blocks ?? [], raw.entityMap ?? {}, customData);

    return {
        type: 'doc',
        attrs: {customData},
        content: content.length > 0 ? content : [emptyParagraph()],
    };
}
