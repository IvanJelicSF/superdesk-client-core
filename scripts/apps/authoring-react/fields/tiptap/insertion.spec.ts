import {Editor} from '@tiptap/core';
import {getEditorTiptapExtensions} from 'core/editor-tiptap/extensions';
import {editingBehavior} from 'core/editor-tiptap/editing';
import {pmDocToHtml} from 'core/editor-tiptap';
import {insertMediaNode, insertEmbedNode} from './insertion';

describe('editor-tiptap media insertion', () => {
    let editor: Editor;

    beforeEach(() => {
        editor = new Editor({
            extensions: [...getEditorTiptapExtensions(), editingBehavior],
        });
    });

    afterEach(() => {
        editor.destroy();
    });

    it('inserts a media node that serializes like an editor3 media block', () => {
        const media = {
            type: 'picture',
            alt_text: 'the alt',
            description_text: 'the caption',
            renditions: {original: {href: 'https://example.com/img.jpg'}},
        };

        insertMediaNode(editor, media);

        // newly inserted media has no Draft.js entity key;
        // the serializer assigns entity ordinals like convertToRaw did
        expect(pmDocToHtml(editor.getJSON())).toBe(
            '<!-- EMBED START Image {id: "editor_0"} -->\n'
            + '<figure>\n'
            + '    <img src="https://example.com/img.jpg" alt="the alt" />\n'
            + '    <figcaption>the caption</figcaption>\n'
            + '</figure>\n'
            + '<!-- EMBED END Image {id: "editor_0"} -->',
        );
    });

    it('inserts an embed node from raw html', () => {
        insertEmbedNode(editor, {html: '<iframe src="https://example.com/e"></iframe>'});

        expect(pmDocToHtml(editor.getJSON())).toBe(
            '<div class="embed-block"><iframe src="https://example.com/e"></iframe></div>',
        );
    });

    it('inserts media at an explicit position', () => {
        editor.commands.insertContent('before after');

        const media = {type: 'picture', renditions: {original: {href: 'https://example.com/x.jpg'}}};

        insertMediaNode(editor, media, 7); // between the words

        const html = pmDocToHtml(editor.getJSON());

        expect(html).toContain('<p>before</p>');
        expect(html).toContain('EMBED START Image');
        // the leading space becomes &nbsp; (whitespace preservation parity)
        expect(html).toContain('<p>&nbsp;after</p>');
    });
});
