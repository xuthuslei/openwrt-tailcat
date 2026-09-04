#!/bin/sh
#
# tailcat-instance.sh — build the full argv for one UCI instance.
#
# Usage: tailcat-instance.sh <section>
#
# stdout : one line, the space-separated shell-quoted argv that
#          procd should launch (tailcat binary + all flags/args).
# stderr : human-readable error/status messages.
# exit 0 : instance enabled, argv printed.
# exit 1 : instance disabled or config invalid (see stderr).

SECTION="$1"
TAILCAT_BIN="${TAILCAT_BIN:-/usr/bin/tailcat}"

[ -n "$SECTION" ] || { echo "usage: $0 <section>" >&2; exit 1; }
[ -x "$TAILCAT_BIN" ] || { echo "tailcat binary not found at $TAILCAT_BIN" >&2; exit 1; }

# --- load config ---------------------------------------------------------
enabled=$(uci -q get tailcat.$SECTION.enabled || echo 0)
role=$(uci -q get tailcat.$SECTION.role || echo "serve")
verbose=$(uci -q get tailcat.$SECTION.verbose || echo 0)
log_file=$(uci -q get tailcat.$SECTION.log_file || echo "")
derp_map=$(uci -q get tailcat.general.derp_map || echo "")
derp_map_inst=$(uci -q get tailcat.$SECTION.derp_map || echo "")
[ -n "$derp_map_inst" ] && derp_map="$derp_map_inst"

[ "$enabled" = "1" ] || { echo "[$SECTION] disabled" >&2; exit 1; }
[ "$role" = "serve" ] || [ "$role" = "forward" ] || {
  echo "[$SECTION] unknown role '$role'" >&2; exit 1
}

# ensure log dir exists
if [ -n "$log_file" ]; then
  mkdir -p "$(dirname "$log_file")" 2>/dev/null
fi

# --- argv builder --------------------------------------------------------
# We accumulate args in $@ by setting positional params.
set --

set -- "$@" "$TAILCAT_BIN"

[ "$verbose" = "1" ] && set -- "$@" --verbose
[ -n "$derp_map" ] && set -- "$@" "--derpmap-url=$derp_map"

if [ "$role" = "serve" ]; then
  serve_kind=$(uci -q get tailcat.$SECTION.serve_kind || echo "ports")
  serve_ports=$(uci -q get tailcat.$SECTION.serve_ports || echo "")
  recv_dir=$(uci -q get tailcat.$SECTION.recv_dir || echo "")

  set -- "$@" serve
  case "$serve_kind" in
    ports)
      [ -n "$serve_ports" ] || { echo "[$SECTION] serve_kind=ports but serve_ports empty" >&2; exit 1; }
      set -- "$@" "$serve_ports"
      ;;
    ssh)
      set -- "$@" no-auth-ssh
      ;;
    recv)
      [ -n "$recv_dir" ] || { echo "[$SECTION] serve_kind=recv but recv_dir empty" >&2; exit 1; }
      set -- "$@" recv "$recv_dir"
      ;;
    *)
      echo "[$SECTION] unknown serve_kind '$serve_kind'" >&2; exit 1
      ;;
  esac

elif [ "$role" = "forward" ]; then
  server=$(uci -q get tailcat.$SECTION.server || echo "")
  bind_addr=$(uci -q get tailcat.$SECTION.bind_addr || echo "0.0.0.0")
  forwards=$(uci -q get tailcat.$SECTION.forwards || echo "")

  # Resolve the remote tailcat address from the referenced 'server' section.
  # Match by the server's 'name' option, or by the section id itself.
  remote_addr=""
  if [ -n "$server" ]; then
    server_sec=""
    for sec in $(uci show tailcat 2>/dev/null | sed -n 's/^tailcat\.\([^.]*\)\.remote_addr=.*$/\1/p' | sort -u); do
      s_name=$(uci -q get tailcat.$sec.name || echo "$sec")
      if [ "$s_name" = "$server" ] || [ "$sec" = "$server" ]; then
        server_sec="$sec"
        break
      fi
    done
    if [ -n "$server_sec" ]; then
      remote_addr=$(uci -q get tailcat.$server_sec.remote_addr || echo "")
    else
      echo "[$SECTION] server '$server' not found" >&2
      exit 1
    fi
  fi

  [ -n "$remote_addr" ] || { echo "[$SECTION] forward requires a server with remote_addr" >&2; exit 1; }
  [ -n "$forwards" ] || { echo "[$SECTION] forward requires forwards" >&2; exit 1; }

  # As a router, forward instances always listen on 0.0.0.0 so LAN
  # clients can reach them. The open_firewall UCI flag controls
  # whether the WAN-side firewall port is opened (see init script).
  # tailcat forward defaults to 127.0.0.1, so we must pass --bind
  # explicitly whenever the configured bind is 0.0.0.0.
  set -- "$@" forward
  set -- "$@" "--bind=$bind_addr"
  set -- "$@" "$remote_addr"
  for m in $forwards; do set -- "$@" "$m"; done
fi

# --- emit shell-quoted argv on one line ----------------------------------
out=""
for a in "$@"; do
  # single-quote-escape: replace ' with '\''
  esc=$(printf '%s' "$a" | sed "s/'/'\\\\''/g")
  out="$out '$esc'"
done

# strip leading space, print, newline
printf '%s\n' "${out# }"
