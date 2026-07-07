/* tslint:disable:max-line-length */
/* eslint-disable max-len, quotes, quote-props */

import {convertFromRaw} from 'draft-js';
import {editor3StateToHtml} from 'core/editor3/html/to-html/editor3StateToHtml';
import {convertDraftToPmDoc} from '../from-draftjs';
import {pmDocToHtml} from '../to-html';
import {CUSTOM_EDITOR_TAG_ATTR} from 'core/editor3/components/customStyleMap';

/**
 * Golden parity tests for the editor3 → Tiptap migration (Phase 1 of the
 * migration plan). Each fixture is a persisted `draftjsState` raw content
 * state; the assertion is that converting it to a ProseMirror doc and
 * serializing to HTML produces byte-identical output to editor3's
 * `editor3StateToHtml` — which itself is asserted against the expected
 * literal, so fixtures stay honest even if editor3 changes.
 *
 * Fixtures are harvested from `core/editor3/html/tests/to-html.spec.ts`.
 */

function expectParity(rawContentState: any, expected: string | null, tagStylesOverride?: Set<string>) {
    const editor3Html = editor3StateToHtml(convertFromRaw(rawContentState), [], tagStylesOverride);
    const tiptapHtml = pmDocToHtml(convertDraftToPmDoc(rawContentState), {tagStylesOverride});

    if (expected != null) {
        expect(editor3Html).toBe(expected);
    }

    expect(tiptapHtml).toBe(editor3Html);
}

