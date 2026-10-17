#!/bin/bash
# Configure REA (rea-agents) for Claude Code in cloud sessions:
# registers the REA MCP server in ~/.claude.json and installs its skill.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REA_VERSION="6.5.0"

# Setup is idempotent: it updates the existing registration and skill in place.
npx -y "rea-agents@${REA_VERSION}" setup --client claude_code --yes >/dev/null
