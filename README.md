# openwrt-tailcat

> [English](README.md) | [中文](README_zh.md)

> Primary repo (GitHub, Actions artifacts are canonical): https://github.com/xuthuslei/openwrt-tailcat
> Mirror repo (AtomGit): https://atomgit.com/lkjx/openwrt-tailcat

An OpenWrt service plugin for [tailscale/tailcat](https://github.com/tailscale/tailcat), providing a LuCI web interface to manage point-to-point encrypted tunnels.

Tailcat is a re-mix of Tailscale's data plane: it works like `netcat` but traffic flows over WireGuard® encrypted point-to-point tunnels, using DERP as the NAT-hole-punching side channel and ultimate relay fallback. **No Tailscale account, no root, userspace only.**

## Features

The plugin provides two tailcat instance types on an OpenWrt router, both CRUD-manageable via LuCI:

| Role | Description | Typical use |
|------|-------------|-------------|
| **serve** (local service) | Expose local ports / SSH / file drop box on this router, generating a short tailcat address for a remote client to connect | Expose the router's web service, SSH, or config backup dir to a remote |
| **forward** (remote forward) | Connect to a remote tailcat address and bind one or more local ports that forward into the remote service | Let the router present a remote tailcat server's ports as ordinary local ports to LAN clients |

The UI follows the pattern of existing OpenWrt VPN services (`luci-app-openvpn`, `luci-app-wireguard`):
- **Overview page**: global toggle, tailcat version, summary of all instances
- **Local Services page**: manage `serve` instances (port expose / auth-free SSH / file drop box)
- **Remote Forwards page**: manage `forward` instances (remote address + local port forwards)
- **Status page**: show each instance's running state and the serve instance's current tailcat address (parsed from log)
- **Log page**: pick an instance's log file and stream with auto-refresh

## Directory structure

```
openwrt-tailcat/
├── .github/workflows/build.yml      # GitHub Actions: download prebuilt binary + opkg-build
│
├── tailcat/                         # Main package
│   ├── Makefile                     # OpenWrt package Makefile
│   └── files/
│       ├── etc/config/tailcat       # UCI config template
│       ├── etc/init.d/tailcat       # procd init script, starts one process per UCI instance
│       └── usr/lib/tailcat/
│           └── tailcat-instance.sh  # Per-instance command-line builder (called by init)
│
└── luci-app-tailcat/                # LuCI interface package
    ├── Makefile
    ├── po/
    │   ├── en/tailcat.po            # English translation
    │   └── zh-cn/tailcat.po         # Simplified Chinese translation
    └── src/
        ├── root/usr/share/luci/
        │   └── view/tailcat/
        │       ├── overview.js      # Overview page
        │       ├── services.js      # Local Services (serve) config
        │       ├── forwards.js      # Remote Forwards (forward) config
        │       ├── status.js        # Runtime status page
        │       └── log.js           # Log viewer page
        ├── usr/share/luci/menu.d/luci-app-tailcat.json   # Menu registration
        └── usr/share/rpcd/acl.d/luci-app-tailcat.json    # rpcd ACL
```

## Installation

### Option 1: Download prebuilt ipk (recommended)

Every push to `main` triggers GitHub Actions to build multi-arch ipks and attach them to a
[Snapshot Release](https://github.com/xuthuslei/openwrt-tailcat/releases/latest).
Download the file matching your router architecture:

| Architecture (opkg arch) | ipk file | Typical device |
|--------------------------|----------|----------------|
| `x86_64` | `tailcat_0.5.0-1_x86_64.ipk` | x86 software router |
| `aarch64_cortexa53` | `tailcat_0.5.0-1_aarch64_cortexa53.ipk` | Raspberry Pi 3, some ARM routers |
| `arm_cortex-a7_neon-vfpv4` | `tailcat_0.5.0-1_arm_cortex-a7_neon-vfpv4.ipk` | MT76xx, IPQ40xx, etc. |
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

### Option 2: Compile from source

Requires a full OpenWrt source tree + Go toolchain:

```sh
cd <openwrt-source>
git clone https://github.com/xuthuslei/openwrt-tailcat.git /tmp/openwrt-tailcat
ln -s /tmp/openwrt-tailcat/tailcat           package/tailcat
ln -s /tmp/openwrt-tailcat/luci-app-tailcat  package/luci-app-tailcat

make menuconfig
#   Network -> VPN -> tailcat           (select)
#   LuCI    -> Applications -> luci-app-tailcat (select)

make package/tailcat/compile V=s
make package/luci-app-tailcat/compile V=s
```

> The `tailcat` package depends on the Go toolchain to compile `github.com/tailscale/tailcat/cmd/tailcat` from source.
> If your build environment is constrained, prefer Option 1's prebuilt ipks.

## Usage

After installation, navigate to **Services → Tailcat** in LuCI.

### 1. Enable the service

On the **Overview** page, turn on **Enable tailcat service** and save.

### 2. Create a local service (serve)

On the **Local Services** page click **Add serve instance**:

| Field | Description |
|-------|-------------|
| Name | Instance name, e.g. `my_web` |
| Kind | `Expose local ports` / `Auth-free SSH server` / `File drop box (recv)` |
| Ports | Required when Kind is port-expose, e.g. `8080,8443` or `all` |
| Receive directory | Required when Kind is recv, e.g. `/root/tailcat-inbox` |
| Log file | Log output path; tailcat prints the short address here on startup |

After save & apply, find the address (e.g. `tcXXXXXXXXXXXXXXXXXX`) on the **Status** page or in the log, then hand it to the remote client.

### 3. Connect to a remote service (forward)

On the **Remote Forwards** page click **Add forward instance**:

| Field | Description |
|-------|-------------|
| Name | Instance name, e.g. `remote_web` |
| Remote tailcat address | Address generated by the remote serve instance, e.g. `tcXXXXX` |
| Local bind address | Local listen address, defaults to `0.0.0.0` (LAN reachable) |
| Port forwards | Space-separated `local:remote` pairs, e.g. `18080:8080 13306:3306`; a bare port equals `port:port` |
| Open WAN firewall ports | When enabled, open the WAN-side firewall for the local forward ports so external (Internet) hosts can reach them. LAN access is always available. Default is off to avoid exposing ports to the Internet. |

After save & apply, the corresponding local port acts as if it were the remote service.

### 4. View status & logs

- **Status** page shows each instance's running state and the serve instance's current tailcat address.
- **Log** page lets you pick an instance's log file with auto-refresh (3s).

## UCI config example

`/etc/config/tailcat`:

```sh
config general 'general'
    option enabled 1
    # option derp_map 'https://example.com/derpmap.json'

# Local service: expose 8080 and 8443
config instance 'my_web'
    option enabled 1
    option role 'serve'
    option serve_kind 'ports'
    option serve_ports '8080,8443'
    option log_file '/var/log/tailcat/my_web.log'

# Remote forward: forward remote 8080/3306 to local 18080/13306
config instance 'remote_web'
    option enabled 1
    option role 'forward'
    option remote_addr 'tcXXXXXXXXXXXXXXXXXX'
    option bind_addr '0.0.0.0'
    option forwards '18080:8080 13306:3306'
    option open_firewall 0
    option log_file '/var/log/tailcat/remote_web.log'
```

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

## License

MIT, see [LICENSE](LICENSE).
