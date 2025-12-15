#!/bin/bash
# Switch between personal and demo environments
# Usage: ./scripts/switch-env.sh demo    → Switch to demo mode
#        ./scripts/switch-env.sh personal → Switch back to your personal data

ENV_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PERSONAL="$ENV_DIR/.env.local.personal"
DEMO="$ENV_DIR/.env.demo"
TARGET="$ENV_DIR/.env.local"

case "$1" in
  demo)
    if [ ! -f "$DEMO" ]; then
      echo "Error: .env.demo not found"
      exit 1
    fi
    cp "$DEMO" "$TARGET"
    echo "Switched to DEMO mode (demo Supabase project)"
    echo "Run: npm run dev"
    ;;
  personal)
    if [ ! -f "$PERSONAL" ]; then
      echo "Error: .env.local.personal not found"
      exit 1
    fi
    cp "$PERSONAL" "$TARGET"
    echo "Switched to PERSONAL mode (your Supabase project)"
    echo "Run: npm run dev"
    ;;
  *)
    echo "Usage: ./scripts/switch-env.sh [demo|personal]"
    echo ""
    echo "  demo     - Use demo Supabase with sample data (read-only)"
    echo "  personal - Use your personal Supabase with real data"
    exit 1
    ;;
esac
