# openwrt-tailcat

> [English](README.md) | [中文](README_zh.md)

> Primary repo (GitHub, Actions artifacts are canonical): https://github.com/xuthuslei/openwrt-tailcat
> Mirror repo (AtomGit): https://atomgit.com/lkjx/openwrt-tailcat

An OpenWrt service plugin for [tailscale/tailcat](https://github.com/tailscale/tailcat), providing a LuCI web interface to manage point-to-point encrypted tunnels.

Tailcat is a re-mix of Tailscale's data plane: it works like `netcat` but traffic flows over WireGuard® encrypted point-to-point tunnels, using DERP as the NAT-hole-punching side channel and ultimate relay fallback. **No Tailscale account, no root, userspace only.**

## Features

The plugin manages two kinds of tailcat instances on an OpenWrt router, both CRUD-manageable via LuCI:

| Role | Description | Typical use |
|------|-------------|-------------|
| **serve** (local service) | Expose local ports / auth-free SSH / file drop box on this router, generating a short tailcat address for a remote client to connect | Expose the router's web service, SSH, or a receive directory to a remote |
| **forward** (remote forward) | Dial a named *remote server* and bind a local port that forwards into a remote service port | Let the router present a remote tailcat server's port as an ordinary local port to LAN clients |

A forward instance does not carry the remote tailcat address itself. Instead you define each remote peer once as a **remote server** (name + tailcat address), then reference it by name from any number of forward instances.

The UI follows the pattern of existing OpenWrt VPN services (`luci-app-openvpn`, `luci-app-wireguard`). Four pages are registered under **Services → Tailcat**:

- **Overview**: global on/off toggle, tailcat binary version, and a grid of all instances with per-instance enable checkbox and running state.
- **Local Services** (`serve` instances): grid of serve instances with kind, ports / receive dir, the current tailcat address, and an enable checkbox; Add/Edit modal exposes name, kind, ports, receive dir, verbose, log file.
- **Remote Forwards** (`forward` instances): two grids on one page — **Remote Servers** (name + tailcat address + enable) and **Port Forwards** (one forward instance per row, referencing a named server). The Add/Edit modal exposes name, server, local port, remote port, bind address, open-WAN-firewall, verbose, log file.
- **Log**: pick an instance's `log_file` and stream it with auto-refresh (3 s).

> A `status.js` view also exists in the source tree but is **not** registered in the LuCI menu; per-instance status is instead surfaced as a column on the Overview grid.

## Directory structure

```
openwrt-tailcat/
├── .github/workflows/build.yml      # GitHub Actions: download prebuilt binary, hand-build ipk
│
├── tailcat/                         # Main package
│   ├── Makefile                     # OpenWrt package Makefile (Go source build path)
│   └── files/
│       ├── etc/config/tailcat       # UCI config template (general + server + instance)
│       ├── etc/init.d/tailcat       # procd init script, starts one process per enabled instance
│       └── usr/lib/tailcat/
│           └── tailcat-instance.sh  # Per-instance command-line builder (called by init)
│
└── luci-app-tailcat/                # LuCI interface package (Architecture: all)
    ├── Makefile
    ├── po/
    │   ├── en/tailcat.po            # English translation
    │   └── zh-cn/tailcat.po         # Simplified Chinese translation
    └── src/
        ├── root/usr/share/luci/view/tailcat/
        │   ├── overview.js          # Overview (global toggle + instance grid)
        │   ├── services.js          # Local Services (serve instances)
        │   ├── forwards.js          # Remote Forwards (server grid + forward grid)
        │   ├── status.js            # Status view (present, not menu-registered)
        │   └── log.js               # Log viewer (per-instance, 3 s auto-refresh)
        └── usr/share/
            ├── luci/menu.d/luci-app-tailcat.json   # Menu registration
            └── rpcd/acl.d/luci-app-tailcat.json    # rpcd ACL
```

> The build job in `build.yml` packs the views from `src/root/usr/share/luci/view/tailcat/` into `www/luci-static/resources/view/tailcat/` in the ipk, and compiles the `.po` files into `.lmo` via `scripts/po2lmo.py`.

## Installation

### Option 1: Download prebuilt ipk (recommended)

Every push to `main` triggers GitHub Actions to build multi-arch ipks and attach them to a
[Snapshot Release](https://github.com/xuthuslei/openwrt-tailcat/releases/latest).
Download the file matching your router architecture:

| Architecture (opkg arch) | ipk file | Typical device |
|--------------------------|----------|----------------|
| `x86_64` | `tailcat_0.6.0-1_x86_64.ipk` | x86 software router |
| `aarch64_cortexa53` | `tailcat_0.6.0-1_aarch64_cortexa53.ipk` | Raspberry Pi 3, some ARM routers |
| `arm_cortex-a7_neon-vfpv4` | `tailcat_0.6.0-1_arm_cortex-a7_neon-vfpv4.ipk` | MT76xx, IPQ40xx, etc. |
| `all` | `luci-app-tailcat_0.1.0-1_all.ipk` | LuCI interface, universal for all archs |

Install:

```sh
# Upload the matching-arch tailcat and luci-app-tailcat to the router
opkg install tailcat_*.ipk luci-app-tailcat_*.ipk
/etc/init.d/rpcd restart
# In the router's LuCI backend you'll now see Services → Tailcat
```

> To look up the architecture name: run `opkg print-architecture` on the router, or check the matching `Target`/`Subtarget` in the
> [OpenWrt Table of Hardware](https://openwrt.org/toh/start).

### Option 2: Compile with OpenWrt (feed integration)

This project ships three OpenWrt packages that can be compiled
alongside the firmware, mirroring the
[OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) feed
layout:

| Package | Contents |
|---------|----------|
| `tailcat-core` | UCI config, procd init script, per-instance helper, DNS/DERP helpers, LuCI menu/ACL scaffolding, **fetch-kernel helper** (no binary) |
| `tailcat` | Prebuilt `tailcat` binary fetched at build time from upstream GitHub Releases |
| `luci-app-tailcat` | LuCI JS views (overview, services, forwards, log) + i18n |

**Steps:**

```sh
cd <openwrt-source>

# 1. Add the feed (append to feeds.conf.default)
echo "src-git tailcat https://github.com/xuthuslei/openwrt-tailcat.git;main" \
    >> feeds.conf.default

# 2. Update & install feeds
./scripts/feeds update -a
./scripts/feeds install -a

# 3. Select packages in menuconfig
make menuconfig
#   Network -> VPN -> tailcat-core        (the system kernel layer)
#   Network -> VPN -> tailcat             (prebuilt binary, optional)
#   LuCI    -> Applications -> luci-app-tailcat

# 4. Build packages
make package/tailcat-core/compile V=s
make package/tailcat/compile V=s
make package/luci-app-tailcat/compile V=s

# 5. Or build the whole firmware
make -j$(nproc)
```

The resulting `.ipk` files land under `bin/packages/<arch>/tailcat/`.

> **Note:** the `tailcat` package does **not** compile tailcat from
> source. At build time it downloads the matching prebuilt binary from
> `https://github.com/tailscale/tailcat/releases` and packages it. To
> bake a specific version into the firmware, set `PKG_VERSION` in
> `tailcat/Makefile`.

See [COMPILATION.md](COMPILATION.md) for full details, including:
- How the prebuilt binary is fetched and mapped to `GOARCH`
- Runtime kernel download via the LuCI "Download latest kernel" button
- Feed installation on a running router (`feed.sh`)
- Troubleshooting

## Usage

After installation, navigate to **Services → Tailcat** in LuCI.

### 1. Enable the service

On the **Overview** page, turn on **Enable tailcat service** and save & apply. This page also shows the tailcat binary version and a grid of every instance with its running state.

### 2. Define a remote server (optional, only if you will use `forward`)

On the **Remote Forwards** page, in the **Remote Servers** grid, click **Add remote server**:

| Field | Description |
|-------|-------------|
| Name | A short name to reference this peer from forward instances, e.g. `vps` |
| Tailcat address | The address generated by the remote serve instance, e.g. `tcXXXXXXXXXXXXXXXXXX` |
| Enabled | On/off for this server definition |

A server entry only stores the peer's address; it does not start a process by itself.

### 3. Create a local service (serve)

On the **Local Services** page click **Add serve instance**:

| Field | Description |
|-------|-------------|
| Name | Instance name, e.g. `my_web` |
| Kind | `Expose local ports` / `Auth-free SSH server` / `File drop box (recv)` |
| Ports | Required when Kind is port-expose, e.g. `8080,8443` or `all` |
| Receive directory | Required when Kind is recv, e.g. `/root/tailcat-inbox` |
| Verbose logs | Enable tailcat diagnostic logging |
| Log file | Log output path; tailcat prints the short address here on startup |

After save & apply, the **Tailcat address** column on the same page shows the address (e.g. `tcXXXXXXXXXXXXXXXXXX`); copy it and hand it to the remote client. The address is also written to `/var/run/tailcat/<section>.addr`.

### 4. Connect to a remote service (forward)

On the **Remote Forwards** page, in the **Port Forwards** grid, click **Add port forward**:

| Field | Description |
|-------|-------------|
| Name | Instance name, e.g. `remote_web` |
| Remote server | Pick a named server defined in the Remote Servers grid above |
| Local port | Local TCP port to listen on, e.g. `18080` |
| Remote port | Port on the remote server to forward to, e.g. `8080` |
| Local bind address | Local listen address, defaults to `0.0.0.0` (LAN reachable) |
| Open WAN firewall ports | When enabled, open the WAN-side firewall for the local port so external (Internet) hosts can reach it. LAN access is always available. Default is off. |
| Verbose logs | Enable tailcat diagnostic logging |
| Log file | Log output path |

After save & apply, the local port behaves as if it were the remote service. Each forward instance maps **one** local port to **one** remote port; create multiple forward instances (referencing the same server) for additional ports.

### 5. View status & logs

- The Overview grid shows each instance's running state (running / stopped / disabled).
- The **Log** page lets you pick an instance's log file with auto-refresh (3 s).

## UCI config example

`/etc/config/tailcat`:

```sh
config general 'general'
    option enabled 1
    # option derp_map 'https://example.com/derpmap.json'

# A remote peer, referenced by name from forward instances.
config server 'vps'
    option enabled 1
    option name 'vps'
    option remote_addr 'tcXXXXXXXXXXXXXXXXXX'

# Local service: expose 8080 and 8443.
config instance 'my_web'
    option enabled 1
    option role 'serve'
    option serve_kind 'ports'
    option serve_ports '8080,8443'
    option verbose 0
    option log_file '/var/log/tailcat/my_web.log'

# Remote forward: forward the named 'vps' server's port 8080 to local 18080.
config instance 'remote_web'
    option enabled 1
    option role 'forward'
    option server 'vps'
    option bind_addr '0.0.0.0'
    option local_port '18080'
    option remote_port '8080'
    option open_firewall 0
    option verbose 0
    option log_file '/var/log/tailcat/remote_web.log'
```

Section types:

- `general` — global on/off (`enabled`) and optional custom DERP map (`derp_map`).
- `server` — one remote peer: a `name`, the peer's `remote_addr`, and an `enabled` flag. Forward instances reference these by name.
- `instance` — one tailcat process. `role=serve` exposes a local service; `role=forward` dials a named `server` and binds a local port.

Forward port mapping: the recommended path is one `local_port` + one `remote_port` per instance. The legacy `forwards` option (space-separated `local:remote` pairs, bare port equals `port:port`) still works when `local_port`/`remote_port` are unset.

Common commands:

```sh
/etc/init.d/tailcat enable      # Enable at boot
/etc/init.d/tailcat start       # Start all enabled instances
/etc/init.d/tailcat restart     # Restart
/etc/init.d/tailcat status      # Show status
```

## Continuous integration

[`.github/workflows/build.yml`](.github/workflows/build.yml) triggers on every push to `main`:

1. Download prebuilt tailcat binaries from [tailscale/tailcat Releases](https://github.com/tailscale/tailcat/releases)
   (linux amd64 / arm64 / armv7)
2. Use [`opkg-utils`](https://git.yoctoproject.org/opkg-utils) `opkg-build` to pack
   binary + init script + UCI config into an OpenWrt ipk
3. `luci-app-tailcat` is pure JS + config, packed the same way (`Architecture: all`)
4. All ipks are uploaded as workflow artifacts and attached to a snapshot release

Architecture mapping:

| Go arch | opkg arch |
|---------|-----------|
| `amd64` | `x86_64` |
| `arm64` | `aarch64_cortexa53` |
| `armv7` | `arm_cortex-a7_neon-vfpv4` |

Build status & artifacts:
- Actions run log: https://github.com/xuthuslei/openwrt-tailcat/actions
- Latest snapshot release: https://github.com/xuthuslei/openwrt-tailcat/releases/latest

## Comparison with existing VPN services

| Feature | tailcat (this plugin) | wireguard / openvpn |
|---------|-----------------------|---------------------|
| Control plane | None, address exchanged out-of-band | Needs manual config or coordination server |
| Encryption | WireGuard point-to-point | WireGuard / OpenSSL |
| NAT traversal | DERP-assisted + magicsock | Limited / config-dependent |
| Account | Not required | Not required |
| Typical scenario | Ad-hoc point-to-point, port forward, file transfer | Site-to-site / long-term VPN |

This plugin deliberately reuses the LuCI layout and UCI config conventions of existing OpenWrt VPN services, so users familiar with `luci-app-wireguard` can get started at zero cost.

## Roadmap / TODO

Tracked against tailcat upstream `v0.6.0`. Status legend: `[x]` done · `[ ]` open.

### P0 — correctness & must-fix

- [x] **F-FW-FIX**: `open_firewall` now opens the WAN port for the new `local_port` path, not only the legacy `forwards` option. (commit `268dfe9`)
- [x] **F-MAKEFILE**: `luci-app-tailcat/Makefile` install paths now match the on-disk view layout (`src/root/usr/share/luci/view/tailcat/*.js`). Local `make package/luci-app-tailcat/compile` produces a correct ipk; no longer CI-only. (commit `0b31521`)
- [ ] **F-PO-CLEANUP**: prune `po/en` and `po/zh-cn` to match the strings the views actually emit (stale `Remote tailcat address` / `Port forwards (local:remote pairs)` msgids remain).

### P1 — high-value feature gaps (upstream already ships the capability)

- [x] **F-EXIT-FWD**: forward through exit-node servers to arbitrary `IP:port` targets (`local:remote-ip:remote-port` form). `tailcat-instance.sh` emits the 3-part mapping when `remote_host` is set; overview.js exposes a "Remote host (exit-node)" field in the forward modal. (commit `0b31521`)
- [x] **F-GENKEY**: persistent keys via `tailcat genkey`. New uci-defaults script auto-generates the `default` server key on first install; per-instance `--key=<name>` support in `tailcat-instance.sh`; "Persistent key name" field in overview.js + services.js. DNS-published services now keep a stable address across restarts. (commit `0b31521`)
- [ ] **F-UDP**: application-layer UDP support — **upstream-blocked in tailcat 0.6.0**. The Go library and `tailcat socks` support UDP, but the `serve` and `forward` subcommands expose no `--protocol=udp` flag (forward is TCP-only). Revisit when upstream ships a UDP CLI surface.
- [x] **F-SSH-AUTH**: `serve ssh` public-key authentication (`--ssh-authorized-keys`, upstream v0.6.0 #88). New `serve_kind=ssh_auth` runs `tailcat serve --ssh-authorized-keys=<sources> ssh`; the `ssh_authorized_keys` field is shown conditionally on `serve_kind=ssh_auth` in overview.js and services.js. Existing `serve_kind=ssh` (auth-free) is unchanged. Multi-select SSH key sources added: `ssh_use_dropbear_keys` (Flag, default=1, includes `/etc/dropbear/authorized_keys`), `ssh_github_users` (Value, e.g. `alice,bob`), `ssh_extra_key_files` (Value, additional file paths). The three sources are assembled into the `--ssh-authorized-keys` CSV by `tailcat-instance.sh`.
- [x] **F-DNS-PUBLISH**: publish a serve instance's tailcat address to a Cloudflare TXT record. New `dns_publish` flag + `dns_name` field on serve instances (overview.js + services.js); `general.cf_api_token`/`cf_zone_id` credentials on the Overview page. `tailcat-dns-publish.sh` writes `tailcat=<addr>` (bare value, no quotes) at the FQDN; init.d publishes after the address file populates and unpublishes on stop/reload. The publish poll window was extended from 10s to 60s because tailcat only writes `TAILCAT_ADDR_FILE` after key load + DERP bootstrap (15–25s on cold start). Atomic read with `tc*` validation added because tailcat continuously rewrites the addr file (BusyBox `tr -d '[:space:]'` was corrupting addresses by stripping non-space chars). TXT content wrapped in literal double quotes per Cloudflare requirement.
- [x] **F-DNS-RESOLVE**: connect to a DNS-published remote server. `server` sections may now carry a domain name in `remote_addr`; `tailcat-instance.sh` detects non-`tc...` values and resolves them via `tailcat-dns-resolve.sh` (dig → nslookup → host, stripping `tailcat=` prefix).
- [x] **F-SERVE-FILES**: `serve files` SFTP server with `--files=dir:ro|rw|wo|wo+`. New `serve_kind=files` + directory Value + mode ListValue (conditional). Modes: `ro` (read-only, default), `rw` (read-write), `wo` (write-only flat), `wo+` (write-only recursive). (commit `0b31521`)
- [x] **F-SERVE-EXIT**: `serve exit-node` mode — run this router as an exit node for all remote-client traffic. New `serve_kind=exit_node` option in the Kind dropdown (overview.js + services.js); `tailcat-instance.sh` emits `serve exit-node`.
- [x] **F-DERP-LOCAL**: per-instance DERP relay selection for serve instances. New `derp_region` + `derp_fixed` UCI options; `tailcat-instance.sh` (re)generates the named key with `--region=<region> [--fixed-region]` before serve, baking the chosen DERP relay into the key and tailcat address. Region can be an ID (301), code (nyc), name substring, or a custom DERP server hostname. "auto" = pick by latency at each startup. (commit `624859f`)
- [x] **F-DERP-REMOTE**: DERP relay info column on the Overview grid for forward instances. init.d resolves the DERP relay hostname via `tailcat-derp-info.sh` (which runs `tailcat parse` and extracts `Region.Nodes[].HostName`) and writes it to `/var/run/tailcat/<section>.derp` synchronously before procd launch. overview.js `load()` reads these files via `fs.read` (chained after `uci.load` resolves) into a `derpMap`, and the `_derp` column renders the hostname. (commits `2e13be9`, `e19a9a9`, `9f46b67`)

### P2 — medium value

- [ ] **F-PING-STATUS**: surface `tailcat ping --timeout=5s <remote_addr>` result (latency + DERP/direct path) as a column on the Overview grid.
- [x] **F-ALLOW**: per-instance `--allow=<pubkeys>` client allowlist (textarea in the modal). `tailcat-instance.sh` prepends `--allow=<csv>` for serve kinds `ports`/`ssh`/`ssh_auth`/`exit_node` (NOT `recv`, which is its own subcommand and rejects the flag). Without this, any peer that knows the tailcat address can reach the service.
- [ ] **F-PSK-OPTOUT**: expose `--psk=false` as a "Generate address without PSK" checkbox (addresses stay shorter for manual transcription).
- [ ] **F-FULL-ADDRESS**: expose `--full-address` so serve prints a self-contained address (no DERP map fetch needed by clients).
- [ ] **F-ERR-COLUMN**: add a "last error" column to the Overview grid; init script writes `/var/run/tailcat/<section>.err` when the instance helper exits non-zero.
- [x] **F-UI-TRUNCATE**: long tailcat addresses (>18 chars, `tc…` prefix) are truncated to the first 14 chars + `…` in the services.js (本机服务) and forwards.js (远程转发) instance grids, keeping the table compact. Domains are shown in full. services.js additionally renders a `⧉` copy button next to each serve instance address; clicking copies the full address to the clipboard (with `✓` confirmation). (commit `f72f571`)

### P3 — robustness & maintainability

- [ ] **F-RESPAWN-LIMIT**: add `procd_set_param respawn_retry 3` + backoff so a crash-looping instance doesn't spam its log file.
- [ ] **F-STATUS-CONNECT**: either register `status.js` in the LuCI menu (as "Status", between Overview and Services) or delete it — it's currently dead code.
- [ ] **F-OVERVIEW-SPLIT**: split `overview.js` (187 lines, mixing global settings / instance grid / per-role modal fields) into a grid module + per-role modal modules before the P1 feature additions balloon it past 500 lines.
- [ ] **F-RELEASE-DISPATCH**: add a `workflow_dispatch` input for version number that produces a non-prerelease tagged release; today every push to `main` only creates a `prerelease: true` snapshot.
- [ ] **F-SHA256-VERIFY**: verify a published sha256 checksum when CI downloads the prebuilt tailcat binary (defense against a tampered upstream release).

### Deferred (post-0.2)

- SOCKS5 proxy (`tailcat socks`) — overlaps existing `forward`; revisit after exit-node lands.
- `resolve` / `ls` / `cp` integration — client-side subcommands, not router-side LuCI surface.

## License

MIT, see [LICENSE](LICENSE).
