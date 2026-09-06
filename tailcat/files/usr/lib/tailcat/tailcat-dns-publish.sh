#!/bin/sh
#
# tailcat-dns-publish.sh — publish a serve instance's tailcat address
# to a Cloudflare DNS TXT record, and unpublish it on stop.
#
# Usage:
#   tailcat-dns-publish.sh publish   <section> <addr_file> <dns_name>
#   tailcat-dns-publish.sh unpublish <section>                 <dns_name>
#
# Reads Cloudflare credentials from /etc/config/tailcat:
#   general.cf_api_token  — Cloudflare API token (Zone:DNS:Edit)
#   general.cf_zone_id    — Cloudflare zone ID hosting <dns_name>
#
# The TXT record value is the bare string "tailcat=<addr>". Cloudflare
# adds the surrounding quotes for display; we must NOT send them in the
# API payload, or the value ends up starting with a literal quote and
# tailcat's "tailcat=" prefix matcher fails to resolve it.
#
# Idempotency: before adding, we DELETE any existing TXT record whose
# name == <dns_name>, then POST the fresh record. This avoids "record
# already exists" errors and guarantees the published address is current.
#
# Exit codes:
#   0  published/unpublished (or no-op when credentials absent)
#   1  invalid invocation
#   2  Cloudflare API error (token, zone, or network)
#
# Requires: curl, uci. Both are present on a standard OpenWrt install.

SECTION="$1"
ACTION="$2"

[ -n "$ACTION" ] || { echo "usage: $0 <section> <publish|unpublish> [addr_file] [dns_name]" >&2; exit 1; }
[ -n "$SECTION" ] || { echo "usage: $0 <section> <publish|unpublish> [addr_file] [dns_name]" >&2; exit 1; }

# --- load Cloudflare credentials from UCI -------------------------------
CF_TOKEN=$(uci -q get tailcat.general.cf_api_token || echo "")
CF_ZONE=$(uci -q get tailcat.general.cf_zone_id || echo "")

# No credentials configured → silent no-op. This lets the DNS-publish
# feature be toggled per-instance without requiring global CF creds
# until a publish actually happens.
if [ -z "$CF_TOKEN" ] || [ -z "$CF_ZONE" ]; then
	echo "[$SECTION] dns-publish: cf_api_token/cf_zone_id not set, skipping" >&2
	exit 0
fi

# --- per-action argument binding ----------------------------------------
DNS_NAME=""
ADDR=""
ADDR_FILE=""

case "$ACTION" in
	publish)
		ADDR_FILE="$3"
		DNS_NAME="$4"
		[ -n "$ADDR_FILE" ] && [ -n "$DNS_NAME" ] || {
			echo "[$SECTION] dns-publish publish requires <addr_file> <dns_name>" >&2
			exit 1
		}
		# Read the tailcat address that init.d wrote out.
		# tailcat rewrites TAILCAT_ADDR_FILE continuously while
		# running, so a raw `cat` can catch a half-written buffer
		# (truncated, missing the "tc" prefix, or with mutated
		# chars). Read up to 10 times, accepting the first value
		# that starts with "tc" and is long enough to be real.
		# NOTE: do NOT use `tr -d '[:space:]'` — BusyBox tr has
		# been observed to strip non-space chars (e.g. 'p') from
		# tailcat addresses, corrupting them. Use `head -1` +
		# parameter expansion to strip the trailing newline.
		ADDR=""
		i=0
		while [ "$i" -lt 10 ]; do
		 cand=$(head -1 "$ADDR_FILE" 2>/dev/null)
		 cand=${cand%%[[:space:]]*}
		 if [ -n "$cand" ]; then
		  case "$cand" in
		   tc*)
		    if [ ${#cand} -gt 40 ]; then
		     ADDR="$cand"
		     break
		    fi
		    ;;
		  esac
		 fi
		 i=$((i + 1))
		 sleep 1
		done
		[ -n "$ADDR" ] || {
			echo "[$SECTION] dns-publish: addr file '$ADDR_FILE' empty/missing after 10s" >&2
			exit 2
		}
		;;
	unpublish)
		DNS_NAME="$3"
		[ -n "$DNS_NAME" ] || {
			echo "[$SECTION] dns-publish unpublish requires <dns_name>" >&2
			exit 1
		}
		;;
	*)
		echo "[$SECTION] dns-publish: unknown action '$ACTION'" >&2
		exit 1
		;;
