#!/bin/sh
set -e

# If /var/run/docker.sock is mounted, make it accessible to the kraken user
# by creating a docker group with the socket's GID and adding kraken to it.
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
  # Only create the group if it doesn't already exist for this GID
  if ! getent group "$SOCK_GID" > /dev/null 2>&1; then
    addgroup -S -g "$SOCK_GID" docker 2>/dev/null || true
  fi
  DOCKER_GROUP=$(getent group "$SOCK_GID" | cut -d: -f1)
  addgroup kraken "$DOCKER_GROUP" 2>/dev/null || true
fi

exec su-exec kraken "$@"
