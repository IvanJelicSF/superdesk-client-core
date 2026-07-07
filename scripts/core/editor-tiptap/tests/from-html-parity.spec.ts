/* eslint-disable max-len */
import snapshotHtml from 'core/editor3/html/tests/from-html-spec.snapshot.html';
import {getContentStateFromHtml, IStyleFingerprint} from 'core/editor3/html/from-html';
import {editor3StateToHtml} from 'core/editor3/html/to-html/editor3StateToHtml';
import {htmlToPmDoc} from '../from-html';
import {pmDocToHtml} from '../to-html';

/**
 * Golden tests for the HTML importer (paste path / HTML fields), the
 * replacement for editor3's `getContentStateFromHtml`. Structural cases
 * mirror `core/editor3/html/tests/from-html.spec.ts`; in addition, both
 * import pipelines are round-tripped back to HTML and must produce
 * byte-identical output, since `body_html` is the format that must not
 * drift during the migration.
 */

function expectRoundTripParity(
    html: string,
    associations: {[id: string]: any} = {},
    fingerprints?: Array<IStyleFingerprint>,
): void {
    const editor3Html = editor3StateToHtml(getContentStateFromHtml(html, associations, fingerprints));
    const tiptapHtml = pmDocToHtml(htmlToPmDoc(html, associations, fingerprints));

    expect(tiptapHtml).toBe(editor3Html);
}

