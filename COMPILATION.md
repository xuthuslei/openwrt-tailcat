# Compiling openwrt-tailcat with OpenWrt

This document describes how to integrate `openwrt-tailcat` into an
OpenWrt buildroot so that `tailcat`, `tailcat-core`, and
`luci-app-tailcat` are compiled alongside the firmware and produced as
`.ipk` packages.

The layout mirrors [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki):
each subdirectory (`tailcat/`, `tailcat-core/`, `luci-app-tailcat/`) is
a self-contained OpenWrt package with its own `Makefile`.

---

## Package overview

| Package | Arch | Contents | Depends on |
|---------|------|----------|------------|
| `tailcat-core` | all | UCI config, procd init script, per-instance helper, DNS publish/resolve helpers, DERP info helper, key management defaults, LuCI menu/ACL scaffolding, **fetch-kernel helper** | `ca-bundle`, `coreutils`, `wget-ssl` |
| `tailcat` | all (binary is arch-specific, fetched per target) | Prebuilt `tailcat` binary fetched at build time from upstream GitHub Releases | `tailcat-core`, `ca-bundle` |
| `luci-app-tailcat` | all | LuCI JS views (overview, services, forwards, log), i18n `.po` files | `tailcat-core` |

### Why split `tailcat` and `tailcat-core`?

`tailcat-core` is the **system kernel** layer: the management UI, the
init script, and the helpers. It is useful on its own — for example, on
a router where you want to fetch the binary via the LuCI "Download
latest kernel" button rather than baking it into the firmware.

`tailcat` is the binary layer: at build time it downloads the matching
prebuilt `tailcat` binary from
`https://github.com/tailscale/tailcat/releases` and installs it to
`/usr/bin/tailcat`. We do **not** compile tailcat from source in the
OpenWrt buildroot.

---

## Quick start (feed integration)

### 1. Add the feed

In the root of your OpenWrt source tree, append this line to
`feeds.conf.default` (create the file if it does not exist):

```
src-git tailcat https://github.com/xuthuslei/openwrt-tailcat.git;main
```

> The `feeds.conf.default` file in this repository is a ready-to-use
> example — copy it over or merge its contents.

### 2. Update and install feeds

```sh
./scripts/feeds update -a
./scripts/feeds install -a
```

### 3. Build the packages

```sh
# Build all three packages
make package/tailcat-core/compile V=s
make package/tailcat/compile V=s
make package/luci-app-tailcat/compile V=s
```

The resulting `.ipk` files are placed under:

```
bin/packages/<arch>/tailcat/
├── tailcat-core_0.1.0-1_all.ipk
├── tailcat_0.6.0-1_<arch>.ipk
└── luci-app-tailcat_0.1.0-1_all.ipk
```

### 4. (Optional) Include in the firmware image

In `make menuconfig`, navigate to **Network → VPN** and select the
packages you want baked into the image:

- `tailcat-core` — the management layer (recommended)
- `tailcat` — the prebuilt binary (optional; can be fetched later via LuCI)
- `luci-app-tailcat` — the LuCI web interface (recommended)

Then build the firmware as usual:

```sh
make -j$(nproc)
```

---

## Building without a feed (standalone)

If you prefer not to use the feed mechanism, you can symlink the
package directories directly into your OpenWrt source tree:

```sh
# From your OpenWrt source root
ln -s /path/to/openwrt-tailcat/tailcat      package/tailcat
ln -s /path/to/openwrt-tailcat/tailcat-core package/tailcat-core
ln -s /path/to/openwrt-tailcat/luci-app-tailcat package/luci-app-tailcat

# Build
make package/tailcat-core/compile V=s
make package/tailcat/compile V=s
make package/luci-app-tailcat/compile V=s
```

---

## How the prebuilt binary is fetched

The `tailcat` package `Makefile` defines a `Build/Prepare` hook that:

1. Maps the current OpenWrt `ARCH` to a Go `GOARCH`
   (`aarch64_*` → `arm64`, `arm_cortex-a*` → `arm`, `x86_64` → `amd64`,
   `mipsel_*` → `mipsle`, `mips_*` → `mips`, `i386/i686` → `386`).
2. Downloads
   `https://github.com/tailscale/tailcat/releases/download/v<VERSION>/tailcat_<VERSION>_linux_<GOARCH>.tar.gz`
   via `curl`.
