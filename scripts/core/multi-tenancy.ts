import {appConfig} from 'appConfig';
import ng from 'core/services/ng';

/**
 * Multi-tenancy helpers (see MULTITENANCY_CLIENT_SPEC.md in superdesk-core).
 *
 * The tenant is the hostname — all requests stay same-origin; switching
 * tenants is a top-level navigation to another host.
 *
 * The multi-tenancy endpoints (`/accounts/*`, `/exchange/*`,
 * `/archive/send_to_tenant`, `/tenant-admin/*`) are blueprint routes at the
 * SERVER ROOT — outside the `/api` prefix of `appConfig.server.url` — so
 * they cannot go through `httpRequestJsonLocal`. Any proxy in front must
 * forward these paths too, preserving the original Host header (the host is
 * what selects the tenant).
 */

/** Server root — `appConfig.server.url` without the `/api` prefix. */
export function getServerRoot(): string {
    return new URL(appConfig.server.url).origin;
}

function rootRequest<T>(method: 'GET' | 'POST', path: string, payload?: {}): Promise<T> {
    return ng.getService('session').then((session) => {
        return fetch(getServerRoot() + path, {
            method: method,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(session.token == null ? {} : {Authorization: session.token}),
            },
            body: payload == null ? undefined : JSON.stringify(payload),
        }).then((res) => {
            return res.text().then((bodyText) => {
                let json: any = null;

                try {
                    json = JSON.parse(bodyText);
                } catch (_err) {
                    // not JSON — leave null
                }

                return res.ok ? json as T : Promise.reject(json ?? {status: res.status});
            });
        });
    });
}

export interface ITenantRef {
    tenant: string; // the slug — the identifier (hosts and CLI use it)

    /** human-readable display name; the server falls back to the slug */
    name?: string;
    hosts: Array<string>;
}

/** Display name of a tenant; the slug is only a belt-and-braces fallback. */
export function getTenantLabel(tenant: ITenantRef): string {
    return tenant.name || tenant.tenant;
}

export interface IUserTenantsResponse {
    tenants: Array<ITenantRef>;
    is_super_admin?: boolean;
}

export interface IExchangePartnersResponse {
    partners: Array<ITenantRef>;
}

export function multiTenantEnabled(): boolean {
    return appConfig.multi_tenant_enabled === true;
}

export function sharedAccountsEnabled(): boolean {
    return appConfig.shared_accounts_enabled === true;
}

export function getTenantAdminUrl(): string {
    return appConfig.tenant_admin_url ?? '';
}

let myTenantsPromise: Promise<IUserTenantsResponse> | null = null;

/**
 * Tenants where the logged-in user's shared account has a linked user.
 * Cached per session; pass `refresh` to re-fetch (it is a cheap call).
 */
export function getMyTenants(refresh: boolean = false): Promise<IUserTenantsResponse> {
    if (myTenantsPromise == null || refresh) {
        myTenantsPromise = rootRequest<IUserTenantsResponse>(
            'GET',
            '/accounts/me/tenants',
        ).catch((err) => {
            myTenantsPromise = null; // don't cache failures

            return Promise.reject(err);
        });
    }

    return myTenantsPromise;
}

let exchangePartnersPromise: Promise<IExchangePartnersResponse> | null = null;
let exchangePartnersCache: Array<ITenantRef> | null = null;

/**
 * Tenants the current tenant may send content to. Cached per session.
 */
export function getExchangePartners(refresh: boolean = false): Promise<IExchangePartnersResponse> {
    if (exchangePartnersPromise == null || refresh) {
        exchangePartnersPromise = rootRequest<IExchangePartnersResponse>(
            'GET',
            '/exchange/partners',
        ).then((res) => {
            exchangePartnersCache = res.partners ?? [];

            return res;
        }, (err) => {
            exchangePartnersPromise = null; // don't cache failures

            return Promise.reject(err);
        });
    }

    return exchangePartnersPromise;
}

/**
 * Synchronous check used by item action conditions (they can't await).
 * Kicks off the fetch on first call and reports `false` until it resolves.
 */
export function hasExchangePartners(): boolean {
    if (!multiTenantEnabled()) {
        return false;
    }

    if (exchangePartnersCache == null) {
        getExchangePartners().catch(() => null);

        return false;
    }

    return exchangePartnersCache.length > 0;
}

