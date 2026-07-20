import React from 'react';
import {
    Alert,
    BoxedList,
    BoxedListItem,
    Button,
    ButtonGroup,
    Checkbox,
    DatePickerISO,
    Dropdown,
    Input,
    Modal,
    MultiSelect,
    Option,
    Select,
    WithPagination,
} from 'superdesk-ui-framework/react';
import {appConfig} from 'appConfig';
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
    IExchangePartner,
    ITenant,
    ITenantSortKey,
    ITenantStatus,
    createTenant,
    deleteTenant,
    getAdminErrorMessage,
    listTenants,
    patchTenant,
} from './api';

const PAGE_SIZE = 50;

/** Fixed so every row's content grid is equally wide and the columns line up. */
const ACTIONS_WIDTH = 220;

/** One grid for the list header and the item content, so the columns line up. */
const listGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '2fr 1.4fr 1.6fr 1.4fr 1.6fr',
    gap: 12,
    alignItems: 'start',
    width: '100%',
};

const listItemTypes: {[status in ITenantStatus]: 'default' | 'success' | 'warning' | 'alert'} = {
    creating: 'default',
    active: 'success',
    suspended: 'warning',
    deleted: 'alert',
};

const sortLabels: {[key in ITenantSortKey]: () => string} = {
    slug: () => gettext('Slug'),
    name: () => gettext('Name'),
    host: () => gettext('Host'),
    status: () => gettext('Status'),
    created: () => gettext('Created'),
    updated: () => gettext('Updated'),
    partners: () => gettext('Exchange partners'),
};

/** The server's default direction per sort key: newest first for timestamps. */
function defaultSortDir(key: ITenantSortKey): 'asc' | 'desc' {
    return key === 'created' || key === 'updated' ? 'desc' : 'asc';
}

interface IProps {
    onSessionExpired(): void;
}

/** The fields of the "Refine search" panel (everything except the search bar's `q`). */
interface ITenantPanelFilters {
    host: string;
    status: Array<ITenantStatus>;
    partner: string; // slug of an exchange partner

    /** ISO dates, inclusive; createdTo covers that entire day */
    createdFrom: string;
    createdTo: string;
}

interface ITenantFilters extends ITenantPanelFilters {
    q: string;
}

const emptyPanelFilters: ITenantPanelFilters = {host: '', status: [], partner: '', createdFrom: '', createdTo: ''};
const emptyFilters: ITenantFilters = {...emptyPanelFilters, q: ''};

const statusLabels: {[status in ITenantStatus]: () => string} = {
    creating: () => gettext('creating'),
    active: () => gettext('active'),
    suspended: () => gettext('suspended'),
    deleted: () => gettext('deleted'),
};

function isFilterSet(value: string | Array<string>): boolean {
    return typeof value === 'string' ? value !== '' : value.length > 0;
}

function hasActiveFilters(filters: ITenantFilters): boolean {
    return Object.keys(filters).some((key) => isFilterSet(filters[key]));
}

interface IState {
    error: string | null;
    busySlug: string | null; // slug with an action in progress
    createOpen: boolean;
    partnersFor: ITenant | null; // tenant whose partners are being edited
    editFor: ITenant | null; // tenant whose name/description are being edited
    deleteConfirm: ITenant | null;

    filtersOpen: boolean;

    /** the "Refine search" panel draft; copied to `filters` on submit */
    panelFilters: ITenantPanelFilters;

    /** the applied filters the list is fetched with */
    filters: ITenantFilters;

    sortKey: ITenantSortKey;
    sortDir: 'asc' | 'desc';

    /** bumped after every mutation to remount the paginated list */
    version: number;

    /** for the partner selects (first 200 by slug) */
    allTenants: Array<ITenant>;
}

/** Display name; the server guarantees name is never empty, this is belt-and-braces. */
function tenantLabel(tenant: ITenant): string {
    return tenant.name || tenant.slug;
}

function formatDateTime(value: string | undefined): string {
    return value == null ? '' : new Date(value).toLocaleString();
}

export class TenantsScreen extends React.PureComponent<IProps, IState> {
    private searchBarRef: SearchBar | null;

