#!/bin/sh
#
# tailcat-derp-info.sh — extract the DERP relay hostname from a
# tailcat address (either a literal tc… address or a DNS name whose
# TXT record carries "tailcat=<addr>").
#
# Usage:
#   tailcat-derp-info.sh <addr-or-domain>
#
# stdout: the DERP relay hostname (e.g. "derp.178960.xyz"), or the
#         region code (e.g. "nyc"), or "auto" / "unknown".
# stderr: diagnostic messages.
# exit 0 on success (even if the result is "unknown").

TAILCAT_BIN="${TAILCAT_BIN:-/usr/bin/tailcat}"
RESOLVER="${RESOLVER:-/usr/lib/tailcat/tailcat-dns-resolve.sh}"

INPUT="$1"
[ -n "$INPUT" ] || { echo "unknown"; exit 0; }

# Resolve a DNS name to its tailcat address (TXT "tailcat=<addr>").
# A literal tc… address is used as-is.
ADDR=""
case "$INPUT" in
	tc*|TC*)
		ADDR="$INPUT"
		;;
	*)
		if echo "$INPUT" | grep -q '\.'; then
			ADDR=$("$RESOLVER" "$INPUT" 2>/dev/null)
		fi
		;;
esac

[ -n "$ADDR" ] || { echo "unknown"; exit 0; }

# tailcat parse prints JSON with Region[].Nodes[].HostName.
# We extract the first HostName; if absent, fall back to the
# region code embedded in the address prefix.
HOST=$("$TAILCAT_BIN" parse "$ADDR" 2>/dev/null \
	| sed -n 's/.*"HostName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
	| head -1)

if [ -n "$HOST" ]; then
	echo "$HOST"
	exit 0
fi

# Fall back: the 3-letter region code after the scheme prefix.
CODE=$(echo "$ADDR" | sed -n 's/^tc[a-z]\{0,1\}\([a-z]\{3\}\).*/\1/p')
if [ -n "$CODE" ]; then
	echo "$CODE"
	exit 0
fi

echo "unknown"
exit 0
