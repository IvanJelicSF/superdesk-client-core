import {Editor, Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import ng from 'core/services/ng';
import {SUPERDESK_MEDIA_TYPES, MEDIA_TYPES_TRIGGER_DROP_ZONE} from 'core/constants';
import {getEmbedObject} from 'core/editor3/components/embeds/EmbedInput';
import {checkRenditions} from 'apps/authoring/authoring/controllers/AssociationController';

/**
 * Media / embed insertion for the Tiptap field: superdesk item drops,
 * external file drops (upload dialog), the toolbar upload flow and
 * embeds from a URL — mirroring editor3's `insertMedia` and `embed`
 * actions and its drop handling.
 */

export function insertMediaNode(editor: Editor, media: any, position?: number): boolean {
    const content = {type: 'media', attrs: {media, rawKey: null}};

    if (position != null) {
        return editor.chain().insertContentAt(position, content).focus()
            .run();
    }

    return editor.chain().insertContent(content).focus()
        .run();
}

export function insertEmbedNode(editor: Editor, data: {[key: string]: any}, position?: number): boolean {
    const content = {type: 'embed', attrs: {data, description: null, rawKey: null}};

    if (position != null) {
        return editor.chain().insertContentAt(position, content).focus()
            .run();
    }

    return editor.chain().insertContent(content).focus()
        .run();
}

/**
 * Shows the upload dialog (like editor3's `insertMedia` action), lets the
 * user crop images, and inserts the resulting media.
 */
export function showUploadDialogAndInsert(editor: Editor, files?: Array<File>, position?: number): void {
    const superdesk = ng.get('superdesk');
    const renditions = ng.get('renditions');

    superdesk.intent('upload', 'media', files).then((mediaList: Array<any>) => {
        const queue = [...(mediaList ?? [])];
        const edited: Array<any> = [];

        function editNext() {
            if (queue.length > 0) {
                const media = queue.shift();
                const isImage = checkRenditions.isImage(media.renditions.original);
                const options = {
                    isNew: true,
                    editable: true,
                    defaultTab: isImage ? 'crop' : 'view',
                };

                // wait for the already opened modal to close before opening the next one
                setTimeout(() => {
                    renditions.crop(media, options).then((cropped) => {
                        edited.push(cropped);
                        editNext();
                    }, (reason) => {
                        if (reason?.done === true) {
                            // no crops were set, continue with defaults
                            edited.push(media);
                            editNext();
                        }
                    });
                });
            } else {
                let insertAt = position;

                for (const media of edited) {
                    insertMediaNode(editor, media, insertAt);
                    insertAt = undefined; // subsequent items follow the selection
                }
            }
        }

        editNext();
    });
}

/**
 * Creates an embed from a URL (resolved via iframely, as in editor3) or
 * from raw embed HTML.
 */
export function insertEmbedFromInput(editor: Editor, input: string): Promise<void> {
    const looksLikeUrl = /^https?:\/\/\S+$/.test(input.trim());

    if (looksLikeUrl) {
        return Promise.resolve(getEmbedObject(input.trim()))
            .then((data) => {
                insertEmbedNode(editor, data);
            });
    }

    insertEmbedNode(editor, {html: input});

    return Promise.resolve();
}

function isAllMediaFiles(files: FileList): boolean {
    return files.length > 0 && Array.from(files).every(
        (file) => file.type.startsWith('audio/') || file.type.startsWith('image/') || file.type.startsWith('video/'),
    );
}

/**
 * Handles drops of superdesk items (from the media pool / archive) and of
 * external media files, like editor3's `canDropMedia`/`handleDropOnEditor`.
 */
export const mediaDropHandling = Extension.create({
    name: 'mediaDropHandling',

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                props: {
                    handleDrop(view, event, slice, moved) {
                        if (moved || !editor.isEditable) {
                            return false; // internal drag or read-only
                        }

                        const dataTransfer = event.dataTransfer;

                        if (dataTransfer == null) {
                            return false;
                        }

                        const dropPos = view.posAtCoords({left: event.clientX, top: event.clientY})?.pos;
                        const superdeskType = MEDIA_TYPES_TRIGGER_DROP_ZONE.find(
                            (mediaType) => dataTransfer.types.includes(mediaType),
                        );

                        if (superdeskType != null) {
                            event.preventDefault();

                            const payload = dataTransfer.getData(superdeskType);

                            if (superdeskType === SUPERDESK_MEDIA_TYPES.EMBED) {
                                insertEmbedNode(editor, {html: payload}, dropPos);
                            } else {
                                insertMediaNode(editor, JSON.parse(payload), dropPos);
                            }

                            return true;
                        }

                        if (dataTransfer.types.includes('Files') && isAllMediaFiles(dataTransfer.files)) {
                            event.preventDefault();
                            showUploadDialogAndInsert(editor, Array.from(dataTransfer.files), dropPos);

                            return true;
                        }

                        return false;
                    },
                },
            }),
        ];
    },
});