describe('editor-tiptap from-html', () => {
    it('should parse simple HTML', () => {
        const doc = htmlToPmDoc('<div>some text</div><h2>some header</h2><p>some paragraph</p>');

        expect(doc.content.map(({type}) => type)).toEqual(['paragraph', 'heading', 'paragraph']);
        expect(doc.content[0].content[0].text).toBe('some text');
        expect(doc.content[1].attrs.level).toBe(2);
        expect(doc.content[1].content[0].text).toBe('some header');
        expect(doc.content[2].content[0].text).toBe('some paragraph');

        expectRoundTripParity('<div>some text</div><h2>some header</h2><p>some paragraph</p>');
    });

    it('should parse HTML with tables', () => {
        const html = `
            <h2>some header</h2>
            <p>some paragraph</p>
            <table>
                <tbody>
                    <tr><td>1</td><td>2</td><td>3</td></tr>
                    <tr><td>4</td><td>5</td><td>6</td></tr>
                    <tr><td>7</td><td>8</td><td>9</td></tr>
                    <tr><td>10</td><td>11</td><td>12</td></tr>
                </tbody>
            </table>
        `;
        const doc = htmlToPmDoc(html);
        const table = doc.content.find(({type}) => type === 'table');

        expect(table).toBeDefined();
        expect(table.attrs.withHeader).toBe(false);
        expect(table.content.length).toBe(4);
        expect(table.content[0].content.length).toBe(3);

        const cellText = (i: number, j: number) => table.content[i].content[j].content[0].content[0].text;

        expect(cellText(0, 0)).toBe('1');
        expect(cellText(1, 1)).toBe('5');
        expect(cellText(3, 2)).toBe('12');

        expectRoundTripParity(html);
    });

    it('should not preserve table headers (mirroring editor3 import)', () => {
        const html = '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>c</td><td>d</td></tr></tbody></table>';

        expectRoundTripParity(html);
    });

    it('should parse editor2 inline styles', () => {
        const doc = htmlToPmDoc('<sub>1</sub><sup>2</sup><strike>3</strike>');
        const inline = doc.content[0].content;

        expect(inline.length).toBe(3);
        expect(inline[0].marks.map(({type}) => type)).toEqual(['subscript']);
        expect(inline[1].marks.map(({type}) => type)).toEqual(['superscript']);
        expect(inline[2].marks.map(({type}) => type)).toEqual(['strike']);

        expectRoundTripParity('<sub>1</sub><sup>2</sup><strike>3</strike>');
    });

    it('should parse editor2 block styles', () => {
        const doc = htmlToPmDoc('<pre>text</pre>');

        expect(doc.content[0].type).toBe('codeBlock');

        expectRoundTripParity('<pre>text</pre>');
    });

    it('should create an empty doc if html contains only invisible characters', () => {
        const doc = htmlToPmDoc(`

            `);

        expect(doc.content).toEqual([{type: 'paragraph'}]);
    });

    it('should apply the customTag mark from custom-editor-tag-id attribute', () => {
        const doc = htmlToPmDoc('<p><span custom-editor-tag-id="MY_STYLE">tagged</span> text</p>');
        const inline = doc.content[0].content;

        expect(inline[0].text).toBe('tagged');
        expect(inline[0].marks).toEqual([{type: 'customTag', attrs: {tagId: 'MY_STYLE'}}]);
        expect(inline[1].text).toBe(' text');
        expect(inline[1].marks).toBeUndefined();
    });

    it('should recognize custom tag spans by CSS fingerprint', () => {
        const fingerprints: Array<IStyleFingerprint> = [
            {
                styleName: 'EDITOR_TAG_PEOPLE',
                properties: [
                    {property: 'borderBlockEnd', acceptedValues: new Set(['4px double blue'])},
                ],
            },
        ];
        const html = '<p><span style="border-block-end: 4px double blue">tagged</span> plain</p>';
        const doc = htmlToPmDoc(html, {}, fingerprints);
        const inline = doc.content[0].content;

        expect(inline[0].text).toBe('tagged');
        expect(inline[0].marks).toEqual([{type: 'customTag', attrs: {tagId: 'EDITOR_TAG_PEOPLE'}}]);
        expect(inline[1].text).toBe(' plain');
        expect(inline[1].marks).toBeUndefined();
    });

    it('should distinguish tags that share a CSS property but differ in another', () => {
        const fingerprints: Array<IStyleFingerprint> = [
            {
                styleName: 'EDITOR_TAG_company',
                properties: [
                    {property: 'display', acceptedValues: new Set(['inline-block'])},
                    {property: 'borderBlockEnd', acceptedValues: new Set(['4px double purple'])},
                ],
            },
            {
                styleName: 'EDITOR_TAG_person',
                properties: [
                    {property: 'display', acceptedValues: new Set(['inline-block'])},
                    {property: 'borderBlockEnd', acceptedValues: new Set(['4px double blue'])},
                ],
            },
        ];
        const html = '<p>'
            + '<span style="display: inline-block; border-block-end: 4px double purple">company</span> '
            + '<span style="display: inline-block; border-block-end: 4px double blue">person</span>'
            + '</p>';
        const doc = htmlToPmDoc(html, {}, fingerprints);
        const inline = doc.content[0].content;

        expect(inline[0].text).toBe('company');
        expect(inline[0].marks).toEqual([{type: 'customTag', attrs: {tagId: 'EDITOR_TAG_company'}}]);
        expect(inline[2].text).toBe('person');
        expect(inline[2].marks).toEqual([{type: 'customTag', attrs: {tagId: 'EDITOR_TAG_person'}}]);
    });

    it('should not match a span when only some fingerprint properties are present', () => {
        const fingerprints: Array<IStyleFingerprint> = [
            {
                styleName: 'EDITOR_TAG_company',
                properties: [
                    {property: 'display', acceptedValues: new Set(['inline-block'])},
                    {property: 'borderBlockEnd', acceptedValues: new Set(['4px double purple'])},
                ],
            },
        ];
        const doc = htmlToPmDoc('<p><span style="display: inline-block">not a tag</span> plain</p>', {}, fingerprints);
        const inline = doc.content[0].content;

        expect(inline.length).toBe(1);
        expect(inline[0].text).toBe('not a tag plain');
        expect(inline[0].marks).toBeUndefined();
    });

    it('should match a span that has extra CSS properties beyond the fingerprint', () => {
        const fingerprints: Array<IStyleFingerprint> = [
            {
                styleName: 'EDITOR_TAG_company',
                properties: [
                    {property: 'borderBlockEnd', acceptedValues: new Set(['4px double purple'])},
                ],
            },
        ];
        const html = '<p><span style="border-block-end: 4px double purple; color: red; font-size: 14px">tagged</span> plain</p>';
        const doc = htmlToPmDoc(html, {}, fingerprints);
        const inline = doc.content[0].content;

        expect(inline[0].text).toBe('tagged');
        expect(inline[0].marks).toEqual([{type: 'customTag', attrs: {tagId: 'EDITOR_TAG_company'}}]);
    });

    it('should parse Google Docs special paste', () => {
        const html = '<b style="font-weight:normal;" id="docs-internal-guid-63c0f3a6-072a-245e-c39d-3f61398cba2c"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;margin-left: 21.25984251968504pt;text-indent: 14.173228346456693pt;text-align: justify;"><span style="font-size:12pt;font-family:Roboto;color:#333333;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">bold</span></p><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;margin-left: 21.25984251968504pt;text-indent: 14.173228346456693pt;text-align: justify;"><span style="font-size:12pt;font-family:Roboto;color:#333333;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">italic</span></p><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;margin-left: 21.25984251968504pt;text-indent: 14.173228346456693pt;text-align: justify;"><span style="font-size:12pt;font-family:Roboto;color:#333333;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">underline</span></p><br></b>';
        const doc = htmlToPmDoc(html);

        expect(doc.content[0].content[0].text).toBe('bold');
        expect(doc.content[0].content[0].marks).toEqual([{type: 'bold'}]);
        expect(doc.content[1].content[0].text).toBe('italic');
        expect(doc.content[1].content[0].marks).toEqual([{type: 'italic'}]);
        expect(doc.content[2].content[0].text).toBe('underline');
        expect(doc.content[2].content[0].marks).toEqual([{type: 'underline'}]);

        expectRoundTripParity(html);
    });

    it('should add embeds as external in case association for ID is missing', () => {
        const html =
            '<p>Line 1-1</p>'
            + '<p><!-- EMBED START Image {id: "id123"} --><figure><img src="https://domain.com/image.jpg" alt="image-alt"><figcaption></figcaption></figure><!-- EMBED END Image {id: "id123"} --></p>"'
            + '<p>Line 2</p>';

        const doc = htmlToPmDoc(html);
        const embed = doc.content.find(({type}) => type === 'embed');

        expect(embed.attrs.data.html).toBe('<img src="https://domain.com/image.jpg" alt="image-alt">');

        expectRoundTripParity(html);
    });

    it('should restore media blocks from associations', () => {
        const media = {
            type: 'picture',
            alt_text: 'image-alt',
            description_text: 'a description',
            renditions: {original: {href: 'https://domain.com/image.jpg'}},
        };
        const html =
            '<p>before</p>'
            + '<!-- EMBED START Image {id: "editor0"} --><figure><img src="https://domain.com/image.jpg" alt="image-alt"><figcaption>a description</figcaption></figure><!-- EMBED END Image {id: "editor0"} -->'
            + '<p>after</p>';
        const associations = {editor0: media};

        const doc = htmlToPmDoc(html, associations);
        const mediaNode = doc.content.find(({type}) => type === 'media');

        expect(mediaNode.attrs.media).toEqual(media);

        expectRoundTripParity(html, associations);
    });

    it('should import iframes as embeds', () => {
        const html = '<p>text</p><iframe src="https://example.com/embed"></iframe>';
        const doc = htmlToPmDoc(html);
        const embed = doc.content.find(({type}) => type === 'embed');

        expect(embed.attrs.data.html).toBe('<iframe src="https://example.com/embed"></iframe>');

        expectRoundTripParity(html);
    });

    it('should import external images as embeds', () => {
        const html = '<p>text</p><img src="https://example.com/pic.jpg" alt="pic">';

        expectRoundTripParity(html);
    });

    it('round-trips links and formatting', () => {
        expectRoundTripParity(
            '<p><b>bold</b> <i>italic</i> <u>underline</u> and <a href="https://example.com" target="_blank">a link</a></p>'
            + '<blockquote>quoted</blockquote>'
            + '<ul><li>one</li><li>two</li></ul>',
        );
    });

    it('preserves attachment links (unlike editor3, which dropped them on import)', () => {
        const html = '<p><a data-attachment="abc123">attachment</a></p>';

        expect(pmDocToHtml(htmlToPmDoc(html))).toBe(html);
    });

    it('round-trips editor3-generated body_html', () => {
        // output of editor3StateToHtml for typical article content
        expectRoundTripParity(
            '<h1>Title</h1>\n<p>The <b>name</b> of <a href="https://example.com">Highlaws</a> comes.</p>\n<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>\n<pre><code>code here</code></pre>',
        );
    });

    it('round-trips the editor3 from-html snapshot fixture identically to editor3', () => {
        expectRoundTripParity(snapshotHtml);
    });
});
