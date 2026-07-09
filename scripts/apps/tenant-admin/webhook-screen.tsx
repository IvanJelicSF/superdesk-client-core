import React from 'react';
import {Alert, Button, Checkbox, Input} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {IWebhookConfig, getAdminErrorMessage, getWebhook, putWebhook, testWebhook} from './api';

interface IProps {
    onSessionExpired(): void;
}

interface IState {
    config: IWebhookConfig | null;
    url: string;
    secret: string; // empty — keep the stored secret
    clearSecret: boolean;
    saving: boolean;
    testing: boolean;
    error: string | null;
    info: string | null;
}

export class WebhookScreen extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            config: null,
            url: '',
            secret: '',
            clearSecret: false,
            saving: false,
            testing: false,
            error: null,
            info: null,
        };

        this.save = this.save.bind(this);
        this.test = this.test.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    componentDidMount(): void {
        getWebhook().then((config) => {
            this.setState({config: config, url: config.url ?? ''});
        }, (err) => this.handleError(err, gettext('Could not load the webhook configuration')));
    }

    private handleError(err: unknown, fallback: string) {
        if ((err as {status?: number})?.status === 404) {
            // the API cloaks as 404 when the session expired
            this.props.onSessionExpired();

            return;
        }

        this.setState({
            saving: false,
            testing: false,
            error: getAdminErrorMessage(err, fallback),
            info: null,
        });
    }

    private save() {
        const {url, secret, clearSecret} = this.state;
        const payload: {url: string; secret?: string} = {url: url.trim()};

        if (clearSecret) {
            payload.secret = '';
        } else if (secret !== '') {
            payload.secret = secret;
        } // omitted otherwise — keeps the stored secret

        this.setState({saving: true, error: null, info: null});

        putWebhook(payload).then((config) => {
            this.setState({
                config: config,
                url: config.url ?? '',
                secret: '',
                clearSecret: false,
                saving: false,
                info: gettext('Webhook configuration saved'),
            });
        }, (err) => this.handleError(err, gettext('Could not save the webhook configuration')));
    }

    private test() {
        this.setState({testing: true, error: null, info: null});

        testWebhook().then((res) => {
            this.setState({
                testing: false,
                info: gettext('Test event delivered — the receiver answered HTTP {{status}}', {
                    status: res.response_status,
                }),
            });
        }, (err) => this.handleError(err, gettext('Test delivery failed')));
    }

    render(): JSX.Element {
        const state = this.state;

        if (state.config == null && state.error == null) {
            return <div>{gettext('Loading...')}</div>;
        }

        return (
            <div style={{maxWidth: 600}}>
                <h2 style={{fontSize: 18, marginBlockEnd: 12}}>{gettext('Lifecycle webhook')}</h2>

                <p style={{marginBlockEnd: 16}}>
                    {gettext(
                        'Tenant lifecycle events (suspended, activated, deleted, purged) '
                        + 'are delivered to this endpoint.',
                    )}
                </p>

                {state.error != null && (
                    <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                )}
                {state.info != null && (
                    <Alert type="success" size="small" margin="small">{state.info}</Alert>
                )}
                {state.config?.source === 'config' && (
                    <Alert type="highlight" size="small" margin="small">
                        {gettext(
                            'The current value comes from the server configuration file; '
                            + 'saving a URL here overrides it, saving an empty URL falls back to it.',
                        )}
                    </Alert>
                )}

                <Spacer v gap="16">
                    <Input
                        type="text"
                        label={gettext('Webhook URL')}
                        placeholder="https://hooks.example.com/tenants"
                        value={state.url}
                        onChange={(url) => this.setState({url})}
                    />
                    <Input
                        type="password"
                        label={gettext('Secret (HMAC-SHA256 signature)')}
                        placeholder={
                            state.config?.has_secret === true
                                ? gettext('A secret is set — leave empty to keep it')
                                : gettext('Optional')
                        }
                        value={state.secret}
                        onChange={(secret) => this.setState({secret})}
                    />
                    {state.config?.has_secret === true && (
                        <Checkbox
                            label={{text: gettext('Clear the stored secret')}}
                            checked={state.clearSecret}
                            onChange={(clearSecret) => this.setState({clearSecret})}
                        />
                    )}
                    <Spacer h gap="8" justifyContent="start" noGrow>
                        <Button
                            text={gettext('Save')}
                            type="primary"
                            disabled={state.saving}
                            onClick={this.save}
                        />
                        <Button
                            text={gettext('Send test event')}
                            type="default"
                            disabled={state.testing}
                            onClick={this.test}
                        />
                    </Spacer>
                </Spacer>
            </div>
        );
    }
}
