# Builds the Superdesk client and serves it with nginx.
#
# The nginx proxies /api and /ws to the superdesk-core containers *preserving
# the Host header* — that is what selects the tenant when multi-tenancy is on
# (tenant-a.localhost, tenant-b.localhost, admin.localhost all hit the same
# nginx; the backend resolves the tenant from the host).

FROM node:22 AS build

WORKDIR /opt/superdesk-client

# postinstall (patch-package + extension-styles placeholder) needs these
COPY package.json package-lock.json ./
COPY patches ./patches
COPY tasks ./tasks
RUN mkdir -p styles && npm ci --unsafe-perm

COPY . .

# the full copy overwrites the generated placeholder — recreate it.
# The docker superdesk.config.js replaces the root one (grunt's getConfig only
# reads <cwd>/superdesk.config.js): it wires in docker/app.js via importApps,
# which calls startApp() — the repo-root config builds a library bundle that
# never starts the application.
RUN node tasks/generate-placeholder-file-for-extension-styles.js \
    && cp docker/superdesk.config.js superdesk.config.js \
    && NODE_OPTIONS=--max-old-space-size=8192 npx grunt build

FROM nginx:1.27-alpine

COPY --from=build /opt/superdesk-client/dist /opt/superdesk/client/dist
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# runtime config: points the app at its own origin, whatever the tenant host
# is. The build fingerprints config.js (filerev) and index.html references the
# fingerprinted name, so overwrite every copy.
COPY docker/config.js /tmp/runtime-config.js
RUN for f in /opt/superdesk/client/dist/config*.js; do cp /tmp/runtime-config.js "$f"; done

EXPOSE 80
