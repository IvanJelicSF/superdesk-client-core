export {editorTiptapSchema, HIGHLIGHT_KEYS, getHighlightKeyFromStyleName} from './schema';
export type {IEditorTiptapCustomData} from './schema';
export {convertDraftToPmDoc} from './from-draftjs';
export {htmlToPmDoc} from './from-html';
export {pmDocToHtml} from './to-html';
export type {IPmToHtmlOptions} from './to-html';
export {
    pmDocToPlainText,
    getAnnotationsForStorage,
    getEmbeddedArticles,
    plainTextToPmDoc,
} from './output';
export {
    addHighlight,
    updateHighlightData,
    removeHighlight,
    resolveComment,
    getHighlightData,
    getHighlightedText,
    getHighlightsAt,
    getCustomData,
    getPublicApiComments,
} from './highlights';
