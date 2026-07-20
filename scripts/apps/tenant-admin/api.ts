import {appConfig} from 'appConfig';

/**
 * Client for the control-plane API (`/tenant-admin/*`), served only on the
 * reserved admin host. Authentication is a signed session cookie set by
 * `POST /tenant-admin/login` — no Authorization header, no tenant session.
 *
 * The whole API cloaks as 404 when unauthorized.
 *
 * The endpoints live at the SERVER ROOT (outside the `/api` prefix of
 * `appConfig.server.url`); a proxy in front must forward `/tenant-admin/*`
 * preserving the original Host header — the admin host is what authorizes
 * the API (wrong host → 404 by design).
 */

export type ITenantStatus = 'creating' | 'active' | 'suspended' | 'deleted';

export interface IExchangePartner {
    tenant: string;
    direction: 'send' | 'receive' | 'both';
}

export interface ITenant {
    slug: string; // immutable identifier

    /** display name; the server falls back to the slug, never empty on read */
    name?: string;
    description?: string;
    hosts: Array<string>;
    status: ITenantStatus;
    exchange_partners?: Array<IExchangePartner>;

    /**
     * Copy exchanged media (pictures/audio/video) into this tenant's storage
     * and rewrite asset urls; when false, exchanged items keep the source
     * tenant's asset urls. Receiving tenant's setting; default true.
     */
    exchange_copy_media?: boolean;
    provisioning?: {[step: string]: string};
    deleted_at?: string | null;
    purged_at?: string | null;
    _created?: string;
    _updated?: string;
}

export interface IAccount {
    _id?: string;
    email: string;
    username?: string;
    is_enabled?: boolean;
    is_super_admin?: boolean;
    needs_password_reset?: boolean;
    password_changed_on?: string;
    tenants?: Array<string>;
    _created?: string;
    _updated?: string;
}

/** the literal id of the read-only webhook backed by TENANT_WEBHOOK_URL */
export const CONFIG_WEBHOOK_ID = 'config';

export interface IWebhook {
    _id: string; // `config` for the config-file webhook — read-only
    name?: string;
    url: string;
    has_secret: boolean;
    is_enabled: boolean;
    _created?: string;
    _updated?: string;
}

export interface IAdminApiError {
    /** HTTP status; 0 when the request did not reach the server at all */
    status: number;
    message: string | null;
}

/** Eve-style pagination envelope of the list endpoints. */
export interface IPaginated<T> {
    _items: Array<T>;
    _meta: {page: number; max_results: number; total: number};
}

export interface IListQuery {
    page?: number; // 1-based

    /** server default 50, hard-capped at 200 */
    maxResults?: number;

    /** case-insensitive substring: slug+name (tenants), email+username (accounts) */
    q?: string;
}

export type ITenantSortKey = 'slug' | 'name' | 'host' | 'status' | 'created' | 'updated' | 'partners';

export interface ITenantListQuery extends IListQuery {
    /** server default: created desc; timestamps default to desc, the rest to asc */
    sort?: ITenantSortKey;
    dir?: 'asc' | 'desc';

    /** case-insensitive substring match against the tenant's hosts */
    host?: string;

    /** any of these statuses; invalid values are rejected with 400 */
    status?: Array<ITenantStatus>;

    /** tenants that have this slug as an exchange partner */
    partner?: string;

    /**
     * ISO dates or datetimes, inclusive bounds on _created;
     * a date-only createdTo covers that entire day
     */
    createdFrom?: string;
    createdTo?: string;
}

export interface IAccountListQuery extends IListQuery {
    /** a missing is_enabled flag counts as enabled */
    enabled?: boolean | null;

    superAdmin?: boolean | null;

    /** accounts assigned to any of those tenants */
    tenant?: Array<string>;
}

function listQueryString(options: ITenantListQuery & IAccountListQuery): string {
    const params = new URLSearchParams();

    if (options.page != null) {
        params.set('page', String(options.page));
    }

    if (options.maxResults != null) {
        params.set('max_results', String(options.maxResults));
    }

    const textParams: {[param: string]: string | undefined} = {
        q: options.q,
        host: options.host,
        status: (options.status ?? []).join(','),
        partner: options.partner,
        created_from: options.createdFrom,
        created_to: options.createdTo,
        tenant: (options.tenant ?? []).join(','),
        sort: options.sort,
        dir: options.dir,
    };

    Object.keys(textParams).forEach((param) => {
        const value = textParams[param];

        if (value != null && value.trim() !== '') {
            params.set(param, value.trim());
        }
    });

    if (options.enabled != null) {
        params.set('enabled', String(options.enabled));
    }

    if (options.superAdmin != null) {
        params.set('super_admin', String(options.superAdmin));
    }

    const queryString = params.toString();

    return queryString === '' ? '' : '?' + queryString;
}