    constructor(props: IProps) {
        super(props);

        this.state = {
            error: null,
            busySlug: null,
            createOpen: false,
            partnersFor: null,
            editFor: null,
            deleteConfirm: null,
            filtersOpen: false,
            panelFilters: emptyPanelFilters,
            filters: emptyFilters,
            sortKey: 'created',
            sortDir: 'desc',
            version: 0,
            allTenants: [],
        };

        this.load = this.load.bind(this);
        this.handleError = this.handleError.bind(this);
        this.applyPanelFilters = this.applyPanelFilters.bind(this);
        this.clearPanelFilters = this.clearPanelFilters.bind(this);
    }

    componentDidMount(): void {
        listTenants({maxResults: 200}).then((res) => {
            this.setState({allTenants: res._items});
        }, () => {
            // only needed for the partner selects; ignore failures here
        });
    }

    /** Re-fetches the current page by remounting the paginated list. */
    private load() {
        this.setState((state) => ({version: state.version + 1}));
    }

    private setPanelFilters(patch: Partial<ITenantPanelFilters>) {
        this.setState((state) => ({panelFilters: {...state.panelFilters, ...patch}}));
    }

    private applyPanelFilters() {
        this.setState((state) => ({
            filters: {
                ...state.panelFilters,
                host: state.panelFilters.host.trim(),
                q: state.filters.q,
            },
        }));
    }

    private clearPanelFilters() {
        this.setState((state) => ({
            panelFilters: emptyPanelFilters,
            filters: {...emptyFilters, q: state.filters.q},
        }));
    }