3. Extracts the tarball and locates the `tailcat` binary inside.
4. Copies it to `$(PKG_BUILD_DIR)/tailcat` for the install step.

The version is controlled by `PKG_VERSION` at the top of
`tailcat/Makefile`. Bump it when a new upstream release is available.

To override the upstream URL (e.g. to use a mirror), set
`TAILCAT_UPSTREAM` in the environment:

```sh
make package/tailcat/compile V=s TAILCAT_UPSTREAM=https://my-mirror.example.com/tailcat/releases/download
```

---

## Runtime: downloading the kernel via LuCI

Even if you do not bake the `tailcat` binary into the firmware, the LuCI
Overview page provides a **"Download latest kernel"** button. Clicking
it invokes `/usr/lib/tailcat/tailcat-fetch-kernel.sh`, which:

1. Auto-detects `GOARCH` from `uname -m`.
2. Downloads the matching tarball from upstream GitHub Releases.
3. Atomically installs the binary to `/usr/bin/tailcat`.
4. Reloads the `tailcat` service.

You can optionally specify a version in the input field next to the
button. Leave it blank to use the version recorded in
`/etc/tailcat-version` (or the default `0.6.0`).

### Manual fetch from the command line

```sh
# Auto-detect arch, use default version
/usr/lib/tailcat/tailcat-fetch-kernel.sh

# Specify version
/usr/lib/tailcat/tailcat-fetch-kernel.sh 0.6.0

# Specify version and GOARCH
/usr/lib/tailcat/tailcat-fetch-kernel.sh 0.6.0 arm64
```

---

## Feed installation on a running router

For routers already running OpenWrt, you can add the feed and install
the packages with `opkg`:

```sh
# Add the feed (idempotent)
wget -O - https://raw.githubusercontent.com/xuthuslei/openwrt-tailcat/main/feed.sh | ash

# Install
opkg update
opkg install tailcat-core
opkg install luci-app-tailcat
# The tailcat binary itself is fetched via the LuCI button after install.
```

---

## Directory structure

```
openwrt-tailcat/
├── feeds.conf.default          # Example feed line for buildroot
├── feed.sh                     # Runtime feed-add script (for running routers)
├── COMPILATION.md              # This document
├── README.md
│
├── tailcat/                    # Binary package (fetches prebuilt at build time)
│   ├── Makefile
│   └── files/
│       ├── etc/
│       │   ├── config/tailcat
│       │   └── init.d/tailcat
│       └── usr/lib/tailcat/
│           ├── tailcat-instance.sh
│           ├── tailcat-derp-info.sh
│           ├── tailcat-dns-publish.sh
│           ├── tailcat-dns-resolve.sh
│           ├── tailcat-keys.sh
│           └── tailcat-fetch-kernel.sh   # Used by LuCI "Download latest kernel"
│
├── tailcat-core/               # Core package (LuCI hooks + config, no binary)
│   └── Makefile
│
└── luci-app-tailcat/           # LuCI interface package
    ├── Makefile
    ├── po/
    │   ├── en/tailcat.po
    │   └── zh-cn/tailcat.po
    └── src/
        └── root/usr/share/luci/view/tailcat/
            ├── overview.js      # Includes "Download latest kernel" button
            ├── services.js
            ├── forwards.js
            └── log.js
```

---

## Troubleshooting

### `curl: command not found` during build

The build-time fetch uses `curl`. Ensure the `curl` host tool is
available on your build machine, or install it:

```sh
sudo apt install curl   # Debian/Ubuntu
```

### Binary downloaded but does not run

This usually means the `GOARCH` mapping produced the wrong architecture
for your target. Check the build log for the `>>> tailcat: fetching
prebuilt binary for GOARCH=…` line. If your target arch is not in the
mapping table in `tailcat/Makefile`, add it.

### LuCI "Download latest kernel" button does nothing

Ensure the ACL file
(`/usr/share/rpcd/acl.d/luci-app-tailcat.json`) grants `exec` on
`/usr/lib/tailcat/tailcat-fetch-kernel.sh`. After installing or
updating the ACL, run:

```sh
rm -f /var/luci-indexcache
killall -HUP rpcd
```

---

## License

MIT, see [LICENSE](LICENSE).
