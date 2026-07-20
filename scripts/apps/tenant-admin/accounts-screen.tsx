import React from 'react';
import {
    Alert,
    BoxedList,
    BoxedListItem,
    Button,
    ButtonGroup,
    Checkbox,
    Input,
    Modal,
    MultiSelect,
    Option,
    Select,
    WithPagination,
} from 'superdesk-ui-framework/react';
import {SearchBar} from 'core/ui/components';
import {Button as NavButton} from 'core/ui/components/Nav';
import {TagLabel} from 'core/ui/components/TagLabel';
import {PageContainer, PageContainerItem} from 'core/components/PageLayout';
import {
    SidePanel,
    SidePanelHeader,
    SidePanelHeading,
    SidePanelTools,
    SidePanelContent,
    SidePanelContentBlock,
    SidePanelFooter,
} from 'core/components/SidePanel';
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

const PAGE_SIZE = 50;

/** Fixed so every row's content grid is equally wide and the columns line up. */
const ACTIONS_WIDTH = 240;

/** One grid for the list header and the item content, so the columns line up. */
const listGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '2fr 1.4fr 1.6fr 2fr',
    gap: 12,
    alignItems: 'start',
    width: '100%',
};

interface IProps {
    onSessionExpired(): void;
}

type IStatusFilter = 'enabled' | 'disabled';
type ITypeFilter = 'super_admin' | 'regular';

/** The fields of the "Refine search" panel (everything except the search bar's `q`). */
interface IAccountPanelFilters {
    status: Array<IStatusFilter>;
    type: Array<ITypeFilter>;
    tenant: Array<string>; // accounts assigned to any of those tenants
}

interface IAccountFilters extends IAccountPanelFilters {
    q: string;
}

const emptyPanelFilters: IAccountPanelFilters = {status: [], type: [], tenant: []};
const emptyFilters: IAccountFilters = {...emptyPanelFilters, q: ''};

const statusLabels: {[status in IStatusFilter]: () => string} = {
    enabled: () => gettext('enabled'),
    disabled: () => gettext('disabled'),
};

const typeLabels: {[type in ITypeFilter]: () => string} = {
    super_admin: () => gettext('super admin'),
    regular: () => gettext('regular'),
};

function hasActiveFilters(filters: IAccountFilters): boolean {
    return Object.keys(filters).some((key) => {
        const value: string | Array<string> = filters[key];

        return typeof value === 'string' ? value !== '' : value.length > 0;
    });
}

/** A both-values multiselect means "everything" — same as no filter. */
function exclusiveBoolean<T>(values: Array<T>, trueValue: T): boolean | null {
    return values.length === 1 ? values[0] === trueValue : null;
}

interface IState {
    tenants: Array<ITenant>; // for the tenant filter and the "add user to tenant" select
    error: string | null;
    createOpen: boolean;
    editAccount: IAccount | null;
    addUserAccount: IAccount | null;

    filtersOpen: boolean;

    /** the "Refine search" panel draft; copied to `filters` on submit */
    panelFilters: IAccountPanelFilters;

    /** the applied filters the list is fetched with */
    filters: IAccountFilters;

    /** bumped after every mutation to remount the paginated list */
    version: number;
}

export class AccountsScreen extends React.PureComponent<IProps, IState> {
    private searchBarRef: SearchBar | null;

    constructor(props: IProps) {
        super(props);

        this.state = {
            tenants: [],
            error: null,
            createOpen: false,
            editAccount: null,
            addUserAccount: null,
            filtersOpen: false,
            panelFilters: emptyPanelFilters,
            filters: emptyFilters,
            version: 0,
        };

        this.load = this.load.bind(this);
        this.handleError = this.handleError.bind(this);
        this.applyPanelFilters = this.applyPanelFilters.bind(this);
        this.clearPanelFilters = this.clearPanelFilters.bind(this);
    }

    componentDidMount(): void {
        listTenants({maxResults: 200}).then((res) => {
            this.setState({tenants: res._items});
        }, () => {
            // tenant list is only needed for the filter and "add user" selects; ignore failures here
        });
    }

    /** Re-fetches the current page by remounting the paginated list. */
    private load() {
        this.setState((state) => ({version: state.version + 1}));
    }

    private setPanelFilters(patch: Partial<IAccountPanelFilters>) {
        this.setState((state) => ({panelFilters: {...state.panelFilters, ...patch}}));
    }

    private applyPanelFilters() {
        this.setState((state) => ({
            filters: {...state.panelFilters, q: state.filters.q},
        }));
    }

