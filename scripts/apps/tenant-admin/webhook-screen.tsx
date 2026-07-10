import React from 'react';
import {Alert, Button, Checkbox, Input, Modal} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {
    CONFIG_WEBHOOK_ID,
    IWebhook,
    createWebhook,
    deleteWebhook,
    getAdminErrorMessage,
    listWebhooks,
    patchWebhook,
    testWebhook,
} from './api';

const cellStyle: React.CSSProperties = {padding: '8px 12px', textAlign: 'start', verticalAlign: 'top'};

interface IProps {
    onSessionExpired(): void;
}

interface IState {
    webhooks: Array<IWebhook> | null;
    error: string | null;
    info: string | null;
    busyId: string | null; // webhook with an action in progress
    editing: IWebhook | 'new' | null;
    deleteConfirm: IWebhook | null;
}

/**
 * Lifecycle webhooks: any number of endpoints, each receiving all tenant
 * lifecycle events (suspended/activated/deleted/purged), HMAC-signed with its
 * own secret. The entry with id `config` is the TENANT_WEBHOOK_URL fallback
 * from the server configuration file — shown read-only.
 */
export class WebhookScreen extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            webhooks: null,
            error: null,
            info: null,
            busyId: null,
            editing: null,
            deleteConfirm: null,
        };

        this.load = this.load.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    componentDidMount(): void {
        this.load();
    }

    private load() {
        listWebhooks().then((webhooks) => {
            this.setState({webhooks: webhooks, error: null});
        }, (err) => this.handleError(err, gettext('Could not load the webhooks')));
    }

    private handleError(err: unknown, fallback: string) {
        if ((err as {status?: number})?.status === 404) {
            // the API cloaks as 404 when the session expired
            this.props.onSessionExpired();

            return;
        }

        this.setState({error: getAdminErrorMessage(err, fallback), info: null, busyId: null});
    }

    private test(webhook: IWebhook) {
        this.setState({busyId: webhook._id, error: null, info: null});

        testWebhook(webhook._id).then((res) => {
            this.setState({
                busyId: null,
                info: gettext('Test event delivered to {{name}} — the receiver answered HTTP {{status}}', {
                    name: webhook.name || webhook.url,
                    status: res.response_status,
                }),
            });
        }, (err) => this.handleError(
            err,
            gettext('Test delivery to {{name}} failed', {name: webhook.name || webhook.url}),
        ));
    }

    private toggleEnabled(webhook: IWebhook) {
        this.setState({busyId: webhook._id, error: null, info: null});

        patchWebhook(webhook._id, {is_enabled: webhook.is_enabled === false}).then(() => {
            this.setState({busyId: null});
            this.load();
        }, (err) => this.handleError(err, gettext('Could not update the webhook')));
    }

    private delete(webhook: IWebhook) {
        this.setState({busyId: webhook._id, error: null, info: null, deleteConfirm: null});

        deleteWebhook(webhook._id).then(() => {
            this.setState({busyId: null});
            this.load();
        }, (err) => this.handleError(err, gettext('Could not delete the webhook')));
    }

    render(): JSX.Element {
        const {webhooks, error, info} = this.state;

        if (webhooks == null && error == null) {
            return <div>{gettext('Loading...')}</div>;
        }

        return (
            <div>
                {error != null && (
                    <Alert type="alert" size="small" margin="small">{error}</Alert>
                )}
                {info != null && (
                    <Alert type="success" size="small" margin="small">{info}</Alert>
                )}

                <Spacer h gap="8" justifyContent="space-between" noGrow>
                    <h2 style={{fontSize: 18}}>{gettext('Lifecycle webhooks')}</h2>
                    <Button
                        text={gettext('Add webhook')}
                        type="primary"
                        onClick={() => this.setState({editing: 'new'})}
                    />
                </Spacer>

                <p style={{marginBlockStart: 8}}>
                    {gettext(
                        'Every enabled webhook receives all tenant lifecycle events '
                        + '(suspended, activated, deleted, purged), signed with its own secret.',
                    )}
                </p>

                <table style={{width: '100%', marginBlockStart: 12}} data-test-id="webhooks-table">
                    <thead>
                        <tr style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #ddd)'}}>
                            <th style={cellStyle}>{gettext('Name')}</th>
                            <th style={cellStyle}>{gettext('URL')}</th>
                            <th style={cellStyle}>{gettext('State')}</th>
                            <th style={cellStyle}>{gettext('Secret')}</th>
                            <th style={cellStyle}>{gettext('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(webhooks ?? []).map((webhook) => this.renderRow(webhook))}
                    </tbody>
                </table>

                {(webhooks ?? []).length === 0 && (
                    <p style={{padding: 12}}>{gettext('No webhooks configured.')}</p>
                )}

                {this.state.editing != null && (
                    <EditWebhookModal
                        webhook={this.state.editing === 'new' ? null : this.state.editing}
                        onClose={(saved) => {
                            this.setState({editing: null});

                            if (saved) {
                                this.load();
                            }
                        }}
                    />
                )}

                {this.state.deleteConfirm != null && (
                    <Modal
                        visible
                        size="small"
                        position="top"
                        onHide={() => this.setState({deleteConfirm: null})}
                        headerTemplate={gettext('Delete webhook')}
                        data-test-id="delete-webhook-modal"
                    >
                        <Spacer v gap="16">
                            <p>
                                {gettext(
                                    'Delete webhook {{name}}? Queued retries for it are skipped silently.',
                                    {name: this.state.deleteConfirm.name || this.state.deleteConfirm.url},
                                )}
                            </p>
                            <Spacer h gap="8" justifyContent="end" noGrow>
                                <Button
                                    text={gettext('Cancel')}
                                    type="default"
                                    onClick={() => this.setState({deleteConfirm: null})}
                                />
                                <Button
                                    text={gettext('Delete')}
                                    type="alert"
                                    onClick={() => this.delete(this.state.deleteConfirm)}
                                />
                            </Spacer>
                        </Spacer>
                    </Modal>
                )}
            </div>
        );
    }

    private renderRow(webhook: IWebhook): JSX.Element {
        const busy = this.state.busyId === webhook._id;
        const isConfig = webhook._id === CONFIG_WEBHOOK_ID;

        return (
            <tr
                key={webhook._id}
                style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #eee)'}}
            >
                <td style={cellStyle}>
                    <strong>{webhook.name || gettext('(unnamed)')}</strong>
                    {isConfig && (
                        <div style={{opacity: 0.6, fontSize: '0.9em'}}>
                            {gettext('from the server configuration file — read only')}
                        </div>
                    )}
                </td>
                <td style={cellStyle}>{webhook.url}</td>
                <td style={cellStyle}>
                    {webhook.is_enabled === false ? gettext('disabled') : gettext('enabled')}
                </td>
                <td style={cellStyle}>
                    {webhook.has_secret ? gettext('secret is set') : ''}
                </td>
                <td style={cellStyle}>
                    <Spacer h gap="4" noGrow justifyContent="start">
                        <Button
                            text={gettext('Send test event')}
                            size="small"
                            type="default"
                            style="hollow"
                            disabled={busy}
                            onClick={() => this.test(webhook)}
                        />
                        {!isConfig && (
                            <Button
                                text={webhook.is_enabled === false ? gettext('Enable') : gettext('Disable')}
                                size="small"
                                type={webhook.is_enabled === false ? 'primary' : 'warning'}
                                style="hollow"
                                disabled={busy}
                                onClick={() => this.toggleEnabled(webhook)}
                            />
                        )}
                        {!isConfig && (
                            <Button
                                text={gettext('Edit')}
                                size="small"
                                type="default"
                                style="hollow"
                                disabled={busy}
                                onClick={() => this.setState({editing: webhook})}
                            />
                        )}
                        {!isConfig && (
                            <Button
                                text={gettext('Delete')}
                                size="small"
                                type="alert"
                                style="hollow"
                                disabled={busy}
                                onClick={() => this.setState({deleteConfirm: webhook})}
                            />
                        )}
                    </Spacer>
                </td>
            </tr>
        );
    }
}

interface IEditProps {
    webhook: IWebhook | null; // null — creating a new one
    onClose(saved: boolean): void;
}

interface IEditState {
    name: string;
    url: string;
    secret: string; // empty — keep the stored secret (when editing)
    clearSecret: boolean;
    isEnabled: boolean;
    saving: boolean;
    error: string | null;
}

class EditWebhookModal extends React.PureComponent<IEditProps, IEditState> {
    constructor(props: IEditProps) {
        super(props);

        this.state = {
            name: props.webhook?.name ?? '',
            url: props.webhook?.url ?? '',
            secret: '',
            clearSecret: false,
            isEnabled: props.webhook?.is_enabled !== false,
            saving: false,
            error: null,
        };

        this.save = this.save.bind(this);
    }

    private save() {
        const {name, url, secret, clearSecret, isEnabled} = this.state;

        if (url.trim() === '') {
            this.setState({error: gettext('URL is required')});

            return;
        }

        const payload: {url: string; name: string; is_enabled: boolean; secret?: string} = {
            url: url.trim(),
            name: name.trim(),
            is_enabled: isEnabled,
        };

        if (clearSecret) {
            payload.secret = '';
        } else if (secret !== '') {
            payload.secret = secret;
        } // omitted otherwise — keeps the stored secret

        this.setState({saving: true, error: null});

        const request = this.props.webhook == null
            ? createWebhook(payload)
            : patchWebhook(this.props.webhook._id, payload);

        request.then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not save the webhook')),
            });
        });
    }

    render(): JSX.Element {
        const state = this.state;
        const editing = this.props.webhook != null;

        return (
            <Modal
                visible
                size="small"
                position="top"
                onHide={() => this.props.onClose(false)}
                headerTemplate={editing ? gettext('Edit webhook') : gettext('Add webhook')}
                data-test-id="edit-webhook-modal"
            >
                <Spacer v gap="16">
                    {state.error != null && (
                        <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                    )}
                    <Input
                        type="text"
                        label={gettext('Name (optional)')}
                        value={state.name}
                        onChange={(name) => this.setState({name})}
                    />
                    <Input
                        type="text"
                        label={gettext('URL')}
                        placeholder="https://hooks.example.com/tenants"
                        value={state.url}
                        onChange={(url) => this.setState({url})}
                    />
                    <Input
                        type="password"
                        label={gettext('Secret (HMAC-SHA256 signature)')}
                        placeholder={
                            editing && this.props.webhook?.has_secret === true
                                ? gettext('A secret is set — leave empty to keep it')
                                : gettext('Optional')
                        }
                        value={state.secret}
                        onChange={(secret) => this.setState({secret})}
                    />
                    {editing && this.props.webhook?.has_secret === true && (
                        <Checkbox
                            label={{text: gettext('Clear the stored secret')}}
                            checked={state.clearSecret}
                            onChange={(clearSecret) => this.setState({clearSecret})}
                        />
                    )}
                    <Checkbox
                        label={{text: gettext('Enabled')}}
                        checked={state.isEnabled}
                        onChange={(isEnabled) => this.setState({isEnabled})}
                    />
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={state.saving}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={editing ? gettext('Save') : gettext('Add')}
                            type="primary"
                            disabled={state.saving}
                            onClick={this.save}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}
