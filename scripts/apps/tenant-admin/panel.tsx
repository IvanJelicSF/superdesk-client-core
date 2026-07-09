import React from 'react';
import {Alert, Button, Input} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {adminGetMe, adminLogin, adminLogout} from './api';
import {TenantsScreen} from './tenants-screen';
import {AccountsScreen} from './accounts-screen';
import {WebhookScreen} from './webhook-screen';

type ITab = 'tenants' | 'accounts' | 'webhook';

interface IState {
    session: 'pending' | 'anonymous' | 'authenticated';
    email: string | null;
    activeTab: ITab;
}

/**
 * The tenant administration panel — a standalone view of the client served on
 * the reserved admin host (`client_config.tenant_admin_url`). It has its own
 * session (`POST /tenant-admin/login`); the tenant session does not carry over.
 */
export class TenantAdminPanel extends React.PureComponent<{}, IState> {
    constructor(props: {}) {
        super(props);

        this.state = {
            session: 'pending',
            email: null,
            activeTab: 'tenants',
        };

        this.logout = this.logout.bind(this);
        this.onSessionExpired = this.onSessionExpired.bind(this);
    }

    componentDidMount(): void {
        // session restore; 404 means not logged in (the API cloaks as 404)
        adminGetMe().then((me) => {
            this.setState({session: 'authenticated', email: me.email ?? null});
        }, () => {
            this.setState({session: 'anonymous'});
        });
    }

    private logout() {
        adminLogout().finally(() => {
            this.setState({session: 'anonymous', email: null});
        });
    }

    private onSessionExpired() {
        this.setState({session: 'anonymous', email: null});
    }

    render(): JSX.Element {
        const {session, activeTab} = this.state;

        if (session === 'pending') {
            return <div style={{padding: 40}}>{gettext('Loading...')}</div>;
        }

        if (session === 'anonymous') {
            return (
                <AdminLogin
                    onLogin={(email) => {
                        this.setState({session: 'authenticated', email: email});
                    }}
                />
            );
        }

        const tabs: Array<{id: ITab; label: string}> = [
            {id: 'tenants', label: gettext('Tenants')},
            {id: 'accounts', label: gettext('Accounts')},
            {id: 'webhook', label: gettext('Webhook')},
        ];

        return (
            <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 20px',
                        background: 'var(--sd-colour-bg--02, #2c2d2e)',
                        color: '#fff',
                    }}
                    data-test-id="tenant-admin-header"
                >
                    <Spacer h gap="16" noGrow justifyContent="start" alignItems="center">
                        <strong>{gettext('Superdesk — Tenant administration')}</strong>
                        <nav>
                            <Spacer h gap="8" noGrow justifyContent="start">
                                {tabs.map((tab) => (
                                    <Button
                                        key={tab.id}
                                        text={tab.label}
                                        theme="dark"
                                        type={activeTab === tab.id ? 'primary' : 'default'}
                                        style={activeTab === tab.id ? 'filled' : 'text-only'}
                                        onClick={() => this.setState({activeTab: tab.id})}
                                    />
                                ))}
                            </Spacer>
                        </nav>
                    </Spacer>
                    <Spacer h gap="16" noGrow justifyContent="end" alignItems="center">
                        <span>{this.state.email}</span>
                        <Button
                            text={gettext('Sign out')}
                            theme="dark"
                            type="default"
                            style="hollow"
                            onClick={this.logout}
                        />
                    </Spacer>
                </div>

                <div style={{flexGrow: 1, padding: 20}}>
                    {activeTab === 'tenants' && <TenantsScreen onSessionExpired={this.onSessionExpired} />}
                    {activeTab === 'accounts' && <AccountsScreen onSessionExpired={this.onSessionExpired} />}
                    {activeTab === 'webhook' && <WebhookScreen onSessionExpired={this.onSessionExpired} />}
                </div>
            </div>
        );
    }
}

interface ILoginProps {
    onLogin(email: string): void;
}

interface ILoginState {
    email: string;
    password: string;
    inProgress: boolean;
    error: string | null;
}

class AdminLogin extends React.PureComponent<ILoginProps, ILoginState> {
    constructor(props: ILoginProps) {
        super(props);

        this.state = {
            email: '',
            password: '',
            inProgress: false,
            error: null,
        };

        this.login = this.login.bind(this);
    }

    /**
     * The response classes mean different things and must not be collapsed:
     * 401 — bad credentials or missing super-admin rights (indistinguishable
     * by design); 404 — the admin API guard failed (wrong host, multi-tenancy
     * or shared accounts off) — a configuration problem, not a credentials
     * one; anything else — the request did not reach the API (proxy issue).
     */
    private static errorMessage(err: {status?: number}): string {
        switch (err?.status) {
            case 401:
                return gettext('Invalid credentials or missing administration rights.');
            case 404:
                return gettext(
                    'The tenant administration API is not available on this host. '
                + 'Check the deployment configuration (TENANT_ADMIN_HOST / tenant_admin_url, '
                + 'multi-tenancy and shared accounts must be enabled).',
                );
            case 0:
                return gettext(
                    'Could not reach the tenant administration API — '
                + 'check the network and the proxy configuration.',
                );
            default:
                return gettext(
                    'Unexpected response from the tenant administration API (HTTP {{status}}) — '
                + 'the proxy in front of it may be misconfigured.',
                    {status: err?.status ?? '?'},
                );
        }
    }

    private login() {
        const {email, password} = this.state;

        if (email.trim() === '' || password === '') {
            return;
        }

        this.setState({inProgress: true, error: null});

        adminLogin(email.trim(), password).then((res) => {
            this.props.onLogin(res.email ?? email.trim());
        }, (err) => {
            this.setState({inProgress: false, error: AdminLogin.errorMessage(err)});
        });
    }

    render(): JSX.Element {
        const state = this.state;

        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <form
                    style={{width: 360}}
                    data-test-id="tenant-admin-login"
                    onSubmit={(event) => {
                        event.preventDefault();
                        this.login();
                    }}
                >
                    <Spacer v gap="16">
                        <h1 style={{fontSize: 22}}>{gettext('Tenant administration')}</h1>
                        <p>{gettext('Sign in with your super-admin account credentials.')}</p>
                        {state.error != null && (
                            <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                        )}
                        <Input
                            type="text"
                            label={gettext('Email')}
                            value={state.email}
                            onChange={(email) => this.setState({email})}
                        />
                        <Input
                            type="password"
                            label={gettext('Password')}
                            value={state.password}
                            onChange={(password) => this.setState({password})}
                        />
                        <Button
                            text={gettext('Sign in')}
                            type="primary"
                            expand
                            disabled={state.inProgress}
                            onClick={this.login}
                        />
                    </Spacer>
                </form>
            </div>
        );
    }
}
