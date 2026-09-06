#!/bin/sh
#
# tailcat-dns-resolve.sh — resolve a tailcat address from a DNS TXT record.
#
# Usage:
#   tailcat-dns-resolve.sh <dns-name>
#
# stdout : the bare tailcat address (e.g. "tcpGFwWC…"), with the
#          "tailcat=" prefix stripped from the TXT value.
# stderr : human-readable error/status messages.
# exit 0 : address found and printed.
# exit 1 : invalid invocation or no TXT record found.
#
# The TXT record value is expected to be the bare string
# "tailcat=<addr>" (see tailcat-dns-publish.sh). dig/nslookup both
# return the value with surrounding quotes; we strip them along with
# the "tailcat=" prefix.
#
# Tool selection (in order of preference):
#   - dig       : OpenWrt `bind-dig` package, clean +short TXT output.
#   - nslookup  : BusyBox built-in on ImmortalWrt, present by default.
#   - host      : `bind-host` package, fallback.
# Both dig and nslookup are tried; the first to yield a non-empty
# "tailcat=" value wins.

DNS_NAME="$1"

[ -n "$DNS_NAME" ] || { echo "usage: $0 <dns-name>" >&2; exit 1; }

# --- attempt resolution with each available tool -----------------------

resolve_with_dig() {
	# dig +short TXT <name> prints the TXT value quoted, e.g.:
	#   "tailcat=tcpGFwWCBSbOvypXiix…"
	command -v dig >/dev/null 2>&1 || return 1
	dig +short TXT "$DNS_NAME" 2>/dev/null \
		| sed -e 's/^"//' -e 's/"$//' \
		| grep -m1 '^tailcat=' \
		| sed 's/^tailcat=//'
}

resolve_with_nslookup() {
	# BusyBox nslookup output:
	#   Name:      foo.example.com
	#   Address 1: 1.2.3.4
	#   foo.example.com	text = "tailcat=tcp…"
	# We pull the "text =" line and strip quotes + prefix.
	command -v nslookup >/dev/null 2>&1 || return 1
	nslookup -type=TXT "$DNS_NAME" 2>/dev/null \
		| grep -E 'text = ' \
		| sed -e 's/.*text = "//' -e 's/"$//' \
		| grep -m1 '^tailcat=' \
		| sed 's/^tailcat=//'
}

resolve_with_host() {
	# `host -t TXT <name>` prints: foo.example.com descriptive text "tailcat=…"
	command -v host >/dev/null 2>&1 || return 1
	host -t TXT "$DNS_NAME" 2>/dev/null \
		| grep -E 'descriptive text' \
		| sed -e 's/.*"//' -e 's/"$//' \
		| grep -m1 '^tailcat=' \
		| sed 's/^tailcat=//'
}

ADDR=""
for fn in resolve_with_dig resolve_with_nslookup resolve_with_host; do
	ADDR=$($fn 2>/dev/null)
	if [ -n "$ADDR" ]; then
		echo "$ADDR"
		exit 0
	fi
done

echo "no TXT record 'tailcat=<addr>' found for '$DNS_NAME'" >&2
exit 1