    private clearPanelFilters() {
        this.setState((state) => ({
            panelFilters: emptyPanelFilters,
            filters: {...emptyFilters, q: state.filters.q},
        }));
    }

    /** Un-apply a single filter (the tag labels' remove buttons). */
    private removeFilter(key: keyof IAccountFilters) {
        if (key === 'q') {
            this.searchBarRef?.resetSearchValue();
        }

        this.setState((state) => {
            const cleared = {[key]: emptyFilters[key]};

            return {
                filters: {...state.filters, ...cleared},
                panelFilters: {...state.panelFilters, ...(key === 'q' ? {} : cleared)},
            };
        });
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

    private renderActions(account: IAccount): JSX.Element {
        return (
            <Spacer h gap="4" noGrow justifyContent="end" style={{width: ACTIONS_WIDTH}}>
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
        );
    }

    /** The applied filters as removable tags, like Superdesk list pages show them. */
    private renderFilterTags(): JSX.Element | null {
        const {filters} = this.state;
        const tags: Array<{key: keyof IAccountFilters; label: string; value: string}> = [];

        if (filters.q !== '') {
            tags.push({key: 'q', label: gettext('Search'), value: filters.q});
        }

        if (filters.status.length > 0) {
            tags.push({
                key: 'status',
                label: gettext('Status'),
                value: filters.status.map((status) => statusLabels[status]()).join(', '),
            });
        }

        if (filters.type.length > 0) {
            tags.push({
                key: 'type',
                label: gettext('Type'),
                value: filters.type.map((type) => typeLabels[type]()).join(', '),
            });
        }

        if (filters.tenant.length > 0) {
            tags.push({key: 'tenant', label: gettext('Tenant'), value: filters.tenant.join(', ')});
        }

        if (tags.length < 1) {
            return null;
        }

        return (
            <div
                style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginBlockEnd: 12}}
                data-test-id="accounts-filters-active"
            >
                {tags.map((tag) => (
                    <TagLabel key={tag.key} onRemove={() => this.removeFilter(tag.key)}>
                        {tag.label}:&nbsp;<strong>{tag.value}</strong>
                    </TagLabel>
                ))}
            </div>
        );
    }

    private renderFiltersPanel(): JSX.Element {
        const {panelFilters} = this.state;

        return (
            <SidePanel side="left" width={320} data-test-id="accounts-filters">
                <SidePanelHeader>
                    <SidePanelHeading>{gettext('Refine search')}</SidePanelHeading>
                    <SidePanelTools>
                        <button
                            className="icn-btn"
                            aria-label={gettext('Close filters')}
                            onClick={() => this.setState({filtersOpen: false})}
                        >
                            <i className="icon-close-small" />
                        </button>
                    </SidePanelTools>
                </SidePanelHeader>
                <SidePanelContent>
                    <SidePanelContentBlock>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                this.applyPanelFilters();
                            }}
                        >
                            <Spacer v gap="16">
                                <MultiSelect
                                    label={gettext('Status')}
                                    value={panelFilters.status}
                                    options={['enabled', 'disabled']}
                                    optionLabel={(status: IStatusFilter) => statusLabels[status]()}
                                    onChange={(status: Array<IStatusFilter>) => this.setPanelFilters({status})}
                                />
                                <MultiSelect
                                    label={gettext('Type')}
                                    value={panelFilters.type}
                                    options={['super_admin', 'regular']}
                                    optionLabel={(type: ITypeFilter) => typeLabels[type]()}
                                    onChange={(type: Array<ITypeFilter>) => this.setPanelFilters({type})}
                                />
                                <MultiSelect
                                    label={gettext('Tenant')}
                                    value={panelFilters.tenant}
                                    options={this.state.tenants.map((tenant) => tenant.slug)}
                                    optionLabel={(slug: string) => slug}
                                    onChange={(tenant: Array<string>) => this.setPanelFilters({tenant})}
                                />
                            </Spacer>
                        </form>
                    </SidePanelContentBlock>
                </SidePanelContent>
                <SidePanelFooter>
                    <ButtonGroup align="end">
                        <Button
                            text={gettext('Clear filters')}
                            onClick={this.clearPanelFilters}
                            data-test-id="filters-clear"
                        />
                        <Button
                            text={gettext('Filter')}
                            type="primary"
                            onClick={this.applyPanelFilters}
                            data-test-id="filters-submit"
                        />
                    </ButtonGroup>
                </SidePanelFooter>
            </SidePanel>
        );
    }

    render(): JSX.Element {
        const {error} = this.state;

        return (
            <div style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'}}>
                <div className="subnav">
                    <NavButton
                        icon="icon-filter-large"
                        onClick={() => this.setState({filtersOpen: !this.state.filtersOpen})}
                        active={this.state.filtersOpen}
                        darker={true}
                        aria-label={gettext('Toggle filters')}
                        data-test-id="toggle-filters"
                    />
                    <div style={{flexGrow: 1}}>
                        <SearchBar
                            ref={(instance) => {
                                this.searchBarRef = instance;
                            }}
                            allowCollapsed={false}
                            debounced={{timeout: 300}}
                            onSearch={(q: string) => {
                                this.setState((state) => ({filters: {...state.filters, q: q.trim()}}));
                            }}
                        />
                    </div>
                    <NavButton
                        onClick={() => this.setState({createOpen: true})}
                        className="sd-create-btn dropdown-toggle"
                        icon="icon-plus-large"
                        aria-label={gettext('Create account')}
                        data-test-id="create-account"
                    >
                        <span className="circle" />
                    </NavButton>
                </div>

                {error != null && (
                    <Alert type="alert" size="small" margin="small">{error}</Alert>
                )}

                <PageContainer>
                    {this.state.filtersOpen && (
                        <PageContainerItem>
                            {this.renderFiltersPanel()}
                        </PageContainerItem>
                    )}
                    <PageContainerItem shrink>
                        <div style={{margin: 20}}>
                            {this.renderFilterTags()}
                            {this.renderList()}
                        </div>
                    </PageContainerItem>
                </PageContainer>

                {this.renderModals()}
            </div>
        );
    }

    private renderList(): JSX.Element {
        return (
            <WithPagination
                key={`${JSON.stringify(this.state.filters)}:${this.state.version}`}
                pageSize={PAGE_SIZE}
                getItems={(pageNo, pageSize) => {
                    const {filters} = this.state;

                    return listAccounts({
                        page: pageNo,
                        maxResults: pageSize,
                        q: filters.q,
                        tenant: filters.tenant,
                        enabled: exclusiveBoolean(filters.status, 'enabled'),
                        superAdmin: exclusiveBoolean(filters.type, 'super_admin'),
                    })
                        .then((res) => ({items: res._items, itemCount: res._meta.total}), (err) => {
                            this.handleError(err, gettext('Could not load accounts'));

                            return {items: [], itemCount: 0};
                        });
                }}
            >
                {(accounts: Array<IAccount>) => (
                    <div data-test-id="accounts-table">
                        <div style={{display: 'flex', alignItems: 'center', paddingBlock: 8}}>
                            <div
                                style={{
                                    ...listGridStyle,
                                    // match the item content offset (item padding)
                                    paddingInlineStart: 20,
                                    flex: '1 1 auto',
                                    minWidth: 0,
                                    fontWeight: 600,
                                }}
                            >
                                <span>{gettext('Email')}</span>
                                <span>{gettext('Username')}</span>
                                <span>{gettext('Flags')}</span>
                                <span>{gettext('Tenants')}</span>
                            </div>
                            <div style={{width: ACTIONS_WIDTH + 20, flexShrink: 0}} />
                        </div>

                        <BoxedList density="compact">
                            {accounts.map((account) => (
                                <BoxedListItem
                                    key={account.email}
                                    type={account.is_enabled === false ? 'warning' : 'success'}
                                    alignVertical="start"
                                    actions={this.renderActions(account)}
                                >
                                    <div style={listGridStyle}>
                                        <div><strong>{account.email}</strong></div>
                                        <div>{account.username ?? ''}</div>
                                        <div>{this.renderFlags(account)}</div>
                                        <div>{(account.tenants ?? []).join(', ')}</div>
                                    </div>
                                </BoxedListItem>
                            ))}
                        </BoxedList>

                        {accounts.length === 0 && (
                            <p style={{padding: 12}}>
                                {hasActiveFilters(this.state.filters)
                                    ? gettext('No accounts match the filters.')
                                    : gettext('No accounts yet.')}
                            </p>
                        )}
                    </div>
                )}
            </WithPagination>
        );
    }

    private renderModals(): JSX.Element {
        return (
            <React.Fragment>
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
                        tenants={this.state.tenants.filter((tenant) => tenant.status === 'active')}
                        onClose={(added) => {
                            this.setState({addUserAccount: null});

                            if (added) {
                                this.load();
                            }
                        }}
                    />
                )}
            </React.Fragment>
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
