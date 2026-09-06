#!/bin/sh
#
# tailcat-keys.sh — manage persistent tailcat keys.
#
# Usage:
#   tailcat-keys.sh list              — list key names (one per line)
#   tailcat-keys.sh generate <name>   — generate/overwrite key <name>
#   tailcat-keys.sh delete <name>     — delete key <name>
#   tailcat-keys.sh address <name>    — print the tailcat address for <name>
#
# Key files are stored at /root/.config/tailcat/keys/<name>.private.json.
# The name "default" is magic: tailcat serve loads it automatically.

TAILCAT_BIN="${TAILCAT_BIN:-/usr/bin/tailcat}"

ACTION="$1"
NAME="$2"

[ -x "$TAILCAT_BIN" ] || { echo "tailcat binary not found at $TAILCAT_BIN" >&2; exit 1; }

case "$ACTION" in
	list)
		"$TAILCAT_BIN" genkey --list 2>/dev/null
		;;
	generate)
		[ -n "$NAME" ] || { echo "usage: $0 generate <name>" >&2; exit 1; }
		"$TAILCAT_BIN" genkey --key="$NAME" --force 2>&1
		;;
	delete)
		[ -n "$NAME" ] || { echo "usage: $0 delete <name>" >&2; exit 1; }
		"$TAILCAT_BIN" genkey --delete --key="$NAME" 2>&1
		;;
	address)
		[ -n "$NAME" ] || { echo "usage: $0 address <name>" >&2; exit 1; }
		# genkey prints the address to stdout when the key already exists.
		"$TAILCAT_BIN" genkey --key="$NAME" --force 2>/dev/null
		;;
	*)
		echo "usage: $0 <list|generate|delete|address> [name]" >&2
		exit 1
		;;
esac