esac

# --- Cloudflare API helpers ---------------------------------------------
# All CF calls use the Bearer token. We treat any non-2xx HTTP as a
# failure and surface the response body on stderr for log diagnostics.

CF_API="https://api.cloudflare.com/client/v4"

cf_call() {
	# cf_call <method> <path> [json-body]
	local method="$1" path="$2" body="$3" hdr
	hdr="Authorization: Bearer $CF_TOKEN"
	hdr="$hdr
Content-Type: application/json"
	if [ -n "$body" ]; then
		curl -fsS -X "$method" "$CF_API$path" \
			-H "$hdr" -d "$body" 2>&1
	else
		curl -fsS -X "$method" "$CF_API$path" \
			-H "$hdr" 2>&1
	fi
}

cf_list_record_id() {
	# Echo the record ID for the given name, or empty if not found.
	# CF's /dns_records endpoint accepts ?name= to filter.
	local rid
	rid=$(cf_call GET "/zones/$CF_ZONE/dns_records?type=TXT&name=$DNS_NAME" \
		| sed -n 's/.*"id":"\([a-f0-9]*\)".*/\1/p' | head -1)
	echo "$rid"
}

cf_delete_by_id() {
	# cf_delete_by_id <record-id>
	local rid="$1"
	[ -n "$rid" ] || return 0
	cf_call DELETE "/zones/$CF_ZONE/dns_records/$rid" >/dev/null 2>&1 || return $?
}

cf_create_txt() {
	# cf_create_txt <dns_name> <"tailcat=<addr>">
	# Per Cloudflare's requirement, the TXT content must be wrapped
	# in surrounding double quotes. The JSON "content" field thus
	# becomes "\"<value>\"" — the inner quotes are literal TXT data,
	# the outer quotes are JSON string delimiters.
	local payload
	payload=$(printf '{"type":"TXT","name":"%s","content":"\\"%s\\"","ttl":300}' \
		"$1" "$2")
	cf_call POST "/zones/$CF_ZONE/dns_records" "$payload" >/dev/null 2>&1 || return $?
}

# --- execute action -----------------------------------------------------

if [ "$ACTION" = "publish" ]; then
	# 1. Delete any existing TXT record at this name (idempotent reset).
	EXISTING_ID=$(cf_list_record_id)
	if [ -n "$EXISTING_ID" ]; then
		cf_delete_by_id "$EXISTING_ID" || {
			echo "[$SECTION] dns-publish: failed to delete existing TXT '$DNS_NAME'" >&2
			exit 2
		}
	fi

	# 2. Create the fresh TXT record with the current address.
	VALUE="tailcat=$ADDR"
	if cf_create_txt "$DNS_NAME" "$VALUE"; then
		echo "[$SECTION] dns-publish: TXT '$DNS_NAME' → $VALUE" >&2
		exit 0
	else
		echo "[$SECTION] dns-publish: failed to create TXT '$DNS_NAME'" >&2
		exit 2
	fi

elif [ "$ACTION" = "unpublish" ]; then
	EXISTING_ID=$(cf_list_record_id)
	if [ -z "$EXISTING_ID" ]; then
		# Nothing to delete — clean state.
		echo "[$SECTION] dns-publish: no TXT at '$DNS_NAME', nothing to unpublish" >&2
		exit 0
	fi
	if cf_delete_by_id "$EXISTING_ID"; then
		echo "[$SECTION] dns-publish: removed TXT '$DNS_NAME'" >&2
		exit 0
	else
		echo "[$SECTION] dns-publish: failed to delete TXT '$DNS_NAME'" >&2
		exit 2
	fi
fi

# Unreachable
exit 0