export function isCurrentTenant(tenant: ITenantRef): boolean {
    return (tenant.hosts ?? []).includes(window.location.host);
}

export const TENANT_SWITCH_QUERY_PARAM = 'tenant_switch';

/**
 * Top-level navigation to another tenant — it is a different origin, so the
 * session cannot carry over. With shared accounts a one-time switch token
 * (POST /accounts/me/switch-token) is appended to the URL and the target
 * tenant exchanges it for a session (see tryTenantSwitchLogin); if issuing
 * the token fails the user simply lands on the login screen.
 * The current scheme is kept (tenants of one deployment share it).
 */
export function switchToTenant(tenant: ITenantRef): void {
    if ((tenant.hosts ?? []).length < 1 || isCurrentTenant(tenant)) {
        return;
    }

    const destination = window.location.protocol + '//' + tenant.hosts[0];

    if (!sharedAccountsEnabled()) {
        window.location.href = destination;

        return;
    }

    rootRequest<{token: string}>('POST', '/accounts/me/switch-token', {tenant: tenant.tenant})
        .then((res) => {
            window.location.href =
                destination + '/?' + TENANT_SWITCH_QUERY_PARAM + '=' + encodeURIComponent(res.token);
        }, () => {
            window.location.href = destination; // fall back to manual login
        });
}

let pendingSwitchToken: string | null = null;

/**
 * Pull a one-time switch token out of the URL. MUST run before
 * `angular.bootstrap` — $location snapshots the URL at startup and would
 * re-append the query parameter on the first route change otherwise.
 */
export function captureTenantSwitchToken(): void {
    const params = new URLSearchParams(window.location.search);
    const token = params.get(TENANT_SWITCH_QUERY_PARAM);

    if (token == null || token === '') {
        return;
    }

    pendingSwitchToken = token;

    params.delete(TENANT_SWITCH_QUERY_PARAM);
    window.history.replaceState(
        null,
        '',
        window.location.pathname
            + (params.toString() === '' ? '' : '?' + params.toString())
            + window.location.hash,
    );
}

/**
 * Boot-time counterpart of switchToTenant: when the URL carried a one-time
 * switch token (captured pre-bootstrap by captureTenantSwitchToken so it
 * never stays in history), exchange it for a session
 * (POST /accounts/switch-login) and start it — the user is signed in without
 * seeing the login screen.
 */
export function tryTenantSwitchLogin(): Promise<boolean> {
    const token = pendingSwitchToken;

    if (token == null || token === '') {
        return Promise.resolve(false);
    }

    pendingSwitchToken = null; // single use

    return fetch(getServerRoot() + '/accounts/switch-login', {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token: token}),
    })
        .then((res) => res.ok ? res.json() : Promise.reject(res.status))
        .then((sessionData) => Promise.all([
            ng.getService('api'),
            ng.getService('session'),
            ng.getService('authAdapter'),
        ]).then(([api, session, authAdapter]) => {
            authAdapter.setToken({data: sessionData}); // formats the token + sets the $http header

            return api.users.getById(sessionData.user).then((userData) => {
                session.start(sessionData, userData);

                return true;
            });
        }))
        .catch((err) => {
            // expired/used token — the regular login screen stays up
            console.warn('tenant switch login failed', err);

            return false;
        });
}

/**
 * The server answers HTTP 423 when the tenant is suspended or still being
 * provisioned — show a full-page state instead of generic error toasts
 * (rendered in core/menu/views/superdesk-view.html).
 */
export function markTenantUnavailable(): void {
    try {
        const $rootScope = ng.get('$rootScope');

        if ($rootScope.tenantUnavailable !== true) {
            $rootScope.tenantUnavailable = true;
            $rootScope.$applyAsync();
        }
    } catch (_err) {
        // angular not bootstrapped yet — nothing to render onto
    }
}

export function sendToTenant(
    itemId: string,
    targetTenant: string,
    options: {desk?: string; stage?: string; autoFetch?: boolean} = {},
): Promise<{_status: string; item_id: string; target_tenant: string}> {
    const payload: {[key: string]: any} = {
        item_id: itemId,
        target_tenant: targetTenant,
        auto_fetch: options.autoFetch ?? false,
    };

    if (options.desk != null && options.desk !== '') {
        payload.desk = options.desk;
    }

    if (options.stage != null && options.stage !== '') {
        payload.stage = options.stage;
    }

    return rootRequest('POST', '/archive/send_to_tenant', payload);
}
