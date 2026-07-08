import {
    META_FIELD_NAME,
    fieldsMetaKeys,
    getFieldId,
    getFieldMetadata,
} from 'core/editor3/helpers/fieldsMeta';
import {
    editor3DataKeys,
    getCustomDataFromEditorRawState,
} from 'core/editor3/helpers/editor3CustomData';
import {
    getRangeAndTextForStyleInRawState,
} from 'core/editor3/helpers/highlights';
import {getHighlightsConfig} from 'core/editor3/highlightsConfig';
import {getCustomMetadata} from 'core/editor3/helpers/editor3CustomData';
import {getLabelNameResolver} from 'apps/workspace/helpers/getLabelForFieldId';
import {get} from 'lodash';
import {gettext} from 'core/utils';
import {
    getTiptapStateFromItem,
    getResolvedCommentsFromTiptapState,
    getUnresolvedCommentsFromTiptapState,
} from 'core/editor-tiptap/article-access';

function getAllUserIdsFromComments(comments) {
    const users = [];

    comments.forEach(({data}) => {
        users.push(data.authorId);
        if (data.resolutionInfo) {
            users.push(data.resolutionInfo.resolverUserId);
        }
        data.replies.map((reply) => users.push(reply.authorId));
    });

    return users.filter((value, index, self) => self.indexOf(value) === index);
}

function filterUsers(users, ids) {
    return users.filter((user) => ids.includes(user._id));
}

function convertUsersArrayToObject(users) {
    const usersObj = {};

    users.forEach((user) => {
        usersObj[user._id] = user;
    });

    return usersObj;
}

function getCommentsFromField(getLabelForFieldId) {
    return (obj) => ({
        fieldName: getLabelForFieldId(getFieldId(obj.contentKey)),
        comments: getCustomDataFromEditorRawState(
            obj[fieldsMetaKeys.draftjsState],
            editor3DataKeys.RESOLVED_COMMENTS_HISTORY,
        ) || [],
    });
}

InlineCommentsCtrl.$inject = ['$scope', 'userList', 'metadata', 'content'];
function InlineCommentsCtrl($scope, userList, metadata, content) {
    getLabelNameResolver().then((getLabelForFieldId) => {
        $scope.resolvedFilter = 'RESOLVED';

        const editors = Object.keys($scope.item[META_FIELD_NAME])
            .map((contentKey) => ({
                contentKey: contentKey,
                [fieldsMetaKeys.draftjsState]: getFieldMetadata(
                    $scope.item,
                    contentKey,
                    fieldsMetaKeys.draftjsState,
                ),
            }))
            .filter((obj) => obj[fieldsMetaKeys.draftjsState] != null);

        // fields saved by the Tiptap editor store their state in
        // `tiptapState`; the entries have the same shape
        const tiptapEditors = Object.keys($scope.item[META_FIELD_NAME])
            .map((contentKey) => ({
                contentKey: contentKey,
                tiptapState: getTiptapStateFromItem($scope.item, contentKey),
            }))
            .filter((obj) => obj.tiptapState != null);

        const resolvedComments = editors
            .map(getCommentsFromField(getLabelForFieldId))
            .concat(tiptapEditors.map((obj) => ({
                fieldName: getLabelForFieldId(getFieldId(obj.contentKey)),
                comments: getResolvedCommentsFromTiptapState(obj.tiptapState),
            })))
            .filter((obj) => obj.comments.length > 0);

        const unresolvedComments = Object.keys($scope.item[META_FIELD_NAME]).map((contentKey) => {
            const rawEditorState = getFieldMetadata(
                $scope.item,
                contentKey,
                fieldsMetaKeys.draftjsState,
            );

            if (rawEditorState == null) {
                const tiptapState = getTiptapStateFromItem($scope.item, contentKey);

                return {
                    fieldId: contentKey,
                    fieldName: getLabelForFieldId(getFieldId(contentKey)),
                    comments: tiptapState == null ? [] : getUnresolvedCommentsFromTiptapState(tiptapState),
                };
            }

            const comments = getCustomMetadata($scope.item, contentKey, getHighlightsConfig().COMMENT.type)
                .map((highlight) => {
                    const highlightId = highlight.styleName;
                    const highlightWithCommentTextAdded = {
                        ...highlight.obj,
                        data: {
                            ...highlight.obj.data,
                            commentedText: getRangeAndTextForStyleInRawState(
                                rawEditorState,
                                highlightId,
                            ).highlightedText,
                        },
                    };

                    return {...highlightWithCommentTextAdded, highlightId: highlightId};
                });

            return {
                fieldId: contentKey,
                fieldName: getLabelForFieldId(getFieldId(contentKey)),
                comments: comments,
            };
        })
            .filter((obj) => obj.comments.length > 0);

        const allComments = []
            .concat(...resolvedComments.map((obj) => obj.comments))
            .concat(...unresolvedComments.map((obj) => obj.comments));

        const userIds = getAllUserIdsFromComments(allComments);

        const _comments = {
            RESOLVED: resolvedComments,
            UNRESOLVED: unresolvedComments,
        };

        userList.getAll().then((users) => {
            $scope.users = convertUsersArrayToObject(filterUsers(users, userIds));
            $scope.items = _comments;
        });
    });
}

angular
    .module('superdesk.apps.authoring.track-changes.inline-comments', [
        'superdesk.apps.authoring.widgets',
    ])
    .config([
        'authoringWidgetsProvider',
        function(authoringWidgetsProvider) {
            authoringWidgetsProvider.widget('inline-comments', {
                icon: 'comments',
                label: gettext('Inline comments'),
                template:
          'scripts/apps/authoring/track-changes/views/inline-comments-widget.html',
                order: 9,
                side: 'right',
                display: {
                    authoring: true,
                    packages: true,
                    killedItem: true,
                    legalArchive: false,
                    archived: false,
                    picture: true,
                    personal: true,
                },
                isWidgetVisible: (item) => ['content', function(content) {
                    if (item.profile == null) {
                        return Promise.resolve(true);
                    }

                    return new Promise((resolve) => {
                        content.getType(item.profile).then((type) => {
                            /**
                             * It used to be checked whether editor3 is enabled,
                             * but now that editor3 is the only editor
                             * it is only checked whether content profile has body_html field
                             */
                            resolve(type?.editor?.body_html != null);
                        });
                    });
                }],
                feature: 'editorInlineComments',
            });
        },
    ])

    .controller('InlineCommentsCtrl', InlineCommentsCtrl);
