import React from 'react';
import ReactDOM from 'react-dom';
import {appConfig} from 'appConfig';
import {TenantAdminPanel} from './panel';

/**
 * The tenant administration panel lives at a permanent, unique location — the
 * reserved admin host from `client_config.tenant_admin_url`. When the client
 * is served from that host, the panel takes over instead of the regular
 * Superdesk application (there is no tenant on that host to log into).
 */
export function isTenantAdminHost(): boolean {
    const adminUrl = appConfig.tenant_admin_url ?? '';

    if (appConfig.multi_tenant_enabled !== true || adminUrl === '') {
        return false;
    }

    try {
        return new URL(adminUrl).host === window.location.host;
    } catch (_err) {
        return false; // malformed tenant_admin_url
    }
}

export function bootstrapTenantAdminPanel(): void {
    const container = document.createElement('div');

    document.body.appendChild(container);
    document.title = 'Superdesk — Tenant administration';

    ReactDOM.render(<TenantAdminPanel />, container);
}
