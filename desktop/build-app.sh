#!/bin/bash
set -euo pipefail

# Engram Desktop Build Script
# Produces: dist/Engram.app and dist/Engram-{version}-macOS.dmg

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="${PROJECT_ROOT}/dist"
APP_DIR="${DIST_DIR}/Engram.app"

# Read version from package.json
VERSION=$(node -e "console.log(require('${PROJECT_ROOT}/package.json').version)")
echo "Building Engram v${VERSION} for macOS..."

# ── Step 1: Compile standalone binary ──────────────────────────
echo "  Compiling standalone binary..."
cd "${PROJECT_ROOT}"
bun build src/cli.ts --compile --outfile "${DIST_DIR}/engram-bin"
echo "  Binary: $(du -h "${DIST_DIR}/engram-bin" | cut -f1) standalone"

# ── Step 2: Assemble .app bundle ──────────────────────────────
echo "  Assembling Engram.app..."

# Clean previous build
rm -rf "${APP_DIR}"

# Create bundle structure
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Copy files
cp "${SCRIPT_DIR}/Info.plist" "${APP_DIR}/Contents/"
cp "${SCRIPT_DIR}/launcher" "${APP_DIR}/Contents/MacOS/launcher"
cp "${DIST_DIR}/engram-bin" "${APP_DIR}/Contents/MacOS/engram"

# Copy icon if it exists
if [ -f "${SCRIPT_DIR}/engram.icns" ]; then
    cp "${SCRIPT_DIR}/engram.icns" "${APP_DIR}/Contents/Resources/engram.icns"
fi

# Make executables
chmod +x "${APP_DIR}/Contents/MacOS/launcher"
chmod +x "${APP_DIR}/Contents/MacOS/engram"

echo "  App bundle ready: ${APP_DIR}"

# ── Step 3: Create .dmg ──────────────────────────────────────
DMG_NAME="Engram-${VERSION}-macOS.dmg"
DMG_PATH="${DIST_DIR}/${DMG_NAME}"

echo "  Creating ${DMG_NAME}..."

# Clean previous dmg
rm -f "${DMG_PATH}"

# Create a temporary directory for DMG contents
DMG_STAGING="${DIST_DIR}/dmg-staging"
rm -rf "${DMG_STAGING}"
mkdir -p "${DMG_STAGING}"

# Copy app to staging
cp -R "${APP_DIR}" "${DMG_STAGING}/"

# Create Applications symlink for drag-to-install
ln -s /Applications "${DMG_STAGING}/Applications"

# Create DMG
hdiutil create -volname "Engram" \
    -srcfolder "${DMG_STAGING}" \
    -ov -format UDZO \
    "${DMG_PATH}" \
    2>/dev/null

# Clean staging
rm -rf "${DMG_STAGING}"

DMG_SIZE=$(du -h "${DMG_PATH}" | cut -f1)
echo ""
echo "  Build complete!"
echo "  ────────────────────────────────"
echo "  App:  ${APP_DIR}"
echo "  DMG:  ${DMG_PATH} (${DMG_SIZE})"
echo "  Version: ${VERSION}"
echo ""
echo "  Note: This build is unsigned. Users will need to"
echo "  right-click → Open to bypass Gatekeeper on first run."
