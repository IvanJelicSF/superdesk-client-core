import React from 'react';
import {Alert, Button, Checkbox, Input, Modal, Option, Select} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {
    IExchangePartner,
    ITenant,
    createTenant,
    deleteTenant,
    getAdminErrorMessage,
    listTenants,
    patchTenant,
} from './api';

const cellStyle: React.CSSProperties = {padding: '8px 12px', textAlign: 'start', verticalAlign: 'top'};

interface IProps {
    onSessionExpired(): void;
}

interface IState {
    tenants: Array<ITenant> | null;
    error: string | null;
    busySlug: string | null; // slug with an action in progress
    createOpen: boolean;
    partnersFor: ITenant | null; // tenant whose partners are being edited
    editFor: ITenant | null; // tenant whose name/description are being edited
    deleteConfirm: ITenant | null;
}

/** Display name; the server guarantees name is never empty, this is belt-and-braces. */
function tenantLabel(tenant: ITenant): string {
    return tenant.name || tenant.slug;
}

export class TenantsScreen extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            tenants: null,
            error: null,
            busySlug: null,
            createOpen: false,
            partnersFor: null,
            editFor: null,
            deleteConfirm: null,
        };

        this.load = this.load.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    componentDidMount(): void {
        this.load();
    }

    private load() {
        listTenants().then((tenants) => {
            this.setState({tenants: tenants, error: null});
        }, (err) => this.handleError(err, gettext('Could not load tenants')));
    }

    private handleError(err: unknown, fallback: string) {
        if ((err as {status?: number})?.status === 404) {
            // the API cloaks as 404 when the session expired
            this.props.onSessionExpired();

            return;
        }

        this.setState({error: getAdminErrorMessage(err, fallback), busySlug: null});
    }

    private patchStatus(tenant: ITenant, status: 'active' | 'suspended') {
        this.setState({busySlug: tenant.slug, error: null});

        patchTenant(tenant.slug, {status}).then(() => {
            this.setState({busySlug: null});
            this.load();
        }, (err) => this.handleError(err, gettext('Could not update tenant {{tenant}}', {tenant: tenant.slug})));
    }

    private delete(tenant: ITenant) {
        this.setState({busySlug: tenant.slug, error: null, deleteConfirm: null});

        deleteTenant(tenant.slug).then(() => {
            this.setState({busySlug: null});
            this.load();
        }, (err) => this.handleError(err, gettext('Could not delete tenant {{tenant}}', {tenant: tenant.slug})));
    }

    private resumeProvisioning(tenant: ITenant) {
        this.setState({busySlug: tenant.slug, error: null});

        createTenant({slug: tenant.slug, hosts: tenant.hosts, resume: true}).then(() => {
            this.setState({busySlug: null});
            this.load();
        }, (err) => this.handleError(
            err,
            gettext('Could not resume provisioning of {{tenant}}', {tenant: tenant.slug}),
        ));
    }

    private renderStatus(tenant: ITenant): JSX.Element {
        if (tenant.status === 'deleted') {
            if (tenant.purged_at != null) {
                return <span>{gettext('deleted — purged on {{date}}', {date: tenant.purged_at})}</span>;
            }

            return (
                <span>
                    {gettext(
                        'deleted on {{date}} — purges automatically after the retention period',
                        {date: tenant.deleted_at ?? ''},
                    )}
                </span>
            );
        }

        return <span>{tenant.status}</span>;
    }

    private renderActions(tenant: ITenant): JSX.Element {
        const busy = this.state.busySlug === tenant.slug;

        return (
            <Spacer h gap="4" noGrow justifyContent="start">
                {tenant.status === 'active' && (
                    <Button
                        text={gettext('Suspend')}
                        size="small"
                        type="warning"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.patchStatus(tenant, 'suspended')}
                    />
                )}
                {tenant.status === 'suspended' && (
                    <Button
                        text={gettext('Activate')}
                        size="small"
                        type="primary"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.patchStatus(tenant, 'active')}
                    />
                )}
                {tenant.status === 'suspended' && (
                    <Button
                        text={gettext('Delete')}
                        size="small"
                        type="alert"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.setState({deleteConfirm: tenant})}
                    />
                )}
                {tenant.status === 'deleted' && tenant.purged_at == null && (
                    <Button
                        text={gettext('Restore')}
                        size="small"
                        type="primary"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.patchStatus(tenant, 'active')}
                    />
                )}
                {tenant.status === 'creating' && (
                    <Button
                        text={gettext('Resume provisioning')}
                        size="small"
                        type="primary"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.resumeProvisioning(tenant)}
                    />
                )}
                {tenant.status !== 'deleted' && (
                    <Button
                        text={gettext('Edit')}
                        size="small"
                        type="default"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.setState({editFor: tenant})}
                    />
                )}
                {tenant.status !== 'deleted' && (
                    <Button
                        text={gettext('Partners')}
                        size="small"
                        type="default"
                        style="hollow"
                        disabled={busy}
                        onClick={() => this.setState({partnersFor: tenant})}
                    />
                )}
            </Spacer>
        );
    }

    render(): JSX.Element {
        const {tenants, error} = this.state;

        if (tenants == null && error == null) {
            return <div>{gettext('Loading...')}</div>;
        }

        return (
            <div>
                {error != null && (
                    <Alert type="alert" size="small" margin="small">{error}</Alert>
                )}

                <Spacer h gap="8" justifyContent="space-between" noGrow>
                    <h2 style={{fontSize: 18}}>{gettext('Tenants')}</h2>
                    <Button
                        text={gettext('Create tenant')}
                        type="primary"
                        onClick={() => this.setState({createOpen: true})}
                    />
                </Spacer>

                <table style={{width: '100%', marginBlockStart: 12}} data-test-id="tenants-table">
                    <thead>
                        <tr style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #ddd)'}}>
                            <th style={cellStyle}>{gettext('Tenant')}</th>
                            <th style={cellStyle}>{gettext('Status')}</th>
                            <th style={cellStyle}>{gettext('Hosts')}</th>
                            <th style={cellStyle}>{gettext('Exchange partners')}</th>
                            <th style={cellStyle}>{gettext('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(tenants ?? []).map((tenant) => (
                            <tr
                                key={tenant.slug}
                                style={{borderBlockEnd: '1px solid var(--sd-colour-line--light, #eee)'}}
                            >
                                <td style={cellStyle}>
                                    <strong>{tenantLabel(tenant)}</strong>
                                    {tenantLabel(tenant) !== tenant.slug && (
                                        <div style={{opacity: 0.6, fontSize: '0.9em'}}>{tenant.slug}</div>
                                    )}
                                    {(tenant.description ?? '') !== '' && (
                                        <div style={{opacity: 0.75}}>{tenant.description}</div>
                                    )}
                                </td>
                                <td style={cellStyle}>{this.renderStatus(tenant)}</td>
                                <td style={cellStyle}>{(tenant.hosts ?? []).join(', ')}</td>
                                <td style={cellStyle}>
                                    {(tenant.exchange_partners ?? [])
                                        .map((p) => `${p.tenant} (${p.direction ?? 'both'})`)
                                        .join(', ')}
                                </td>
                                <td style={cellStyle}>{this.renderActions(tenant)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {(tenants ?? []).length === 0 && (
                    <p style={{padding: 12}}>{gettext('No tenants yet.')}</p>
                )}

                {this.state.createOpen && (
                    <CreateTenantModal
                        onClose={(created) => {
                            this.setState({createOpen: false});

                            if (created) {
                                this.load();
                            }
                        }}
                    />
                )}

                {this.state.editFor != null && (
                    <EditTenantModal
                        tenant={this.state.editFor}
                        onClose={(saved) => {
                            this.setState({editFor: null});

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
                        headerTemplate={gettext('Delete tenant')}
                        data-test-id="delete-tenant-modal"
                    >
                        <Spacer v gap="16">
                            <p>
                                {gettext(
                                    'Delete tenant {{tenant}}? Its hosts stop answering immediately; '
                                    + 'data is kept for a retention period during which '
                                    + 'the tenant can be restored.',
                                    {tenant: tenantLabel(this.state.deleteConfirm)},
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

                {this.state.partnersFor != null && (
                    <PartnersModal
                        tenant={this.state.partnersFor}
                        allTenants={tenants ?? []}
                        onClose={(saved) => {
                            this.setState({partnersFor: null});

                            if (saved) {
                                this.load();
                            }
                        }}
                    />
                )}
            </div>
        );
    }
}

interface IEditTenantProps {
    tenant: ITenant;
    onClose(saved: boolean): void;
}

interface IEditTenantState {
    name: string;
    description: string;
    saving: boolean;
    error: string | null;
}

/**
 * Edits the cosmetic metadata — the slug is immutable. Only changed fields
 * are sent; clearing the name sends "" which resets to the slug fallback.
 */
class EditTenantModal extends React.PureComponent<IEditTenantProps, IEditTenantState> {
    constructor(props: IEditTenantProps) {
        super(props);

        this.state = {
            name: props.tenant.name ?? '',
            description: props.tenant.description ?? '',
            saving: false,
            error: null,
        };

        this.save = this.save.bind(this);
    }

    private save() {
        const payload: {name?: string; description?: string} = {};

        if (this.state.name !== (this.props.tenant.name ?? '')) {
            payload.name = this.state.name.trim();
        }

        if (this.state.description !== (this.props.tenant.description ?? '')) {
            payload.description = this.state.description.trim();
        }

        if (Object.keys(payload).length < 1) {
            this.props.onClose(false);

            return;
        }

        this.setState({saving: true, error: null});

        patchTenant(this.props.tenant.slug, payload).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not update the tenant')),
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
                headerTemplate={gettext('Edit tenant {{tenant}}', {tenant: this.props.tenant.slug})}
                data-test-id="edit-tenant-modal"
            >
                <Spacer v gap="16">
                    {state.error != null && (
                        <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                    )}
                    <Input
                        type="text"
                        label={gettext('Display name')}
                        placeholder={this.props.tenant.slug}
                        value={state.name}
                        onChange={(name) => this.setState({name})}
                    />
                    <Input
                        type="text"
                        label={gettext('Description')}
                        value={state.description}
                        onChange={(description) => this.setState({description})}
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

interface ICreateProps {
    onClose(created: boolean): void;
}

interface ICreateState {
    slug: string;
    name: string;
    description: string;
    hosts: string; // comma-separated
    withAdmin: boolean;
    adminUsername: string;
    adminPassword: string;
    adminEmail: string;
    resume: boolean;
    inProgress: boolean;
    error: string | null;
    conflict: boolean; // 409 — offer resume
}

class CreateTenantModal extends React.PureComponent<ICreateProps, ICreateState> {
    constructor(props: ICreateProps) {
        super(props);

        this.state = {
            slug: '',
            name: '',
            description: '',
            hosts: '',
            withAdmin: false,
            adminUsername: '',
            adminPassword: '',
            adminEmail: '',
            resume: false,
            inProgress: false,
            error: null,
            conflict: false,
        };

        this.create = this.create.bind(this);
    }

    private create() {
        const {slug, name, description, hosts, withAdmin, adminUsername, adminPassword, adminEmail, resume}
            = this.state;
        const hostsList = hosts.split(',').map((host) => host.trim()).filter((host) => host.length > 0);

        if (!/^[a-z][a-z0-9-]{0,61}$/.test(slug)) {
            this.setState({error: gettext(
                'Invalid slug: lowercase letters, digits and dashes only, starting with a letter',
            )});

            return;
        }

        if (hostsList.length < 1) {
            this.setState({error: gettext('At least one host is required')});

            return;
        }

        this.setState({inProgress: true, error: null, conflict: false});

        createTenant({
            slug: slug,
            name: name.trim() === '' ? undefined : name.trim(), // server falls back to the slug
            description: description.trim() === '' ? undefined : description.trim(),
            hosts: hostsList,
            admin: withAdmin
                ? {username: adminUsername, password: adminPassword, email: adminEmail}
                : undefined,
            resume: resume,
        }).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                inProgress: false,
                conflict: (err as {status?: number})?.status === 409,
                error: getAdminErrorMessage(
                    err,
                    (err as {status?: number})?.status === 409
                        ? gettext('Tenant already exists — enable "resume" to continue provisioning it')
                        : gettext('Could not create the tenant'),
                ),
            });
        });
    }

    render(): JSX.Element {
        const state = this.state;

        return (
            <Modal
                visible
                size="medium"
                position="top"
                onHide={() => {
                    if (!state.inProgress) {
                        this.props.onClose(false);
                    }
                }}
                headerTemplate={gettext('Create tenant')}
                data-test-id="create-tenant-modal"
            >
                <Spacer v gap="16">
                    {state.error != null && (
                        <Alert type="alert" size="small" margin="small">{state.error}</Alert>
                    )}
                    {state.inProgress && (
                        <Alert type="highlight" size="small" margin="small">
                            {gettext('Provisioning in progress — this can take a while...')}
                        </Alert>
                    )}
                    <Input
                        type="text"
                        label={gettext('Slug')}
                        placeholder="tenant-a"
                        value={state.slug}
                        onChange={(slug) => this.setState({slug})}
                    />
                    <Input
                        type="text"
                        label={gettext('Display name (optional)')}
                        placeholder={state.slug === '' ? gettext('Defaults to the slug') : state.slug}
                        value={state.name}
                        onChange={(name) => this.setState({name})}
                    />
                    <Input
                        type="text"
                        label={gettext('Description (optional)')}
                        value={state.description}
                        onChange={(description) => this.setState({description})}
                    />
                    <Input
                        type="text"
                        label={gettext('Hosts (comma-separated)')}
                        placeholder="tenant-a.example.com"
                        value={state.hosts}
                        onChange={(hosts) => this.setState({hosts})}
                    />
                    <Checkbox
                        label={{text: gettext('Create an initial admin user')}}
                        checked={state.withAdmin}
                        onChange={(withAdmin) => this.setState({withAdmin})}
                    />
                    {state.withAdmin && (
                        <Spacer v gap="16">
                            <Input
                                type="text"
                                label={gettext('Admin username')}
                                value={state.adminUsername}
                                onChange={(adminUsername) => this.setState({adminUsername})}
                            />
                            <Input
                                type="password"
                                label={gettext('Admin password')}
                                value={state.adminPassword}
                                onChange={(adminPassword) => this.setState({adminPassword})}
                            />
                            <Input
                                type="text"
                                label={gettext('Admin email')}
                                value={state.adminEmail}
                                onChange={(adminEmail) => this.setState({adminEmail})}
                            />
                        </Spacer>
                    )}
                    {state.conflict && (
                        <Checkbox
                            label={{text: gettext('Resume provisioning of the existing tenant')}}
                            checked={state.resume}
                            onChange={(resume) => this.setState({resume})}
                        />
                    )}
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={state.inProgress}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={gettext('Create')}
                            type="primary"
                            disabled={state.inProgress}
                            onClick={this.create}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}

interface IPartnersProps {
    tenant: ITenant;
    allTenants: Array<ITenant>;
    onClose(saved: boolean): void;
}

interface IPartnersState {
    partners: Array<IExchangePartner>;
    copyMedia: boolean;
    saving: boolean;
    error: string | null;
}

class PartnersModal extends React.PureComponent<IPartnersProps, IPartnersState> {
    constructor(props: IPartnersProps) {
        super(props);

        this.state = {
            partners: (props.tenant.exchange_partners ?? []).map((p) => ({
                tenant: p.tenant,
                direction: p.direction ?? 'both',
            })),
            copyMedia: props.tenant.exchange_copy_media !== false, // default on
            saving: false,
            error: null,
        };

        this.save = this.save.bind(this);
    }

    private save() {
        this.setState({saving: true, error: null});

        const payload: {exchange_partners: Array<IExchangePartner>; exchange_copy_media?: boolean} = {
            exchange_partners: this.state.partners,
        };

        if (this.state.copyMedia !== (this.props.tenant.exchange_copy_media !== false)) {
            payload.exchange_copy_media = this.state.copyMedia;
        }

        patchTenant(this.props.tenant.slug, payload).then(() => {
            this.props.onClose(true);
        }, (err) => {
            this.setState({
                saving: false,
                error: getAdminErrorMessage(err, gettext('Could not save exchange partners')),
            });
        });
    }

    render(): JSX.Element {
        const {partners, saving, error} = this.state;
        const availableTenants = this.props.allTenants
            .filter((tenant) => tenant.slug !== this.props.tenant.slug && tenant.status !== 'deleted');

        return (
            <Modal
                visible
                size="medium"
                position="top"
                onHide={() => this.props.onClose(false)}
                headerTemplate={gettext('Exchange partners of {{tenant}}', {tenant: tenantLabel(this.props.tenant)})}
                data-test-id="partners-modal"
            >
                <Spacer v gap="16">
                    {error != null && (
                        <Alert type="alert" size="small" margin="small">{error}</Alert>
                    )}
                    {partners.map((partner, index) => (
                        <Spacer h gap="8" key={index} noGrow justifyContent="start" alignItems="end">
                            <Select
                                label={gettext('Tenant')}
                                value={partner.tenant}
                                onChange={(value) => {
                                    const next = [...partners];

                                    next[index] = {...partner, tenant: value};
                                    this.setState({partners: next});
                                }}
                            >
                                <Option value="" />
                                {availableTenants.map((tenant) => (
                                    <Option key={tenant.slug} value={tenant.slug}>
                                        {
                                            tenantLabel(tenant) === tenant.slug
                                                ? tenant.slug
                                                : `${tenantLabel(tenant)} (${tenant.slug})`
                                        }
                                    </Option>
                                ))}
                            </Select>
                            <Select
                                label={gettext('Direction')}
                                value={partner.direction}
                                onChange={(value) => {
                                    const next = [...partners];

                                    next[index] = {...partner, direction: value as IExchangePartner['direction']};
                                    this.setState({partners: next});
                                }}
                            >
                                <Option value="send">{gettext('send')}</Option>
                                <Option value="receive">{gettext('receive')}</Option>
                                <Option value="both">{gettext('both')}</Option>
                            </Select>
                            <Button
                                text={gettext('Remove')}
                                type="alert"
                                style="hollow"
                                onClick={() => {
                                    this.setState({partners: partners.filter((_p, i) => i !== index)});
                                }}
                            />
                        </Spacer>
                    ))}
                    <div>
                        <Button
                            text={gettext('Add partner')}
                            type="default"
                            onClick={() => {
                                this.setState({partners: [...partners, {tenant: '', direction: 'both'}]});
                            }}
                        />
                    </div>
                    <Checkbox
                        label={{text: gettext('Copy media')}}
                        checked={this.state.copyMedia}
                        onChange={(copyMedia) => this.setState({copyMedia})}
                    />
                    {!this.state.copyMedia && (
                        <Alert type="warning" size="small" margin="small">
                            {gettext(
                                'Exchanged items will keep the source tenant\'s media URLs — '
                                + 'the source media must be reachable by this tenant\'s users '
                                + '(e.g. served publicly or via a CDN). With "Copy media" on, '
                                + 'pictures, audio and video are copied into this tenant\'s storage.',
                            )}
                        </Alert>
                    )}
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            text={gettext('Cancel')}
                            type="default"
                            disabled={saving}
                            onClick={() => this.props.onClose(false)}
                        />
                        <Button
                            text={gettext('Save')}
                            type="primary"
                            disabled={saving || partners.some((partner) => partner.tenant === '')}
                            onClick={this.save}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}
