# Linux Installation

## Quick Install

```bash
# Using curl
curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh

# Using wget
wget -qO- https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
```

## Options

Configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VERSION` | latest release | Install a specific version, e.g. `v1.0.0` |
| `PREFIX` | `/usr/local` (root) or `~/.local` (user) | Installation prefix |

```bash
# Install a specific version
VERSION=v1.2.0 curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh

# Install to a custom prefix
PREFIX=/opt curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
```

## Install Locations

The script auto-detects whether it's running as root:

| | Root (`sudo`) | Non-root |
|---|---|---|
| **Binary + libs** | `/usr/local/lib/excalirender/` | `~/.local/lib/excalirender/` |
| **Symlink** | `/usr/local/bin/excalirender` | `~/.local/bin/excalirender` |

After installation the file layout is:

```
$PREFIX/
├── bin/
│   └── excalirender -> ../lib/excalirender/bin/excalirender  (symlink)
└── lib/
    └── excalirender/
        ├── bin/
        │   ├── excalirender      # Shell launcher (sets LD_LIBRARY_PATH)
        │   └── excalirender.bin  # Bun standalone binary
        ├── lib/
        │   └── *.so*             # Bundled shared libraries (Cairo, Pango, etc.)
        └── etc/
            └── fonts/
                └── fonts.conf    # Minimal fontconfig configuration
```

If `$PREFIX/bin` is not in your `PATH`, the script prints a hint to add it.

## Requirements

- Linux x86_64
- `curl` or `wget`
- `tar`
- glibc 2.31+ (Ubuntu 20.04+, Debian 11+, Fedora 33+, RHEL 9+, Arch)

No other system dependencies are required. All native libraries (Cairo, Pango, Pixman, etc.) are bundled in the tarball.

## How It Works

The install script is a POSIX shell script (`/bin/sh`) with no bash-specific features, ensuring it runs on any Linux distribution.

Steps:

1. **Preflight checks** — verifies Linux x86_64, checks for `curl`/`wget` and `tar`
2. **Version resolution** — queries the GitHub Releases API for the latest tag, or uses the `VERSION` env var
3. **Download** — fetches the `excalirender-linux-x64.tar.gz` tarball from the GitHub release
4. **Extract** — unpacks into a temporary directory
5. **Install** — copies files to `$PREFIX/lib/excalirender/`, removes any previous installation first
6. **Symlink** — creates `$PREFIX/bin/excalirender` pointing to the launcher script
7. **Verify** — confirms the symlink is executable

### Why a self-contained tarball

The native tarball bundles all shared library dependencies (collected via `ldd` during the Docker build) so the binary works on any Linux x64 system without installing Cairo, Pango, or other system packages. Only core glibc libraries (`libc`, `libm`, `libpthread`, `libdl`) are expected from the host — these are present on every Linux system.

The launcher script (`bin/excalirender`) sets `LD_LIBRARY_PATH` to the bundled `lib/` directory before executing the real binary, so the bundled libraries take precedence over any system versions.

## Uninstall

```bash
rm -rf $PREFIX/lib/excalirender $PREFIX/bin/excalirender
```

Where `$PREFIX` is `/usr/local` (root install) or `~/.local` (user install), unless you specified a custom prefix.

## Upgrading

Running the install script again replaces the previous installation. It removes the old files before copying the new ones.
