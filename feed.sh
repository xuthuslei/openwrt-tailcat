#!/bin/sh
# feed.sh — add the openwrt-tailcat feed to a running OpenWrt router.
#
# This script is the runtime equivalent of adding a `src-git` line to
# feeds.conf.default inside an OpenWrt buildroot. It is meant to be
# piped to ash on a freshly flashed router:
#
#   wget -O - https://raw.githubusercontent.com/xuthuslei/openwrt-tailcat/main/feed.sh | ash
#
# After running it, `opkg update` will see the tailcat feed and you can
# `opkg install tailcat-core` (UI + config) and/or `opkg install tailcat`
# (prebuilt binary fetched at build time, not useful on a running router
# — use the LuCI "Download latest kernel" button instead).

set -eu

# Only makes sense on a running OpenWrt with opkg.
if [ ! -x /bin/opkg ] && [ ! -x /usr/bin/opkg ]; then
	echo "feed.sh: only supports OpenWrt with opkg" >&2
	exit 1
fi

OPKG=/bin/opkg
[ -x "$OPKG" ] || OPKG=/usr/bin/opkg

FEED_NAME="tailcat"
FEED_URL="https://raw.githubusercontent.com/xuthuslei/openwrt-tailcat/main"
CUSTOMFEEDS="/etc/opkg/customfeeds.conf"

# Idempotent: remove any prior tailcat feed line, then append.
if grep -q "$FEED_NAME" "$CUSTOMFEEDS" 2>/dev/null; then
	sed -i "/$FEED_NAME/d" "$CUSTOMFEEDS"
fi

# We publish a static feed listing (feed.index) rather than a full
# opkg repo, because the binary package is fetched on-demand by LuCI.
# For a buildroot feed use feeds.conf.default instead.
echo "src/gz $FEED_NAME $FEED_URL/dist" >> "$CUSTOMFEEDS"

echo "feed added: $FEED_NAME"
echo "run: opkg update && opkg install tailcat-core"
