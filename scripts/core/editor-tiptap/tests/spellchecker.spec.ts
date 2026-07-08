import {Editor} from '@tiptap/core';
import {Node as PmNode} from '@tiptap/pm/model';
import {ISpellchecker} from 'core/editor3/components/spellchecker/interfaces';
import {getEditorTiptapExtensions} from '../extensions';
import {editingBehavior} from '../editing';
import {editorTiptapSchema} from '../schema';
import {convertDraftToPmDoc} from '../from-draftjs';
import {pmDocToPlainText, getPlainTextSegments} from '../output';
import {
    createSpellcheckerExtension,
    warningsToDecorations,
    refreshSpellcheck,
    spellcheckerPluginKey,
} from '../spellchecker';

const fixtureBlock = (key: string, text: string, type: string) =>
    ({key, text, type, depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}});

const richFixture: any = {
    blocks: [
        fixtureBlock('b1', 'first paragraf here', 'unstyled'),
        fixtureBlock('l1', 'a list itm', 'unordered-list-item'),
        fixtureBlock('b2', 'line\nbreak wrd', 'unstyled'),
    ],
    entityMap: {},
};

describe('editor-tiptap spellchecker', () => {
    it('maps plain text segments consistently with pmDocToPlainText', () => {
        const doc = PmNode.fromJSON(editorTiptapSchema, convertDraftToPmDoc(richFixture));
        const plainText = pmDocToPlainText(doc);

        for (const segment of getPlainTextSegments(doc)) {
            const fromPlainText = plainText.slice(segment.start, segment.start + segment.length);
            const fromDoc = doc.textBetween(segment.pmStart, segment.pmStart + segment.length, '', () => '\n');

            expect(fromPlainText).toBe(fromDoc);
        }
    });

    it('maps warnings with plain-text offsets to document decorations', () => {
        const doc = PmNode.fromJSON(editorTiptapSchema, convertDraftToPmDoc(richFixture));
        const plainText = pmDocToPlainText(doc);
        const words = ['paragraf', 'itm', 'wrd'];

        const warnings = words.map((word) => ({
            startOffset: plainText.indexOf(word),
            text: word,
            type: 'spelling' as const,
            suggestions: [],
        }));

        const decorations = warningsToDecorations(doc, warnings).find();

        expect(decorations.length).toBe(3);

        decorations.forEach((decoration, index) => {
            expect(doc.textBetween(decoration.from, decoration.to)).toBe(words[index]);
        });
    });

    it('checks the document and applies decorations', (done) => {
        const fakeSpellchecker: ISpellchecker = {
            check: (text) => {
                const index = text.indexOf('mispeled');

                return Promise.resolve(index < 0 ? [] : [{
                    startOffset: index,
                    text: 'mispeled',
                    type: 'spelling' as const,
                    suggestions: [{text: 'misspelled'}],
                }]);
            },
            actions: {},
        };

        const editor = new Editor({
            extensions: [
                ...getEditorTiptapExtensions(),
                editingBehavior,
                createSpellcheckerExtension({language: 'en', spellchecker: fakeSpellchecker}),
            ],
            content: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'a mispeled word'}]}]},
        });

        refreshSpellcheck(editor); // skip the debounce

        setTimeout(() => {
            const decorations = spellcheckerPluginKey.getState(editor.state).decorations.find();

            expect(decorations.length).toBe(1);
            expect(editor.state.doc.textBetween(decorations[0].from, decorations[0].to)).toBe('mispeled');

            editor.destroy();
            done();
        });
    });
});
