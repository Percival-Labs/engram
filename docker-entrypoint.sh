#!/bin/sh
set -e

# Auto-install packages from /app/packages/ if any exist
if [ -d /app/packages ]; then
  for pkg in /app/packages/*/; do
    if [ -d "$pkg" ]; then
      echo "Installing package: $(basename $pkg)"
      node /app/dist/cli.js package install "$pkg"
    fi
  done
fi

exec "$@"
