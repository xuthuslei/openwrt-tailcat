#
# Copyright (C) 2026 OpenWrt-Tailcat Contributors
#
# This is free software, licensed under the MIT License.
#
# tailcat — the tailcat binary packaged for OpenWrt.
#
# We do NOT compile tailcat from source here. Instead, at build time we
# fetch the matching prebuilt binary from the upstream GitHub Releases
# (https://github.com/tailscale/tailcat) and install it into the ipk.
#
# The companion `tailcat-core` package ships the LuCI interface, UCI
# config, init script and helpers. `tailcat` only provides the binary
# and depends on `tailcat-core` for the management layer.
#
# Feed integration (nikki-style):
#
#   echo "src-git tailcat https://github.com/xuthuslei/openwrt-tailcat.git;main" \
#       >> feeds.conf.default
#   ./scripts/feeds update -a
#   ./scripts/feeds install -a
#   make package/tailcat/compile V=s
#
# The resulting ipk lands under bin/packages/<arch>/tailcat/.

include $(TOPDIR)/rules.mk

PKG_NAME:=tailcat
PKG_VERSION:=0.6.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=OpenWrt-Tailcat Contributors

# Upstream prebuilt binary source.
#   TAILCAT_UPSTREAM  — GitHub release base URL (override to mirror).
#   TAILCAT_VERSION   — release tag without the leading "v".
#   TAILCAT_GOARCH    — Go GOARCH for the arch we are building for,
#                       mapped from ARCH in Build/Prepare.
TAILCAT_UPSTREAM?=https://github.com/tailscale/tailcat/releases/download
TAILCAT_GOARCH?=

PKG_ARCH:=all

include $(INCLUDE_DIR)/package.mk

# Map OpenWrt ARCH → Go GOARCH. Extend this table as new targets are
# added. Unknown arches fall through to amd64 so the build never hard-
# fails on an unmapped arch (the resulting binary just won't run).
define Package/tailcat
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  TITLE:=Tailcat - netcat over Tailscale's data plane
  URL:=https://github.com/tailscale/tailcat
  DEPENDS:=+ca-bundle +tailcat-core
endef

define Package/tailcat/description
  Tailcat is a remix of Tailscale open source pieces to act like
  netcat, but over Tailscale's data plane, without Tailscale's
  control plane. Point-to-point WireGuard-encrypted tunnels between
  two machines with DERP as the NAT-hole-punching side channel.
  No account, no root, userspace only.

  This package installs the prebuilt tailcat binary fetched from
  upstream GitHub Releases at build time. The LuCI management UI
  lives in the separate `tailcat-core` package.
endef

# Map ARCH → GOARCH. Called from Build/Prepare.
#   arm_cortex-a*  → arm
#   aarch64_*      → arm64
#   mipsel_*       → mipsle
#   mips_*         → mips
#   x86_64         → amd64
#   i386 / i686    → 386
define goarch_for_arch
$(strip \
  $(if $(filter aarch64%,$(ARCH)),arm64, \
  $(if $(filter arm%,$(ARCH)),arm, \
  $(if $(filter mipsel%,$(ARCH)),mipsle, \
  $(if $(filter mips%,$(ARCH)),mips, \
  $(if $(filter x86_64,$(ARCH)),amd64, \
  $(if $(filter i386 i686,$(ARCH)),386, \
  amd64)))))))
endef

# Build/Prepare is the right hook to fetch the binary: it runs before
# Build/Compile (which we leave empty) and before the install step.
define Build/Prepare
	$(eval GOARCH:=$(call goarch_for_arch))
	@echo ">>> tailcat: fetching prebuilt binary for GOARCH=$(GOARCH) (ARCH=$(ARCH))"
	mkdir -p $(PKG_BUILD_DIR)/dl
	# Download the release tarball.
	curl -fsSL \
		"$(TAILCAT_UPSTREAM)/v$(PKG_VERSION)/tailcat_$(PKG_VERSION)_linux_$(GOARCH).tar.gz" \
		-o "$(PKG_BUILD_DIR)/dl/tailcat.tar.gz"
	# Extract.
	tar -xzf "$(PKG_BUILD_DIR)/dl/tailcat.tar.gz" -C "$(PKG_BUILD_DIR)/dl"
	# Locate the tailcat binary (inside a dir or at root).
	BIN=$$$$(find "$(PKG_BUILD_DIR)/dl" -type f -name 'tailcat' | head -1); \
	[ -n "$$$BIN" ] || BIN=$$$$(find "$(PKG_BUILD_DIR)/dl" -type f -name 'tailcat_*' | head -1); \
	[ -n "$$$BIN" ] || { echo "tailcat binary not found in tarball"; exit 1; }; \
	chmod 0755 "$$$BIN"; \
	cp "$$$BIN" "$(PKG_BUILD_DIR)/tailcat"; \
	chmod 0755 "$(PKG_BUILD_DIR)/tailcat"
	@echo ">>> tailcat: binary ready at $(PKG_BUILD_DIR)/tailcat"
endef

define Build/Compile
	# Nothing to compile — we ship a prebuilt binary.
endef

define Package/tailcat/install
	# Install the prebuilt binary to /usr/bin/tailcat.
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/tailcat $(1)/usr/bin/tailcat
endef

define Package/tailcat/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
# tailcat-core created a symlink /usr/bin/tailcat -> /usr/lib/tailcat/tailcat.bin
# if no binary was present. Now that we have installed a real binary,
# remove that symlink so /usr/bin/tailcat points at our file.
if [ -L /usr/bin/tailcat ]; then
	rm -f /usr/bin/tailcat
fi
# Restart the service if it was running, so it picks up the new binary.
/etc/init.d/tailcat reload 2>/dev/null || true
exit 0
endef

$(eval $(call BuildPackage,tailcat))
