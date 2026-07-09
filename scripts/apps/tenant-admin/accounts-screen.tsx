import React from 'react';
import {Alert, Button, Checkbox, Input, Modal, Option, Select} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {
    IAccount,
    ITenant,
    addUserToTenant,
    createAccount,
    getAdminErrorMessage,
    listAccounts,
    listTenants,
    patchAccount,
} from './api';

const cellStyle: React.CSSProperties = {padding: '8px 12px', textAlign: 'start', verticalAlign: 'top'};

interface IProps {
    onSessionExpired(): void;
}

interface IState {
    accounts: Array<IAccount> | null;
    tenants: Array<ITenant>; // for the "add user to tenant" select
    error: string | null;
    createOpen: boolean;
    editAccount: IAccount | null;
    addUserAccount: IAccount | null;
}

export class AccountsScreen extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            accounts: null,
            tenants: [],
            error: null,
            createOpen: false,
            editAccount: null,
            addUserAccount: null,
        };

        this.load = this.load.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    componentDidMount(): void {
        this.load();

        listTenants().then((tenants) => {
            this.setState({tenants: tenants.filter((tenant) => tenant.status === 'active')});
        }, () => {
            // tenant list is only needed for the "add user" select; ignore failures here
        });
    }

    private load() {
        listAccounts().then((accounts) => {
            this.setState({accounts: accounts, error: null});
        }, (err) => this.handleError(err, gettext('Could not load accounts')));
    }

    private handleError(err: unknown, fallback: string) {
        if ((err as {status?: number})?.status === 404) {
            // the API cloaks as 404 when the session expired
            this.props.onSessionExpired();

            return;
        }

        this.setState({error: getAdminErrorMessage(err, fallback)});
    }

    private renderFlags(account: IAccount): string {
        const flags: Array<string> = [];

        if (account.is_enabled === false) {
            flags.push(gettext('disabled'));
        }

        if (account.is_super_admin === true) {
            flags.push(gettext('super admin'));
        }

        if (account.needs_password_reset === true) {
            flags.push(gettext('needs password reset'));
        }

        return flags.join(', ');
    }

    render(): JSX.Element {
        const {accounts, error} = this.state;

        if (accounts == null && error == null) {
            return <div>{gettext('Loading...')}</div>;
        }

        return (
            <div>
                {error != null && (
                    <Alert type="alert" size="small" margin="small">{error}</Alert>
                )}

                <Spacer h gap="8" justifyContent="space-between" noGrow>
                    <h2 style={{fontSize: 18}}>{gettext('Accounts')}</h2>
                    <Button
                        text={gettext('Create account')}
                        type="primary"
                        onClick={() => this.setState({createOpen: true})}
                    />
                </Spacer>

                <table style={{width: '100%', marginBlockStart: 12}} data-test-id="accounts-table">
                    <thead>
                        <tr style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #ddd)'}}>
                            <th style={cellStyle}>{gettext('Email')}</th>
                            <th style={cellStyle}>{gettext('Username')}</th>
                            <th style={cellStyle}>{gettext('Flags')}</th>
                            <th style={cellStyle}>{gettext('Tenants')}</th>
                            <th style={cellStyle}>{gettext('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(accounts ?? []).map((account) => (
                            <tr
                                key={account.email}
                                style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #eee)'}}
                            >
                                <td style={cellStyle}><strong>{account.email}</strong></td>
                                <td style={cellStyle}>{account.username ?? ''}</td>
                                <td style={cellStyle}>{this.renderFlags(account)}</td>
                                <td style={cellStyle}>{(account.tenants ?? []).join(', ')}</td>
                                <td style={cellStyle}>
                                    <Spacer h gap="4" noGrow justifyContent="start">
                                        <Button
                                            text={gettext('Edit')}
                                            size="small"
                                            type="default"
                                            style="hollow"
                                            onClick={() => this.setState({editAccount: account})}
                                        />
                                        <Button
                                            text={gettext('Add user to tenant')}
                                            size="small"
                                            type="default"
                                            style="hollow"
                                            onClick={() => this.setState({addUserAccount: account})}
                                        />
                                    </Spacer>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {(accounts ?? []).length === 0 && (
                    <p style={{padding: 12}}>{gettext('No accounts yet.')}</p>
                )}

                {this.state.createOpen && (
                    <CreateAccountModal
                        onClose={(created) => {
                            this.setState({createOpen: false});

                            if (created) {
                                this.load();
                            }
                        }}
                    />
                )}

                {this.state.editAccount != null && (
                    <EditAccountModal
                        account={this.state.editAccount}
                        onClose={(saved) => {
                            this.setState({editAccount: null});

                            if (saved) {
                                this.load();
                            }
                        }}
                    />
                )}

                {this.state.addUserAccount != null && (
                    <AddUserToTenantModal
                        account={this.state.addUserAccount}
                        tenants={this.state.tenants}
                        onClose={(added) => {
                            this.setState({addUserAccount: null});

                            if (added) {
                                this.load();
                            }
                        }}
                    />
                )}
            </div>
        );
    }
}

interface ICreateProps {
    onClose(created: boolean): void;
}

interface ICreateState {
    email: string;
    username: string;
    password: string;
    isSuperAdmin: boolean;
    saving: boolean;
    error: string | null;
}

class CreateAccountModal extends React.PureComponent<ICreateProps, ICreateState> {
    constructor(props: ICreateProps) {
        super(props);

        this.state = {
            email: '',
            username: '',
            password: '',
            isSuperAdmin: false,
            saving: false,
            error: null,
        };

        this.create = this.create.bind(this);
    }

    private create() {
        const {email, username, password, isSuperAdmin} = this.state;

        if (email.trim() === '' || password === '') {
            this.setState({error: gettext('Email and password are required')});

            return;
        }

        this.setState({saving: true, error: null});

        createAccount({
            email: email.trim(),
            password: password,
            username: username.trim() === '' ? undefined : username.trim(),
            is_super_admin: isSuperAdmin,
        }).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not create the account')),
            });
        });
    }

    render(): JSX.Element {
        const state = this.state;

        return (
            <Modal
                visible
                size="small"
                position="top"
                onHide={() => this.props.onClose(false)}
                headerTemplate={gettext('Create account')}
                data-test-id="create-account-modal"
            >
                <Spacer v gap="16">
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
                        type="text"
                        label={gettext('Username (optional)')}
                        value={state.username}
                        onChange={(username) => this.setState({username})}
                    />
                    <Input
                        type="password"
                        label={gettext('Password')}
                        value={state.password}
                        onChange={(password) => this.setState({password})}
                    />
                    <Checkbox
                        label={{text: gettext('Super admin (may manage tenants)')}}
                        checked={state.isSuperAdmin}
                        onChange={(isSuperAdmin) => this.setState({isSuperAdmin})}
                    />
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={state.saving}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={gettext('Create')}
                            type="primary"
                            disabled={state.saving}
                            onClick={this.create}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}

interface IEditProps {
    account: IAccount;
    onClose(saved: boolean): void;
}

interface IEditState {
    isEnabled: boolean;
    isSuperAdmin: boolean;
    needsPasswordReset: boolean;
    password: string; // empty — keep current
    saving: boolean;
    error: string | null;
}

class EditAccountModal extends React.PureComponent<IEditProps, IEditState> {
    constructor(props: IEditProps) {
        super(props);

        this.state = {
            isEnabled: props.account.is_enabled !== false,
            isSuperAdmin: props.account.is_super_admin === true,
            needsPasswordReset: props.account.needs_password_reset === true,
            password: '',
            saving: false,
            error: null,
        };

        this.save = this.save.bind(this);
    }

    private save() {
        const {isEnabled, isSuperAdmin, needsPasswordReset, password} = this.state;

        this.setState({saving: true, error: null});

        patchAccount(this.props.account.email, {
            is_enabled: isEnabled,
            is_super_admin: isSuperAdmin,
            needs_password_reset: needsPasswordReset,
            ...(password === '' ? {} : {password}),
        }).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not update the account')),
            });
        });
    }

    render(): JSX.Element {
        const state = this.state;

        return (
            <Modal
                visible
                size="small"
                position="top"
                onHide={() => this.props.onClose(false)}
                headerTemplate={gettext('Edit account {{email}}', {email: this.props.account.email})}
                data-test-id="edit-account-modal"
            >
                <Spacer v gap="16">
                    {state.error != null && (
                        <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                    )}
                    <Checkbox
                        label={{text: gettext('Enabled')}}
                        checked={state.isEnabled}
                        onChange={(isEnabled) => this.setState({isEnabled})}
                    />
                    <Checkbox
                        label={{text: gettext('Super admin (may manage tenants)')}}
                        checked={state.isSuperAdmin}
                        onChange={(isSuperAdmin) => this.setState({isSuperAdmin})}
                    />
                    <Checkbox
                        label={{text: gettext('Require password reset on next login')}}
                        checked={state.needsPasswordReset}
                        onChange={(needsPasswordReset) => this.setState({needsPasswordReset})}
                    />
                    <Input
                        type="password"
                        label={gettext('New password (leave empty to keep the current one)')}
                        value={state.password}
                        onChange={(password) => this.setState({password})}
                    />
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={state.saving}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={gettext('Save')}
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

interface IAddUserProps {
    account: IAccount;
    tenants: Array<ITenant>;
    onClose(added: boolean): void;
}

interface IAddUserState {
    tenant: string;
    username: string;
    password: string;
    admin: boolean;
    saving: boolean;
    error: string | null;
}

class AddUserToTenantModal extends React.PureComponent<IAddUserProps, IAddUserState> {
    constructor(props: IAddUserProps) {
        super(props);

        this.state = {
            tenant: '',
            username: props.account.username ?? '',
            password: '',
            admin: false,
            saving: false,
            error: null,
        };

        this.add = this.add.bind(this);
    }

    private add() {
        const {tenant, username, password, admin} = this.state;

        if (tenant === '' || username.trim() === '' || password === '') {
            this.setState({error: gettext('Tenant, username and password are required')});

            return;
        }

        this.setState({saving: true, error: null});

        addUserToTenant(tenant, {
            username: username.trim(),
            password: password,
            email: this.props.account.email,
            admin: admin,
        }).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not add the user to the tenant')),
            });
        });
    }

    render(): JSX.Element {
        const state = this.state;
        const alreadyOn = this.props.account.tenants ?? [];

        return (
            <Modal
                visible
                size="small"
                position="top"
                onHide={() => this.props.onClose(false)}
                headerTemplate={gettext('Add {{email}} to a tenant', {email: this.props.account.email})}
                data-test-id="add-user-to-tenant-modal"
            >
                <Spacer v gap="16">
                    {state.error != null && (
                        <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                    )}
                    <Select
                        label={gettext('Tenant')}
                        value={state.tenant}
                        onChange={(tenant) => this.setState({tenant})}
                    >
                        <Option value="" />
                        {this.props.tenants.map((tenant) => {
                            const label = (tenant.name || tenant.slug) === tenant.slug
                                ? tenant.slug
                                : `${tenant.name} (${tenant.slug})`;

                            return (
                                <Option key={tenant.slug} value={tenant.slug}>
                                    {
                                        alreadyOn.includes(tenant.slug)
                                            ? gettext('{{tenant}} (already has a user)', {tenant: label})
                                            : label
                                    }
                                </Option>
                            );
                        })}
                    </Select>
                    <Input
                        type="text"
                        label={gettext('Username')}
                        value={state.username}
                        onChange={(username) => this.setState({username})}
                    />
                    <Input
                        type="password"
                        label={gettext('Password')}
                        value={state.password}
                        onChange={(password) => this.setState({password})}
                    />
                    <Checkbox
                        label={{text: gettext('Administrator of the tenant')}}
                        checked={state.admin}
                        onChange={(admin) => this.setState({admin})}
                    />
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={state.saving}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={gettext('Add user')}
                            type="primary"
                            disabled={state.saving}
                            onClick={this.add}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}
