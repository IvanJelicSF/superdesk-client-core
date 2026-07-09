/**
 * Runtime configuration served by nginx (replaces dist/config.js).
 *
 * The API and websocket are addressed via the page's own origin so that one
 * client build works for every tenant host — the Host header of same-origin
 * /api requests is what selects the tenant on the server.
 */
window.superdeskConfig = {
    server: {
        url: window.location.origin + '/api',
        ws: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws',
    },
};
