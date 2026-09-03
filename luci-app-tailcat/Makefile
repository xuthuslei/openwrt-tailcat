#
# Copyright (C) 2026 OpenWrt-Tailcat Contributors
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-tailcat
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWrt-Tailcat Contributors

LUCI_TITLE:=Tailcat - netcat over Tailscale's data plane (LuCI)
LUCI_DESCRIPTION:=LuCI interface for the tailcat service. Lets you create local tailcat services (serve local ports, SSH, file drop box) and forward remote tailcat services to local ports, all through the web UI.
LUCI_DEPENDS:=+tailcat
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)
  $(call Package/luci-app-tailcat/Default)
endef

include ../../luci.mk

# Build the zh-cn translation by default alongside en.
LUCI_LANGUAGES:=en zh-cn

# src directory layout mirrors the installed tree:
#   src/htdocs/luci-static/resources/view/tailcat/*.js
#   src/root/etc/uci-defaults/*
# The luci.mk build infra copies these into the right places.

build: compile

compile:
	$(call Build/Compile/Default)

# Install the LuCI pieces: controller, views, i18n, and a uci-defaults
# script that grants the luci-app-tailcat ACL to the admin group.

define Package/$(PKG_NAME)/install
	# Views (JavaScript modules)
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/tailcat
	$(INSTALL_DATA) ./src/htdocs/luci-static/resources/view/tailcat/*.js \
		$(1)/www/luci-static/resources/view/tailcat/
	# i18n strings (base + translations)
	$(INSTALL_DIR) $(1)/www/luci-static/resources
	$(INSTALL_DATA) ./src/htdocs/luci-static/resources/*.po \
		$(1)/www/luci-static/resources/ 2>/dev/null || true
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./src/usr/share/luci/menu.d/*.json \
		$(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./src/usr/share/rpcd/acl.d/*.json \
		$(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	$(INSTALL_DATA) ./po/en/*.po $(1)/usr/share/luci/i18n/ 2>/dev/null || true
	$(INSTALL_DATA) ./po/zh-cn/*.po $(1)/usr/share/luci/i18n/ 2>/dev/null || true
	# uci-defaults: enable service menu + default ACL
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./src/root/etc/uci-defaults/* \
		$(1)/etc/uci-defaults/
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
# Refresh rpcd ACLs and the luci menu cache so the new pages appear.
killall -HUP rpcd 2>/dev/null || true
rm -f /var/luci-indexcache 2>/dev/null || true
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
