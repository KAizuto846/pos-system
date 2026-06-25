#!/bin/bash
# ─── POS System Deploy Script (Xubuntu) ───────────────────────
# Usage: ./deploy.sh [version]
# Example: ./deploy.sh v1.0.1
#
# This script:
# 1. Builds the Next.js app
# 2. Commits & pushes to GitHub
# 3. Creates a Git tag → triggers GitHub Action → builds .exe + release

set -e

VERSION="${1:-v$(date +%Y.%m.%d-%H%M)}"
REPO_URL="git@github.com:KAizuto846/pos-system.git"

echo "🚀 POS System — Deploy $VERSION"
echo "========================================"

# ── Check we're in the right directory ─────────────────────
if [ ! -f "package.json" ]; then
  echo "❌ Run this script from the project root"
  exit 1
fi

# ── Pull latest changes ───────────────────────────────────
echo ""
echo "📥 Pulling latest changes..."
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || true

# ── Install deps if needed ─────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm ci
fi

# ── Generate Prisma client ─────────────────────────────────
echo "🔨 Generating Prisma client..."
npx prisma generate

# ── Build Next.js ──────────────────────────────────────────
echo "🏗️  Building Next.js (standalone)..."
npm run build

# ── Commit changes ─────────────────────────────────────────
echo ""
echo "📝 Committing changes..."
git add -A
git commit -m "release: $VERSION" || echo "   (nothing to commit)"

# ── Push to GitHub ─────────────────────────────────────────
echo ""
echo "📤 Pushing to GitHub..."
git push origin main 2>/dev/null || git push origin master 2>/dev/null

# ── Create tag → triggers GitHub Action ────────────────────
echo ""
echo "🏷️  Creating tag $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

echo ""
echo "✅ Done! GitHub Actions will now:"
echo "   1. Build the Windows .exe"
echo "   2. Create a GitHub Release"
echo "   3. Auto-updater notifies all Windows clients"
echo ""
echo "📊 Track progress: https://github.com/KAizuto846/pos-system/actions"
