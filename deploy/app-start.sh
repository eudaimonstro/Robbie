#!/bin/sh
# The image's start command: apply any new migrations, then hand the process to Node, so Node
# receives docker stop's SIGTERM and shuts down gracefully (src/index.ts).
set -eu
cd /app/backend-node
/app/node_modules/.bin/prisma migrate deploy
# The heap is capped well inside the container's memory limit (compose.yaml), so Node collects
# garbage before the box runs short rather than growing into swap
exec node --max-old-space-size="${NODE_MAX_OLD_SPACE_MB:-384}" dist/index.js
