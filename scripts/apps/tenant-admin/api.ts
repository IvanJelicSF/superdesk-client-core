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

export function listTenants(): Promise<Array<ITenant>> {
    return adminRequest('GET', '/tenant-admin/tenants');
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

export function listAccounts(): Promise<Array<IAccount>> {
    return adminRequest('GET', '/tenant-admin/accounts');
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
