#!/bin/sh
#
# tailcat-fetch-kernel.sh — fetch a prebuilt tailcat binary from
# upstream GitHub Releases and install it as /usr/bin/tailcat.
#
# Usage:
#   tailcat-fetch-kernel.sh [version] [goarch]
#
#   version  — tailcat release tag without the leading "v".
#              Default: read from /etc/tailcat-version or "0.6.0".
#   goarch   — Go GOARCH (amd64, arm64, arm, …).
#              Default: auto-detect from `uname -m`.
#
# The binary is downloaded to a temp file, verified non-empty, then
# atomically moved into /usr/bin/tailcat. After a successful fetch we
# reload the tailcat service so running instances pick up the new
# binary.
#
# stdout: the installed version string on success.
# stderr: progress + error messages.
# exit 0 on success, non-zero on failure.

set -eu

VERSION="${1:-}"
GOARCH_ARG="${2:-}"

# Default version if none given.
if [ -z "$VERSION" ]; then
	if [ -r /etc/tailcat-version ]; then
		VERSION=$(cat /etc/tailcat-version | tr -d '[:space:]')
	fi
fi
[ -n "$VERSION" ] || VERSION="0.6.0"

# Auto-detect GOARCH from uname -m.
detect_goarch() {
	case "$(uname -m)" in
		x86_64)  echo "amd64" ;;
		aarch64) echo "arm64" ;;
		armv7l|armv6l|arm*) echo "arm" ;;
		mips)    echo "mips" ;;
		mipsel)  echo "mipsle" ;;
		i386|i686) echo "386" ;;
		*) echo "" ;;
	esac
}

GOARCH="$GOARCH_ARG"
[ -n "$GOARCH" ] || GOARCH=$(detect_goarch)
[ -n "$GOARCH" ] || {
	echo "fetch-kernel: could not auto-detect GOARCH; pass it explicitly" >&2
	echo "usage: $0 [version] [goarch]" >&2
	exit 2
}

UPSTREAM="https://github.com/tailscale/tailcat/releases/download"
URL="$UPSTREAM/v$VERSION/tailcat_${VERSION}_linux_${GOARCH}.tar.gz"

echo "fetch-kernel: downloading tailcat v$VERSION ($GOARCH)…" >&2
TMP=$(mktemp -d /tmp/tailcat-fetch.XXXXXX) || {
	echo "fetch-kernel: mktemp failed" >&2
	exit 1
}
trap 'rm -rf "$TMP"' EXIT

if command -v wget >/dev/null 2>&1; then
	wget -q -O "$TMP/tailcat.tar.gz" "$URL" || {
		echo "fetch-kernel: wget failed for $URL" >&2
		exit 1
	}
elif command -v curl >/dev/null 2>&1; then
	curl -fsSL -o "$TMP/tailcat.tar.gz" "$URL" || {
		echo "fetch-kernel: curl failed for $URL" >&2
		exit 1
	}
else
	echo "fetch-kernel: neither wget nor curl available" >&2
	exit 3
fi

# Extract.
tar -xzf "$TMP/tailcat.tar.gz" -C "$TMP" 2>/dev/null || {
	# Some releases ship uncompressed binaries; try finding one.
	true
}

# Locate the tailcat binary.
BIN=$(find "$TMP" -type f -name 'tailcat' | head -1)
[ -n "$BIN" ] || BIN=$(find "$TMP" -type f -name 'tailcat_*' | head -1)
[ -n "$BIN" ] || {
	echo "fetch-kernel: tailcat binary not found in tarball" >&2
	exit 4
}

# Sanity check: non-empty file.
SIZE=$(wc -c < "$BIN" 2>/dev/null || echo 0)
[ "$SIZE" -gt 1000000 ] || {
	echo "fetch-kernel: downloaded binary too small ($SIZE bytes), aborting" >&2
	exit 5
}

chmod 0755 "$BIN"

# Atomic install.
mkdir -p /usr/bin
INSTALL_PATH="/usr/bin/tailcat"

# If /usr/bin/tailcat is a symlink (from tailcat-core postinst), remove
# it so we can place a real file there.
if [ -L "$INSTALL_PATH" ]; then
	rm -f "$INSTALL_PATH"
fi

# Atomic move via temp name in same dir.
mv "$BIN" "${INSTALL_PATH}.tmp"
mv -f "${INSTALL_PATH}.tmp" "$INSTALL_PATH"

echo "fetch-kernel: installed tailcat v$VERSION to $INSTALL_PATH" >&2

# Record the version for future fetches + LuCI display.
echo "$VERSION" > /etc/tailcat-version 2>/dev/null || true

# Reload the service so running instances pick up the new binary.
if [ -x /etc/init.d/tailcat ]; then
	/etc/init.d/tailcat reload 2>/dev/null || true
fi

# Print installed version on stdout.
echo "$VERSION"
