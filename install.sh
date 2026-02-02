#!/bin/sh
# install.sh — Download and install excalirender native Linux binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
#   wget -qO- https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
#
# Options (via environment variables):
#   VERSION=v1.0.0  Install a specific version (default: latest)
#   PREFIX=/opt      Custom install prefix (default: /usr/local or ~/.local)
#
# Examples:
#   sh install.sh                              # latest, auto-detect prefix
#   VERSION=v1.2.0 sh install.sh               # specific version
#   PREFIX=$HOME/.local sh install.sh           # custom prefix
#
# Installs to:
#   $PREFIX/lib/excalirender/   (binary + libs)
#   $PREFIX/bin/excalirender    (symlink)
#
# Uninstall:
#   rm -rf $PREFIX/lib/excalirender $PREFIX/bin/excalirender

set -e

REPO="JonRC/excalirender"
ASSET_NAME="excalirender-linux-x64.tar.gz"

# --- helpers ---------------------------------------------------------------

log()   { printf '  %s\n' "$*"; }
info()  { printf '  \033[1;34m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[1;32m%s\033[0m\n' "$*"; }
err()   { printf '  \033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
    if ! command -v "$1" > /dev/null 2>&1; then
        err "need '$1' (command not found)"
    fi
}

# --- preflight checks ------------------------------------------------------

# OS check
case "$(uname -s)" in
    Linux) ;;
    *) err "excalirender native binary is only available for Linux" ;;
esac

# Architecture check
case "$(uname -m)" in
    x86_64|amd64) ;;
    *) err "excalirender native binary is only available for x86_64 (got $(uname -m))" ;;
esac

# Need either curl or wget
if command -v curl > /dev/null 2>&1; then
    fetch() { curl -fsSL "$1"; }
    download() { curl -fsSL -o "$2" "$1"; }
elif command -v wget > /dev/null 2>&1; then
    fetch() { wget -qO- "$1"; }
    download() { wget -qO "$2" "$1"; }
else
    err "need either 'curl' or 'wget'"
fi

# Need tar
need_cmd tar
need_cmd mktemp

# --- resolve version -------------------------------------------------------

if [ -n "$VERSION" ]; then
    TAG="$VERSION"
else
    info "Fetching latest release..."
    # Use GitHub API to get latest release tag
    TAG=$(fetch "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

    if [ -z "$TAG" ]; then
        err "could not determine latest release (no releases found at github.com/${REPO})"
    fi
fi

info "Installing excalirender ${TAG}"

# --- determine install prefix ----------------------------------------------

if [ -z "$PREFIX" ]; then
    if [ "$(id -u)" = "0" ]; then
        PREFIX="/usr/local"
    else
        PREFIX="$HOME/.local"
    fi
fi

INSTALL_DIR="${PREFIX}/lib/excalirender"
BIN_DIR="${PREFIX}/bin"
BIN_LINK="${BIN_DIR}/excalirender"

log "Install directory: ${INSTALL_DIR}"
log "Binary symlink:    ${BIN_LINK}"

# --- download and extract --------------------------------------------------

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info "Downloading ${DOWNLOAD_URL}..."
download "$DOWNLOAD_URL" "${TMPDIR}/${ASSET_NAME}"

info "Extracting..."
tar xzf "${TMPDIR}/${ASSET_NAME}" -C "$TMPDIR"

# --- install ---------------------------------------------------------------

# Remove previous installation if present
if [ -d "$INSTALL_DIR" ]; then
    log "Removing previous installation..."
    rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# Move extracted contents into install dir
cp -r "${TMPDIR}/excalirender/." "$INSTALL_DIR/"

# Create symlink
ln -sf "${INSTALL_DIR}/bin/excalirender" "$BIN_LINK"

# --- verify ----------------------------------------------------------------

if [ -x "$BIN_LINK" ]; then
    ok "excalirender ${TAG} installed successfully!"
else
    err "installation failed — ${BIN_LINK} is not executable"
fi

# PATH hint
case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *)
        log ""
        log "Add this to your shell profile to use excalirender:"
        log "  export PATH=\"${BIN_DIR}:\$PATH\""
        log ""
        ;;
esac

log "Run 'excalirender --help' to get started."
log "To uninstall: rm -rf ${INSTALL_DIR} ${BIN_LINK}"
