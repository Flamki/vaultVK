#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/oracle/docker-compose.oracle.yml"
ENV_FILE="$ROOT_DIR/deploy/oracle/.env"

usage() {
  cat <<EOF
Usage: bash scripts/oracle_deploy.sh <up|down|restart|status|logs> [service]

Examples:
  bash scripts/oracle_deploy.sh up
  bash scripts/oracle_deploy.sh logs gateway
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it from deploy/oracle/.env.example first."
  exit 1
fi

ACTION="$1"
SERVICE="${2:-}"
DC=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

case "$ACTION" in
  up)
    "${DC[@]}" up -d --build
    echo "Backend live at: https://$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)"
    ;;
  down)
    "${DC[@]}" down
    ;;
  restart)
    "${DC[@]}" down
    "${DC[@]}" up -d --build
    ;;
  status)
    "${DC[@]}" ps
    ;;
  logs)
    if [[ -n "$SERVICE" ]]; then
      "${DC[@]}" logs -f --tail=200 "$SERVICE"
    else
      "${DC[@]}" logs -f --tail=200
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
