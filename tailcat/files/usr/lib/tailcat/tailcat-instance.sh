#!/bin/sh
#
# tailcat-instance.sh — build a procd command line for one UCI instance.
#
# Usage: tailcat-instance.sh <section> <role>
#
# Emits PROCD:* control lines on stdout, consumed by the init script.
# This is a separate script so the init script stays tiny and so the
# command construction can be tested independently.

SECTION="$1"
ROLE="$2"
TAILCAT_BIN="${TAILCAT_BIN:-/usr/bin/tailcat}"

[ -n "$SECTION" ] && [ -n "$ROLE" ] || {
	echo "PROCD:ERROR=usage: $0 <section> <role>"
	exit 1
}

[ -x "$TAILCAT_BIN" ] || {
	echo "PROCD:ERROR=tailcat binary not found at $TAILCAT_BIN"
	exit 1
}

# Pull the rest of the config from UCI.
verbose=$(uci -q get tailcat.$SECTION.verbose || echo 0)
log_file=$(uci -q get tailcat.$SECTION.log_file || echo "")
derp_map=$(uci -q get tailcat.general.derp_map || echo "")
# allow per-instance override
derp_map_inst=$(uci -q get tailcat.$SECTION.derp_map || echo "")
[ -n "$derp_map_inst" ] && derp_map="$derp_map_inst"

# Ensure the log directory exists.
if [ -n "$log_file" ]; then
	mkdir -p "$(dirname "$log_file")"
fi

emit_instance_open() {
	echo "PROCD:INSTANCE=$SECTION"
	echo "PROCD:COMMAND=$TAILCAT_BIN"
}

emit_global_env() {
	if [ -n "$derp_map" ]; then
		echo "PROCD:ENV=TAILCAT_DERP_MAP=$derp_map"
	fi
	if [ "$verbose" = "1" ]; then
		echo "PROCD:PARAM=--verbose"
	fi
}

emit_log_redirect() {
	# procd handles stdout/stderr via respawn; we redirect in the command
	# using a small wrapper. Simpler: use procd_set_param stdout/stderr.
	# The init script reads PROCD:LOG to set that.
	if [ -n "$log_file" ]; then
		echo "PROCD:LOG=$log_file"
	fi
}

emit_serve() {
	local serve_kind serve_ports recv_dir
	serve_kind=$(uci -q get tailcat.$SECTION.serve_kind || echo "ports")
	serve_ports=$(uci -q get tailcat.$SECTION.serve_ports || echo "")
	recv_dir=$(uci -q get tailcat.$SECTION.recv_dir || echo "")

	echo "PROCD:PARAM=serve"
	case "$serve_kind" in
		ports)
			if [ -z "$serve_ports" ]; then
				echo "PROCD:ERROR=[$SECTION] serve_kind=ports but serve_ports is empty"
				return 1
			fi
			echo "PROCD:PARAM=$serve_ports"
			;;
		ssh)
			echo "PROCD:PARAM=no-auth-ssh"
			;;
		recv)
			if [ -z "$recv_dir" ]; then
				echo "PROCD:ERROR=[$SECTION] serve_kind=recv but recv_dir is empty"
				return 1
			fi
			echo "PROCD:PARAM=recv"
			echo "PROCD:PARAM=$recv_dir"
			;;
		*)
			echo "PROCD:ERROR=[$SECTION] unknown serve_kind '$serve_kind'"
			return 1
			;;
	esac
}

emit_forward() {
	local remote_addr bind_addr forwards
	remote_addr=$(uci -q get tailcat.$SECTION.remote_addr || echo "")
	bind_addr=$(uci -q get tailcat.$SECTION.bind_addr || echo "127.0.0.1")
	forwards=$(uci -q get tailcat.$SECTION.forwards || echo "")

	if [ -z "$remote_addr" ]; then
		echo "PROCD:ERROR=[$SECTION] forward role requires remote_addr"
		return 1
	fi
	if [ -z "$forwards" ]; then
		echo "PROCD:ERROR=[$SECTION] forward role requires forwards"
		return 1
	fi

	# --bind must come before the subcommand
	echo "PROCD:PARAM=--bind=$bind_addr"
	echo "PROCD:PARAM=forward"
	echo "PROCD:PARAM=$remote_addr"
	# shellcheck disable=SC2086
	echo "PROCD:PARAM=$forwards"
}

emit_instance_close() {
	echo "PROCD:CLOSE"
}

main() {
	emit_instance_open || exit 1
	emit_global_env
	case "$ROLE" in
		serve)  emit_serve || exit 1 ;;
		forward) emit_forward || exit 1 ;;
		*) echo "PROCD:ERROR=unknown role '$ROLE'"; exit 1 ;;
	esac
	emit_log_redirect
	emit_instance_close
}

main