describe('editor-tiptap to-html parity with editor3', () => {
    beforeEach(window.module('superdesk.apps.spellcheck'));

    it('converts a sentence without formatting', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {}};

        expectParity(
            rawContentState,
            '<p>The name of Highlaws comes from the Old English hēah-hlāw, meaning "high mounds".</p>',
        );
    });

    it('converts a sentence with simple inline styles', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 3, "style": "BOLD"}, {"offset": 4, "length": 4, "style": "ITALIC"}, {"offset": 9, "length": 2, "style": "UNDERLINE"}, {"offset": 12, "length": 8, "style": "STRIKETHROUGH"}, {"offset": 21, "length": 5, "style": "SUBSCRIPT"}, {"offset": 27, "length": 4, "style": "SUPERSCRIPT"}], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {}};

        expectParity(
            rawContentState,
            '<p><b>The</b> <i>name</i> <u>of</u> <s>Highlaws</s> <sub>comes</sub> <sup>from</sup> the Old English hēah-hlāw, meaning "high mounds".</p>',
        );
    });

    it('converts headings', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw", "type": "header-one", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "32mrs", "text": ", meaning \"high mounds\". In the past,", "type": "header-two", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "d2ggv", "text": "variant spellings included Heelawes, Hielawes,", "type": "header-three", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "3eqv5", "text": "Highlows, Hielows, and Hylaws.", "type": "header-four", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "8lcpm", "text": "[2] The hamlet appears in a survey of Holm Cultram dating back", "type": "header-five", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "emuqc", "text": "to the year 1538, during the reign of Henry VIII.", "type": "header-six", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "90o9n", "text": "There were at least thirteen families resident in Highlaws at that time.[3] Abdastartus is a genus of lace bugs in the family Tingidae. There are about five described species in Abdastartus.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<h1>The name of Highlaws comes from the Old English hēah-hlāw</h1>
<h2>, meaning "high mounds". In the past,</h2>
<h3>variant spellings included Heelawes, Hielawes,</h3>
<h4>Highlows, Hielows, and Hylaws.</h4>
<h5>[2] The hamlet appears in a survey of Holm Cultram dating back</h5>
<h6>to the year 1538, during the reign of Henry VIII.</h6>
<p>There were at least thirteen families resident in Highlaws at that time.[3] Abdastartus is a genus of lace bugs in the family Tingidae. There are about five described species in Abdastartus.</p>`,
        );
    });

    it('converts a blockquote', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "blockquote", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "2u79k", "text": "In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<blockquote>The name of Highlaws comes from the Old English hēah-hlāw, meaning "high mounds".</blockquote>
<p>In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.</p>`,
        );
    });

    it('converts a code block', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "code-block", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "2u79k", "text": "In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<pre><code>The name of Highlaws comes from the Old English hēah-hlāw, meaning "high mounds".</code></pre>
<p>In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.</p>`,
        );
    });

    it('converts a link', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 12, "length": 8, "key": 0}], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {"0": {"type": "LINK", "mutability": "MUTABLE", "data": {"link": {"href": "https://en.wikipedia.org/wiki/Highlaws"}}}}};

        expectParity(
            rawContentState,
            '<p>The name of <a href="https://en.wikipedia.org/wiki/Highlaws">Highlaws</a> comes from the Old English hēah-hlāw, meaning "high mounds".</p>',
        );
    });

    it('converts a link with target', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 12, "length": 8, "key": 0}], "data": {}}], "entityMap": {"0": {"type": "LINK", "mutability": "MUTABLE", "data": {"link": {"href": "https://en.wikipedia.org/wiki/Highlaws", "target": "_blank"}}}}};

        expectParity(
            rawContentState,
            '<p>The name of <a href="https://en.wikipedia.org/wiki/Highlaws" target="_blank">Highlaws</a>.</p>',
        );
    });

    it('converts an attachement', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\".", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 12, "length": 8, "key": 0}], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {"0": {"type": "LINK", "mutability": "MUTABLE", "data": {"link": {"attachment": "5c9dd26d149f114c61d84db0"}}}}};

        expectParity(
            rawContentState,
            '<p>The name of <a data-attachment="5c9dd26d149f114c61d84db0">Highlaws</a> comes from the Old English hēah-hlāw, meaning "high mounds".</p>',
        );
    });

    it('converts a simple table', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "fhokc", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {"data": "{\"cells\":[[{\"blocks\":[{\"key\":\"k8sb\",\"text\":\"three\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"a25i9\",\"text\":\"column\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"ej3lv\",\"text\":\"table\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}}],[{\"blocks\":[{\"key\":\"f0qc0\",\"text\":\"example\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"50s2o\",\"text\":\"right\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"escgd\",\"text\":\"here\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}}]],\"numRows\":2,\"numCols\":3,\"withHeader\":false}"}}, {"key": "2u79k", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {"0": {"type": "TABLE", "mutability": "MUTABLE", "data": {"data": {"cells": [[{"blocks": [{"key": "k8sb", "text": "three", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "a25i9", "text": "column", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "ej3lv", "text": "table", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}], [{"blocks": [{"key": "f0qc0", "text": "example", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "50s2o", "text": "right", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "escgd", "text": "here", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}}]], "numRows": 2, "numCols": 3, "withHeader": false}}}}};

        expectParity(
            rawContentState,
            '<table><tbody><tr><td><p>three</p></td><td><p>column</p></td><td><p>table</p></td></tr><tr><td><p>example</p></td><td><p>right</p></td><td><p>here</p></td></tr></tbody></table>',
        );
    });

    it('converts a table with inline styles', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "fhokc", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {"data": "{\"cells\":[[{\"blocks\":[{\"key\":\"k8sb\",\"text\":\"three\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":5,\"style\":\"BOLD\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"a25i9\",\"text\":\"column\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":6,\"style\":\"ITALIC\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"ej3lv\",\"text\":\"table\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":5,\"style\":\"UNDERLINE\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}}],[{\"blocks\":[{\"key\":\"f0qc0\",\"text\":\"example\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":7,\"style\":\"SUBSCRIPT\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"50s2o\",\"text\":\"right\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":5,\"style\":\"SUPERSCRIPT\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}},{\"blocks\":[{\"key\":\"escgd\",\"text\":\"here\",\"type\":\"unstyled\",\"depth\":0,\"inlineStyleRanges\":[{\"offset\":0,\"length\":4,\"style\":\"STRIKETHROUGH\"}],\"entityRanges\":[],\"data\":{}}],\"entityMap\":{}}]],\"numRows\":2,\"numCols\":3,\"withHeader\":false}"}}, {"key": "2u79k", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {"0": {"type": "TABLE", "mutability": "MUTABLE", "data": {"data": {"cells": [[{"blocks": [{"key": "k8sb", "text": "three", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 5, "style": "BOLD"}], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "a25i9", "text": "column", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 6, "style": "ITALIC"}], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "ej3lv", "text": "table", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 5, "style": "UNDERLINE"}], "entityRanges": [], "data": {}}], "entityMap": {}}], [{"blocks": [{"key": "f0qc0", "text": "example", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 7, "style": "SUBSCRIPT"}], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "50s2o", "text": "right", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 5, "style": "SUPERSCRIPT"}], "entityRanges": [], "data": {}}], "entityMap": {}}, {"blocks": [{"key": "escgd", "text": "here", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 4, "style": "STRIKETHROUGH"}], "entityRanges": [], "data": {}}], "entityMap": {}}]], "numRows": 2, "numCols": 3, "withHeader": false}}}}};

        expectParity(
            rawContentState,
            '<table><tbody><tr><td><p><b>three</b></p></td><td><p><i>column</i></p></td><td><p><u>table</u></p></td></tr><tr><td><p><sub>example</sub></p></td><td><p><sup>right</sup></p></td><td><p><s>here</s></p></td></tr></tbody></table>',
        );
    });

    it('converts a table with header and missing cells', () => {
        const cs = (text: string) => ({blocks: [{key: 'c' + text, text, type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}}], entityMap: {}});
        const tableData = {
            numCols: 3,
            numRows: 3,
            withHeader: true,
            cells: [
                [cs('a'), null, cs('c')],
                [cs('d'), cs('e'), cs('f')],
                [cs('g'), cs('h'), cs('i')],
            ],
        };
        const rawContentState: any = {
            blocks: [
                {key: 'fhokc', text: ' ', type: 'atomic', depth: 0, inlineStyleRanges: [], entityRanges: [{offset: 0, length: 1, key: 0}], data: {data: JSON.stringify(tableData)}},
            ],
            entityMap: {0: {type: 'TABLE', mutability: 'MUTABLE', data: {data: tableData}}},
        };

        expectParity(
            rawContentState,
            '<table><thead><tr><th><p>a</p></th><th></th><th><p>c</p></th></tr></thead>'
            + '<tbody><tr><td><p>d</p></td><td><p>e</p></td><td><p>f</p></td></tr>'
            + '<tr><td><p>g</p></td><td><p>h</p></td><td><p>i</p></td></tr></tbody></table>',
        );
    });

    it('converts a single row table with header', () => {
        const cs = (text: string) => ({blocks: [{key: 'c' + text, text, type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}}], entityMap: {}});
        const tableData = {
            numCols: 3,
            numRows: 1,
            withHeader: true,
            cells: [[cs('a'), cs('b'), cs('c')]],
        };
        const rawContentState: any = {
            blocks: [
                {key: 'fhokc', text: ' ', type: 'atomic', depth: 0, inlineStyleRanges: [], entityRanges: [{offset: 0, length: 1, key: 0}], data: {data: JSON.stringify(tableData)}},
            ],
            entityMap: {0: {type: 'TABLE', mutability: 'MUTABLE', data: {data: tableData}}},
        };

        expectParity(
            rawContentState,
            '<table><thead><tr><th><p>a</p></th><th><p>b</p></th><th><p>c</p></th></tr></thead></table>',
        );
    });

    it('converts an image', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "fi1d", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {}}, {"key": "60vvd", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {"0": {"type": "MEDIA", "mutability": "MUTABLE", "data": {"media": {"description_text": "pin dec", "type": "picture", "alt_text": "pin alt", "renditions": {"viewImage": {"width": 426, "mimetype": "image/jpeg", "href": "http://localhost:5000/api/upload-raw/view.jpg", "media": "5c9d03de149f116747b6731b", "height": 640}, "original": {"width": 3648, "mimetype": "image/jpeg", "href": "http://localhost:5000/api/upload-raw/5c9d03dd149f116747b6730f.jpg", "media": "5c9d03dd149f116747b6730f", "height": 5472}}}}}}};

        expectParity(
            rawContentState,
            `<!-- EMBED START Image {id: "editor_0"} -->
<figure>
    <img src="http://localhost:5000/api/upload-raw/5c9d03dd149f116747b6730f.jpg" alt="pin alt" />
    <figcaption>pin dec</figcaption>
</figure>
<!-- EMBED END Image {id: "editor_0"} -->`,
        );
    });

    it('converts a video', () => {
        const rawContentState: any = {"blocks": [{"key": "fi1d", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {}}], "entityMap": {"0": {"type": "MEDIA", "mutability": "MUTABLE", "data": {"media": {"type": "video", "alt_text": "vid alt", "renditions": {"original": {"href": "http://localhost:5000/api/upload-raw/vid.mp4"}}}}}}};

        expectParity(
            rawContentState,
            `<!-- EMBED START Video {id: "editor_0"} -->
<figure>
    <video controls src="http://localhost:5000/api/upload-raw/vid.mp4" alt="vid alt" width="100%" height="100%" />
</figure>
<!-- EMBED END Video {id: "editor_0"} -->`,
        );
    });

    it('converts unordered list', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of", "type": "unordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "fgkp6", "text": "Highlaws comes", "type": "unordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "6g9h6", "text": "from the Old English", "type": "unordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "7v7b1", "text": "hēah-hlāw", "type": "unordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<ul>
  <li>The name of</li>
  <li>Highlaws comes</li>
  <li>from the Old English</li>
  <li>hēah-hlāw</li>
</ul>`,
        );
    });

    it('converts an ordered list', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "fgkp6", "text": "Highlaws comes", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "6g9h6", "text": "from the Old English", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "7v7b1", "text": "hēah-hlāw", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<ol>
  <li>The name of</li>
  <li>Highlaws comes</li>
  <li>from the Old English</li>
  <li>hēah-hlāw</li>
</ol>`,
        );
    });

    it('converts two different lists next to each other', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "6oe0d", "text": "hēah-hlāw, meaning \"high mounds\". In the past, variant", "type": "unordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "aegg", "text": "spellings included Heelawes, Hielawes, Highlows,", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}, {"key": "a1qv7", "text": "Hielows, and Hylaws.", "type": "ordered-list-item", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {}};

        expectParity(
            rawContentState,
            `<ol>
  <li>The name of Highlaws comes from the Old English</li>
</ol>
<ul>
  <li>hēah-hlāw, meaning "high mounds". In the past, variant</li>
</ul>
<ol>
  <li>spellings included Heelawes, Hielawes, Highlows,</li>
  <li>Hielows, and Hylaws.</li>
</ol>`,
        );
    });

    it('correctly parses nested lists', () => {
        const listBlock = (depth: number, text: string, index: number) => ({
            key: 'lb' + index, text, type: 'unordered-list-item', depth, inlineStyleRanges: [], entityRanges: [], data: {},
        });
        const rawContentState: any = {
            blocks: [
                [0, '1'], [0, '2'], [1, '11'], [1, '22'], [1, '3'], [2, '4'], [2, '5'],
                [3, '6'], [3, '6.5'], [2, 'x'], [1, '7'], [1, '33'], [0, '8'],
            ].map(([depth, text], index) => listBlock(depth as number, text as string, index)),
            entityMap: {},
        };

        expectParity(
            rawContentState,
            `<ul>
  <li>1</li>
  <li>2
    <ul>
      <li>11</li>
      <li>22</li>
      <li>3
        <ul>
          <li>4</li>
          <li>5
            <ul>
              <li>6</li>
              <li>6.5</li>
            </ul>
          </li>
          <li>x</li>
        </ul>
      </li>
      <li>7</li>
      <li>33</li>
    </ul>
  </li>
  <li>8</li>
</ul>`,
        );
    });

    it('correctly parses abruptly ending lists', () => {
        const listBlock = (depth: number, text: string, index: number) => ({
            key: 'lb' + index, text, type: 'unordered-list-item', depth, inlineStyleRanges: [], entityRanges: [], data: {},
        });
        const rawContentState: any = {
            blocks: [
                listBlock(0, '1', 0),
                listBlock(1, '2', 1),
                listBlock(2, '3', 2),
                listBlock(3, '4', 3),
                {key: 'p1', text: 'abc', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
            ],
            entityMap: {},
        };

        expectParity(
            rawContentState,
            `<ul>
  <li>1
    <ul>
      <li>2
        <ul>
          <li>3
            <ul>
              <li>4</li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
<p>abc</p>`,
        );
    });

    it('converts an embed', inject(() => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}, {"key": "2s495", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {}}, {"key": "egj1u", "text": "", "type": "unstyled", "depth": 0, "inlineStyleRanges": [], "entityRanges": [], "data": {}}], "entityMap": {"0": {"type": "EMBED", "mutability": "MUTABLE", "data": {"data": {"url": "https://www.youtube.com/watch?v=G5-KJgVsoUM", "type": "video", "html": "<div><div style=\"left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.2493%;\"><iframe src=\"//cdn.iframe.ly/api/iframe?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DG5-KJgVsoUM&amp;key=87ca3314a9fa775b5c3a7726100694b0\" style=\"border: 0; top: 0; inset-inline-start: 0; width: 100%; height: 100%; position: absolute;\" allowfullscreen scrolling=\"no\" allow=\"autoplay; encrypted-media\"></iframe></div></div>"}}}}};

        expectParity(
            rawContentState,
            '<div class="embed-block"><div><div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.2493%;"><iframe src="//cdn.iframe.ly/api/iframe?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DG5-KJgVsoUM&amp;key=87ca3314a9fa775b5c3a7726100694b0" style="border: 0; top: 0; inset-inline-start: 0; width: 100%; height: 100%; position: absolute;" allowfullscreen scrolling="no" allow="autoplay; encrypted-media"></iframe></div></div></div>',
        );
    }));

    it('converts an embed with description', () => {
        const rawContentState: any = {"blocks": [{"key": "2s495", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {}}], "entityMap": {"0": {"type": "EMBED", "mutability": "MUTABLE", "data": {"data": {"html": "<blockquote>quoted</blockquote>"}, "description": "An embed description"}}}};

        expectParity(
            rawContentState,
            '<div class="embed-block"><blockquote>quoted</blockquote><p class="embed-block__description">An embed description</p></div>',
        );
    });

    it('converts an article embed', () => {
        const rawContentState: any = {"blocks": [{"key": "2s495", "text": " ", "type": "atomic", "depth": 0, "inlineStyleRanges": [], "entityRanges": [{"offset": 0, "length": 1, "key": 0}], "data": {}}], "entityMap": {"0": {"type": "ARTICLE_EMBED", "mutability": "MUTABLE", "data": {"item": {"_id": "urn:embedded-article", "body_html": "<p>embedded body</p>"}}}}};

        expectParity(
            rawContentState,
            '<div data-association-key="urn:embedded-article"><p>embedded body</p></div>',
        );
    });

    it('converts a multi-line quote', () => {
        const quoteContent = {blocks: [{key: 'q1', text: 'quoted line', type: 'unstyled', depth: 0, inlineStyleRanges: [{offset: 0, length: 6, style: 'BOLD'}], entityRanges: [], data: {}}], entityMap: {}};
        const quoteData = {cells: [[quoteContent]], numRows: 1, numCols: 1, withHeader: false};
        const rawContentState: any = {
            blocks: [
                {key: 'mlq1', text: ' ', type: 'atomic', depth: 0, inlineStyleRanges: [], entityRanges: [{offset: 0, length: 1, key: 0}], data: {data: JSON.stringify(quoteData)}},
            ],
            entityMap: {0: {type: 'MULTI-LINE_QUOTE', mutability: 'MUTABLE', data: {data: quoteData}}},
        };

        expectParity(
            rawContentState,
            '<div class="multi-line-quote"><p><b>quoted</b> line</p></div>',
        );
    });

    it('converts nested inline styles', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\". In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 4, "length": 43, "style": "BOLD"}, {"offset": 21, "length": 5, "style": "UNDERLINE"}, {"offset": 32, "length": 3, "style": "ITALIC"}], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {}};

        expectParity(
            rawContentState,
            '<p>The <b>name of Highlaws </b><u><b>comes</b></u><b> from </b><i><b>the</b></i><b> Old English</b> hēah-hlāw, meaning "high mounds". In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.</p>',
        );
    });

    it('converts overlapping inline styles', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\". In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 0, "length": 66, "style": "BOLD"}, {"offset": 4, "length": 89, "style": "ITALIC"}, {"offset": 27, "length": 142, "style": "UNDERLINE"}, {"offset": 165, "length": 5, "style": "SUPERSCRIPT"}], "entityRanges": [], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {}};

        expectParity(
            rawContentState,
            '<p><b>The </b><i><b>name of Highlaws comes </b></i><u><i><b>from the Old English hēah-hlāw, meaning</b></i></u><u><i> "high mounds". In the past</i></u><u>, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and </u><sup><u>Hyla</u></sup><sup>w</sup>s.</p>',
        );
    });

    it('converts inline styles overlapping with a links', () => {
        const rawContentState: any = {"blocks": [{"key": "fcbn3", "text": "The name of Highlaws comes from the Old English hēah-hlāw, meaning \"high mounds\". In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.", "type": "unstyled", "depth": 0, "inlineStyleRanges": [{"offset": 12, "length": 14, "style": "BOLD"}, {"offset": 55, "length": 6, "style": "BOLD"}, {"offset": 48, "length": 18, "style": "UNDERLINE"}], "entityRanges": [{"offset": 21, "length": 10, "key": 0}, {"offset": 36, "length": 21, "key": 1}], "data": {"MULTIPLE_HIGHLIGHTS": {}}}], "entityMap": {"0": {"type": "LINK", "mutability": "MUTABLE", "data": {"link": {"href": "https://en.wikipedia.org/wiki/Highlaws"}}}, "1": {"type": "LINK", "mutability": "MUTABLE", "data": {"link": {"href": "https://en.wikipedia.org/wiki/Highlaws"}}}}};

        expectParity(
            rawContentState,
            '<p>The name of <b>Highlaws </b><a href="https://en.wikipedia.org/wiki/Highlaws"><b>comes</b> from</a> the <a href="https://en.wikipedia.org/wiki/Highlaws">Old English <u>hēah-hl</u><u><b>āw</b></u></a><u><b>, me</b></u><u>aning</u> "high mounds". In the past, variant spellings included Heelawes, Hielawes, Highlows, Hielows, and Hylaws.</p>',
        );
    });

    it('adds annotations to HTML', () => {
        const rawContentState: any = {
            entityMap: {},
            blocks: [{
                inlineStyleRanges: [{
                    length: 5,
                    style: 'ANNOTATION-1',
                    offset: 6,
                }, {
                    length: 5,
                    style: 'ANNOTATION-2',
                    offset: 12,
                }],
                data: {
                    MULTIPLE_HIGHLIGHTS: {
                        lastHighlightIds: {ANNOTATION: 2},
                        highlightsData: {
                            'ANNOTATION-1': {
                                data: {
                                    email: 'admin@admin.ro',
                                    date: '2018-03-30T14:57:53.172Z',
                                    msg: '{"blocks":[{"key":"ejm11","text":"Annotation 1","type":"unstyled",'
                                        + '"depth":0,"inlineStyleRanges":[],"entityRanges":[],"data":{}}],'
                                        + '"entityMap":{}}',
                                    author: 'admin',
                                    annotationType: 'regular',
                                },
                                type: 'ANNOTATION',
                            },
                            'ANNOTATION-2': {
                                data: {
                                    email: 'admin@admin.ro',
                                    date: '2018-03-30T14:58:20.876Z',
                                    msg: '{"blocks":[{"key":"9i73f","text":"Annotation 2","type":"unstyled",'
                                        + '"depth":0,"inlineStyleRanges":[],"entityRanges":[],"data":{}},'
                                        + '{"key":"d3vb3","text":"Line 2","type":"unstyled","depth":0,'
                                        + '"inlineStyleRanges":[],"entityRanges":[],"data":{}}],"entityMap":{}}',
                                    author: 'admin',
                                    annotationType: 'regular',
                                },
                                type: 'ANNOTATION',
                            },
                        },
                    },
                },
                text: 'lorem ipsum dolor',
                type: 'unstyled',
                depth: 0,
                key: '2sso6',
                entityRanges: [],
            }],
        };

        expectParity(
            rawContentState,
            '<p>lorem <span annotation-id="1">ipsum</span> <span annotation-id="2">dolor</span></p>',
        );
    });

    it('produces no markup for comment and suggestion highlights', () => {
        const rawContentState: any = {
            entityMap: {},
            blocks: [{
                key: '2sso6',
                text: 'lorem ipsum dolor',
                type: 'unstyled',
                depth: 0,
                entityRanges: [],
                inlineStyleRanges: [
                    {offset: 0, length: 5, style: 'COMMENT-1'},
                    {offset: 6, length: 5, style: 'ADD_SUGGESTION-1'},
                ],
                data: {
                    MULTIPLE_HIGHLIGHTS: {
                        lastHighlightIds: {COMMENT: 1, ADD_SUGGESTION: 1},
                        highlightsData: {
                            'COMMENT-1': {data: {msg: 'a comment'}, type: 'COMMENT'},
                            'ADD_SUGGESTION-1': {data: {author: 'admin'}, type: 'ADD_SUGGESTION'},
                        },
                    },
                },
            }],
        };

        expectParity(rawContentState, '<p>lorem ipsum dolor</p>');
    });

    it('emits custom editor tag spans', () => {
        const rawContentState: any = {
            blocks: [{
                key: 'b1',
                text: 'tagged plain',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [{offset: 0, length: 6, style: 'EDITOR_TAG_PEOPLE'}],
                entityRanges: [],
                data: {},
            }],
            entityMap: {},
        };

        expectParity(
            rawContentState,
            `<p><span ${CUSTOM_EDITOR_TAG_ATTR}="EDITOR_TAG_PEOPLE">tagged</span> plain</p>`,
            new Set(['EDITOR_TAG_PEOPLE']),
        );
    });

    it('does not emit custom tag spans when the style is not configured', () => {
        const rawContentState: any = {
            blocks: [{
                key: 'b1',
                text: 'hello',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [{offset: 0, length: 5, style: 'EDITOR_TAG_PEOPLE'}],
                entityRanges: [],
                data: {},
            }],
            entityMap: {},
        };

        expectParity(rawContentState, '<p>hello</p>', new Set());
    });

    it('preserves whitespace and encodes special characters', () => {
        const rawContentState: any = {
            blocks: [{
                key: 'b1',
                text: ' a  b<c>&d ',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [{offset: 1, length: 4, style: 'BOLD'}],
                entityRanges: [],
                data: {},
            }],
            entityMap: {},
        };

        expectParity(rawContentState, null);
    });

    it('handles newlines inside blocks', () => {
        const rawContentState: any = {
            blocks: [{
                key: 'b1',
                text: 'line one\nline two',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [{offset: 5, length: 8, style: 'BOLD'}],
                entityRanges: [],
                data: {},
            }],
            entityMap: {},
        };

        expectParity(rawContentState, null);
    });

    it('measures style ranges in code points (astral characters)', () => {
        const rawContentState: any = {
            blocks: [{
                key: 'b1',
                text: '😀 bold text',
                type: 'unstyled',
                depth: 0,
                inlineStyleRanges: [{offset: 2, length: 4, style: 'BOLD'}],
                entityRanges: [],
                data: {},
            }],
            entityMap: {},
        };

        expectParity(rawContentState, null);
    });

    it('trims leading and trailing empty paragraphs', () => {
        const rawContentState: any = {
            blocks: [
                {key: 'b1', text: '', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'b2', text: 'middle', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'b3', text: '', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
            ],
            entityMap: {},
        };

        expectParity(rawContentState, '<p>middle</p>');
    });

    it('keeps empty paragraphs in the middle of content', () => {
        const rawContentState: any = {
            blocks: [
                {key: 'b1', text: 'first', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'b2', text: '', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
                {key: 'b3', text: 'last', type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {}},
            ],
            entityMap: {},
        };

        expectParity(rawContentState, '<p>first</p>\n<p><br></p>\n<p>last</p>');
    });
});

describe('editor-tiptap conversion sidecar', () => {
    it('carries editor3 custom data over to doc attributes', () => {
        const rawContentState: any = {
            entityMap: {},
            blocks: [{
                key: 'b1',
                text: 'lorem ipsum',
                type: 'unstyled',
                depth: 0,
                entityRanges: [],
                inlineStyleRanges: [{offset: 0, length: 5, style: 'COMMENT-1'}],
                data: {
                    MULTIPLE_HIGHLIGHTS: {
                        lastHighlightIds: {COMMENT: 1},
                        highlightsData: {
                            'COMMENT-1': {data: {msg: 'a comment'}, type: 'COMMENT'},
                        },
                    },
                    RESOLVED_COMMENTS_HISTORY: [{resolved: true}],
                    __PUBLIC_API__comments: [{body: 'a comment'}],
                },
            }],
        };

        const doc = convertDraftToPmDoc(rawContentState);
        const customData = doc.attrs?.customData;

        expect(customData.highlightsData['COMMENT-1']).toEqual({data: {msg: 'a comment'}, type: 'COMMENT'});
        expect(customData.lastHighlightIds).toEqual({COMMENT: 1});
        expect(customData.resolvedCommentsHistory).toEqual([{resolved: true}]);
        expect(customData.__PUBLIC_API__comments).toEqual([{body: 'a comment'}]);

        const firstParagraph = doc.content?.[0];

        expect(firstParagraph?.content?.[0]).toEqual({
            type: 'text',
            text: 'lorem',
            marks: [{type: 'highlight', attrs: {styleName: 'COMMENT-1', highlightKey: 'COMMENT'}}],
        });
    });
});