export function getAdminErrorMessage(err: unknown, fallback: string): string {
    if (typeof err === 'object' && err != null && typeof (err as IAdminApiError).message === 'string') {
        return (err as IAdminApiError).message;
    }

    return fallback;
}

function adminRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    payload?: {},
): Promise<T> {
    // server root, not appConfig.server.url — the API is outside `/api`
    const base = new URL(appConfig.server.url).origin;

    return fetch(base + path, {
        method: method,
        credentials: 'include', // the admin session cookie
        headers: payload == null ? {} : {'Content-Type': 'application/json'},
        body: payload == null ? undefined : JSON.stringify(payload),
    }).then((res) => {
        return res.text().then((bodyText) => {
            let json: any = null;

            try {
                json = JSON.parse(bodyText);
            } catch (_err) {
                // not JSON — leave null
            }

            if (res.ok) {
                return json as T;
            }

            const error: IAdminApiError = {
                status: res.status,
                message: json?._error?.message ?? null,
            };

            return Promise.reject(error);
        });
    }, () => {
        // the request never reached the server (network/proxy failure)
        const error: IAdminApiError = {status: 0, message: null};

        return Promise.reject(error);
    });
}

// session

export function adminLogin(email: string, password: string): Promise<{email: string}> {
    return adminRequest('POST', '/tenant-admin/login', {email, password});
}

export function adminLogout(): Promise<void> {
    return adminRequest('POST', '/tenant-admin/logout');
}

/** Rejects with status 404 when not logged in (the API cloaks as 404). */
export function adminGetMe(): Promise<{auth: 'session' | 'token'; email?: string}> {
    return adminRequest('GET', '/tenant-admin/me');
}

// tenants

export function listTenants(options: ITenantListQuery = {}): Promise<IPaginated<ITenant>> {
    return adminRequest('GET', '/tenant-admin/tenants' + listQueryString(options));
}

export function createTenant(payload: {
    slug: string;
    name?: string;
    description?: string;
    hosts: Array<string>;
    admin?: {username: string; password: string; email: string};
    resume?: boolean;
}): Promise<ITenant> {
    return adminRequest('POST', '/tenant-admin/tenants', payload);
}

export function patchTenant(
    slug: string,
    payload: {
        status?: 'active' | 'suspended';
        exchange_partners?: Array<IExchangePartner>;
        exchange_copy_media?: boolean;

        /** send only when changing; "" intentionally resets to the slug fallback */
        name?: string;
        description?: string;
    },
): Promise<ITenant> {
    return adminRequest('PATCH', `/tenant-admin/tenants/${slug}`, payload);
}

export function deleteTenant(slug: string): Promise<{_status: string; retention_days: number}> {
    return adminRequest('DELETE', `/tenant-admin/tenants/${slug}`);
}

// accounts

export function listAccounts(options: IAccountListQuery = {}): Promise<IPaginated<IAccount>> {
    return adminRequest('GET', '/tenant-admin/accounts' + listQueryString(options));
}

export function createAccount(payload: {
    email: string;
    password: string;
    username?: string;
    is_super_admin?: boolean;
}): Promise<IAccount> {
    return adminRequest('POST', '/tenant-admin/accounts', payload);
}

export function patchAccount(
    email: string,
    payload: {
        is_enabled?: boolean;
        is_super_admin?: boolean;
        needs_password_reset?: boolean;
        password?: string;
    },
): Promise<IAccount> {
    return adminRequest('PATCH', `/tenant-admin/accounts/${encodeURIComponent(email)}`, payload);
}

export function addUserToTenant(
    slug: string,
    payload: {username: string; password: string; email: string; admin?: boolean},
): Promise<void> {
    return adminRequest('POST', `/tenant-admin/tenants/${slug}/users`, payload);
}

// webhooks — every enabled webhook receives all tenant lifecycle events

export function listWebhooks(): Promise<Array<IWebhook>> {
    return adminRequest('GET', '/tenant-admin/webhooks');
}

export function createWebhook(payload: {
    url: string;
    secret?: string;
    name?: string;
    is_enabled?: boolean;
}): Promise<IWebhook> {
    return adminRequest('POST', '/tenant-admin/webhooks', payload);
}

/** `secret` is write-only: omit to keep the stored one, send "" to clear. */
export function patchWebhook(
    id: string,
    payload: {url?: string; secret?: string; name?: string; is_enabled?: boolean},
): Promise<IWebhook> {
    return adminRequest('PATCH', `/tenant-admin/webhooks/${id}`, payload);
}

export function deleteWebhook(id: string): Promise<{_status: string}> {
    return adminRequest('DELETE', `/tenant-admin/webhooks/${id}`);
}

export function testWebhook(id: string): Promise<{_status: string; response_status: number}> {
    return adminRequest('POST', `/tenant-admin/webhooks/${id}/test`);
}
