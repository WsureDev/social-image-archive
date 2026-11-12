#!/bin/bash
set -euo pipefail
project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project"
if test -f publisher.env; then
    set -a
    source publisher.env
    set +a
fi
state_dir=${SHARE_STATE_DIR:-$project/publisher-state}
mkdir -p "$state_dir"
chmod 700 "$state_dir"
bun_command=${BUN_EXECUTABLE:-$HOME/.local/bin/bun}
if ! test -x "$bun_command"; then
    bun_command=$(command -v bun)
fi
exec /usr/bin/flock --nonblock "$state_dir/publisher.lock" "$bun_command" scripts/publish-share.ts "$@"
