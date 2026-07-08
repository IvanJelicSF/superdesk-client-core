import {Node as TiptapNode, Mark as TiptapMark, Extension, Extensions, NodeViewRenderer} from '@tiptap/core';
import {NodeSpec, MarkSpec} from '@tiptap/pm/model';
import {editorTiptapSchema} from './schema';

export interface IExtensionsOptions {
    // per-node custom rendering inside the editor (e.g. React node views)
    nodeViews?: {[nodeName: string]: NodeViewRenderer};
}

/**
 * Generates Tiptap extensions from `editorTiptapSchema` so that the schema an
 * `Editor` instance is built with is — by construction — identical to the one
 * the converters and the HTML serializer use. Editing behavior (commands,
 * input rules, keyboard shortcuts) is added on top of these in the authoring
 * field; the document model lives in one place only.
 */

function attributesFromSpec(spec: NodeSpec | MarkSpec) {
    const attrs = spec.attrs ?? {};

    return Object.keys(attrs).reduce((acc, name) => {
        acc[name] = 'default' in attrs[name] ? {default: attrs[name].default} : {};
        return acc;
    }, {});
}

export function getEditorTiptapExtensions(options: IExtensionsOptions = {}): Extensions {
    const {nodes, marks} = editorTiptapSchema.spec;
    const extensions: Extensions = [
        // forwards schema spec properties that tiptap's Node.create does not
        // handle itself (e.g. tableRole for prosemirror-tables)
        Extension.create({
            name: 'schemaSpecExtras',
            extendNodeSchema(extension) {
                const spec: NodeSpec | undefined = (nodes as any).get(extension.name);

                return spec?.tableRole != null ? {tableRole: spec.tableRole} : {};
            },
        }),
    ];

    (nodes as any).forEach((name: string, spec: NodeSpec) => {
        const nodeView = options.nodeViews?.[name];

        extensions.push(TiptapNode.create({
            name,
            topNode: name === 'doc',
            content: spec.content,
            group: spec.group,
            inline: spec.inline === true,
            atom: spec.atom === true,
            defining: spec.defining === true,
            isolating: spec.isolating === true,
            marks: spec.marks,
            selectable: spec.selectable !== false,
            addAttributes() {
                return attributesFromSpec(spec);
            },
            parseHTML() {
                return spec.parseDOM as any;
            },
            renderHTML({node}) {
                return spec.toDOM != null ? (spec.toDOM as any)(node) : ['div', 0];
            },
            addNodeView: nodeView == null ? undefined : () => nodeView,
        }));
    });

    (marks as any).forEach((name: string, spec: MarkSpec) => {
        extensions.push(TiptapMark.create({
            name,
            inclusive: spec.inclusive !== false,
            excludes: spec.excludes,
            addAttributes() {
                return attributesFromSpec(spec);
            },
            parseHTML() {
                return spec.parseDOM as any;
            },
            renderHTML({mark}) {
                return spec.toDOM != null ? (spec.toDOM as any)(mark) : ['span', 0];
            },
        }));
    });

    return extensions;
}