    /** Un-apply a single filter (the tag labels' remove buttons). */
    private removeFilter(key: keyof ITenantFilters) {
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
            <Spacer h gap="4" noGrow justifyContent="end" style={{width: ACTIONS_WIDTH}}>
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

    /** The applied filters as removable tags, like Superdesk list pages show them. */
    private renderFilterTags(): JSX.Element | null {
        const {filters} = this.state;
        const tags: Array<{key: keyof ITenantFilters; label: string; value: string}> = [];

        if (filters.q !== '') {
            tags.push({key: 'q', label: gettext('Search'), value: filters.q});
        }

        if (filters.host !== '') {
            tags.push({key: 'host', label: gettext('Host'), value: filters.host});
        }

        if (filters.status.length > 0) {
            tags.push({
                key: 'status',
                label: gettext('Status'),
                value: filters.status.map((status) => statusLabels[status]()).join(', '),
            });
        }

        if (filters.partner !== '') {
            tags.push({key: 'partner', label: gettext('Exchange partner'), value: filters.partner});
        }

        if (filters.createdFrom !== '') {
            tags.push({key: 'createdFrom', label: gettext('Created from'), value: filters.createdFrom});
        }

        if (filters.createdTo !== '') {
            tags.push({key: 'createdTo', label: gettext('Created until'), value: filters.createdTo});
        }

        if (tags.length < 1) {
            return null;
        }

        return (
            <div
                style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginBlockEnd: 12}}
                data-test-id="tenants-filters-active"
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
            <SidePanel side="left" width={320} data-test-id="tenants-filters">
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
                                <Input
                                    type="text"
                                    label={gettext('Host')}
                                    placeholder={gettext('Host substring')}
                                    value={panelFilters.host}
                                    onChange={(host) => this.setPanelFilters({host})}
                                />
                                <MultiSelect
                                    label={gettext('Status')}
                                    value={panelFilters.status}
                                    options={['creating', 'active', 'suspended', 'deleted']}
                                    optionLabel={(status: ITenantStatus) => statusLabels[status]()}
                                    onChange={(status: Array<ITenantStatus>) => this.setPanelFilters({status})}
                                />
                                <Select
                                    label={gettext('Exchange partner')}
                                    value={panelFilters.partner}
                                    onChange={(partner) => this.setPanelFilters({partner})}
                                >
                                    <Option value="" />
                                    {this.state.allTenants.map((tenant) => (
                                        <Option key={tenant.slug} value={tenant.slug}>{tenant.slug}</Option>
                                    ))}
                                </Select>
                                <DatePickerISO
                                    label={gettext('Created from')}
                                    dateFormat={appConfig.view.dateformat}
                                    value={panelFilters.createdFrom}
                                    onChange={(createdFrom) => this.setPanelFilters({createdFrom})}
                                />
                                <DatePickerISO
                                    label={gettext('Created until')}
                                    dateFormat={appConfig.view.dateformat}
                                    value={panelFilters.createdTo}
                                    onChange={(createdTo) => this.setPanelFilters({createdTo})}
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
                        aria-label={gettext('Create tenant')}
                        data-test-id="create-tenant"
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
                key={[
                    JSON.stringify(this.state.filters),
                    this.state.sortKey,
                    this.state.sortDir,
                    this.state.version,
                ].join(':')}
                pageSize={PAGE_SIZE}
                getItems={(pageNo, pageSize) =>
                    listTenants({
                        page: pageNo,
                        maxResults: pageSize,
                        sort: this.state.sortKey,
                        dir: this.state.sortDir,
                        ...this.state.filters,
                    })
                        .then((res) => ({items: res._items, itemCount: res._meta.total}), (err) => {
                            this.handleError(err, gettext('Could not load tenants'));

                            return {items: [], itemCount: 0};
                        })
                }
            >
                {(tenants: Array<ITenant>) => (
                    <div data-test-id="tenants-table">
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
                                <span>{gettext('Tenant')}</span>
                                <span>{gettext('Status')}</span>
                                <span>{gettext('Host')}</span>
                                <span>{gettext('Created')}</span>
                                <span>{gettext('Exchange partners')}</span>
                            </div>
                            <div
                                style={{
                                    width: ACTIONS_WIDTH + 20,
                                    flexShrink: 0,
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                data-test-id="tenants-sort"
                            >
                                <span>{gettext('Sort by:')}</span>
                                <Dropdown
                                    align="right"
                                    items={(Object.keys(sortLabels) as Array<ITenantSortKey>).map((key) => ({
                                        label: sortLabels[key](),
                                        active: this.state.sortKey === key,
                                        onSelect: () => {
                                            this.setState({sortKey: key, sortDir: defaultSortDir(key)});
                                        },
                                    }))}
                                >
                                    <button className="tenant-admin-panel__sort-trigger">
                                        {sortLabels[this.state.sortKey]()}
                                        <i className="icon-chevron-down-thin" />
                                    </button>
                                </Dropdown>
                                <button
                                    className="icn-btn"
                                    aria-label={this.state.sortDir === 'asc'
                                        ? gettext('Sort descending')
                                        : gettext('Sort ascending')}
                                    onClick={() => {
                                        this.setState((state) => ({
                                            sortDir: state.sortDir === 'asc' ? 'desc' : 'asc',
                                        }));
                                    }}
                                >
                                    <i
                                        className={this.state.sortDir === 'asc'
                                            ? 'icon-ascending'
                                            : 'icon-descending'}
                                    />
                                </button>
                            </div>
                        </div>

                        <BoxedList density="compact">
                            {tenants.map((tenant) => (
                                <BoxedListItem
                                    key={tenant.slug}
                                    type={listItemTypes[tenant.status]}
                                    alignVertical="start"
                                    actions={this.renderActions(tenant)}
                                >
                                    <div style={listGridStyle}>
                                        <div>
                                            <strong>{tenantLabel(tenant)}</strong>
                                            {tenantLabel(tenant) !== tenant.slug && (
                                                <div style={{opacity: 0.6, fontSize: '0.9em'}}>
                                                    {tenant.slug}
                                                </div>
                                            )}
                                            {(tenant.description ?? '') !== '' && (
                                                <div style={{opacity: 0.75}}>{tenant.description}</div>
                                            )}
                                        </div>
                                        <div>{this.renderStatus(tenant)}</div>
                                        <div>
                                            {(tenant.hosts ?? []).map((host, index) => (
                                                <React.Fragment key={host}>
                                                    {index > 0 && ', '}
                                                    <a
                                                        className="tenant-admin-panel__host-link"
                                                        href={'//' + host}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <i className="icon-link" />
                                                        {host}
                                                    </a>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <div
                                            title={gettext('Modified: {{datetime}}', {
                                                datetime: formatDateTime(tenant._updated),
                                            })}
                                        >
                                            {formatDateTime(tenant._created)}
                                        </div>
                                        <div>
                                            {(tenant.exchange_partners ?? [])
                                                .map((p) => `${p.tenant} (${p.direction ?? 'both'})`)
                                                .join(', ')}
                                        </div>
                                    </div>
                                </BoxedListItem>
                            ))}
                        </BoxedList>

                        {tenants.length === 0 && (
                            <p style={{padding: 12}}>
                                {hasActiveFilters(this.state.filters)
                                    ? gettext('No tenants match the filters.')
                                    : gettext('No tenants yet.')}
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
                        allTenants={this.state.allTenants}
                        onClose={(saved) => {
                            this.setState({partnersFor: null});

                            if (saved) {
                                this.load();
                            }
                        }}
                    />
                )}
            </React.Fragment>
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
