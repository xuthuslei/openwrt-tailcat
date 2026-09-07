#
# Copyright (C) 2026 OpenWrt-Tailcat Contributors
#
# This is free software, licensed under the MIT License.
#
# tailcat-core — the LuCI interface and UCI config layer for tailcat,
# WITHOUT the tailcat binary itself. Install this when you already have
# a tailcat binary on the router (e.g. downloaded via the LuCI "update
# kernel" button) and only need the management UI and init scripts.
#
# The companion `tailcat` package builds the Go binary from source and
# depends on this core package for the config/init layout.

include $(TOPDIR)/rules.mk

PKG_NAME:=tailcat-core
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWrt-Tailcat Contributors
PKG_ARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/tailcat-core
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  TITLE:=Tailcat core (config + init + LuCI hooks, no binary)
  URL:=https://github.com/xuthuslei/openwrt-tailcat
  DEPENDS:=+ca-bundle +coreutils +wget-ssl
  PKGARCH:=all
endef

define Package/tailcat-core/description
  The "system kernel" layer of openwrt-tailcat: UCI config, procd init
  script, per-instance helper, DNS publish/resolve helpers, DERP info
  helper, key management defaults, and the LuCI menu/ACL scaffolding.

  This package deliberately ships NO tailcat binary. The binary is
  either:
    (a) compiled in-tree by the companion `tailcat` package, or
    (b) fetched at runtime by the LuCI "Download latest kernel" button
        into /usr/bin/tailcat.

  Install tailcat-core on minimal routers where you want the management
  UI but will provide the binary out-of-band.
endef

define Package/tailcat-core/conffiles
/etc/config/tailcat
endef

# Files live under tailcat/files/ so both the `tailcat` source-build
# package and this `tailcat-core` runtime-only package share the exact
# same config/init/helper tree.
define Package/tailcat-core/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/tailcat $(1)/etc/init.d/tailcat

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/etc/config/tailcat $(1)/etc/config/tailcat

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/tailcat-keys $(1)/etc/uci-defaults/tailcat-keys

	$(INSTALL_DIR) $(1)/usr/lib/tailcat
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-instance.sh \
		$(1)/usr/lib/tailcat/tailcat-instance.sh
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-derp-info.sh \
		$(1)/usr/lib/tailcat/tailcat-derp-info.sh
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-dns-publish.sh \
		$(1)/usr/lib/tailcat/tailcat-dns-publish.sh
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-dns-resolve.sh \
		$(1)/usr/lib/tailcat/tailcat-dns-resolve.sh
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-keys.sh \
		$(1)/usr/lib/tailcat/tailcat-keys.sh

	# Kernel-fetch helper used by LuCI's "Download latest kernel" button.
	# Downloads a release tarball from GitHub, extracts the matching
	# arch binary into /usr/bin/tailcat, and restarts the service.
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-fetch-kernel.sh \
		$(1)/usr/lib/tailcat/tailcat-fetch-kernel.sh

	# Symlink /usr/bin/tailcat -> /usr/lib/tailcat/tailcat.bin so the
	# fetch helper can atomically replace the binary without the init
	# script ever seeing a missing /usr/bin/tailcat. (Created in postinst
	# so the symlink only exists on the target, not in the ipk tree.)
endef

define Package/tailcat-core/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
# If no real binary yet, point /usr/bin/tailcat at the fetch slot so
# the LuCI "download kernel" button can populate it later.
if [ ! -e /usr/bin/tailcat ]; then
	ln -sf /usr/lib/tailcat/tailcat.bin /usr/bin/tailcat 2>/dev/null || true
fi
# Enable+start the service so a freshly flashed router comes up.
/etc/init.d/tailcat enable 2>/dev/null || true
exit 0
endef

define Package/tailcat-core/postrm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
# Remove the fetch-slot symlink if it's still pointing at our slot.
if [ -L /usr/bin/tailcat ]; then
	target=$$(readlink /usr/bin/tailcat)
	[ "$$target" = "/usr/lib/tailcat/tailcat.bin" ] && rm -f /usr/bin/tailcat
fi
exit 0
endef

$(eval $(call BuildPackage,tailcat-core))
