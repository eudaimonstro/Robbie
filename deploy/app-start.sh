#!/bin/sh
# The image's start command: apply any new migrations, then hand the process to Node, so Node
# receives docker stop's SIGTERM and shuts down gracefully (src/index.ts).
set -eu
cd /app/backend-node
/app/node_modules/.bin/prisma migrate deploy
exec node dist/index.js
