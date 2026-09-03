#
# Copyright (C) 2026 OpenWrt-Tailcat Contributors
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=tailcat
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/tailscale/tailcat.git
PKG_SOURCE_VERSION:=main
PKG_MIRROR_HASH:=skip

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=OpenWrt-Tailcat Contributors

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

GO_PKG:=github.com/tailscale/tailcat
GO_PKG_BUILD_PKG:=github.com/tailscale/tailcat/cmd/tailcat

include $(INCLUDE_DIR)/package.mk
include ../../lang/golang/golang-package.mk

define Package/tailcat
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  TITLE:=Tailcat - netcat over Tailscale's data plane
  URL:=https://github.com/tailscale/tailcat
  DEPENDS:=+ca-bundle
endef

define Package/tailcat/description
  Tailcat is a remix of Tailscale open source pieces to act like
  netcat, but over Tailscale's data plane, without Tailscale's
  control plane. Point-to-point WireGuard-encrypted tunnels between
  two machines with DERP as the NAT-hole-punching side channel.
  No account, no root, userspace only.
endef

define Package/tailcat/conffiles
/etc/config/tailcat
endef

define Package/tailcat/install
	$(call GoPackage/Package/Install,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/tailcat $(1)/etc/init.d/tailcat
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/etc/config/tailcat $(1)/etc/config/tailcat
	$(INSTALL_DIR) $(1)/usr/lib/tailcat
	$(INSTALL_BIN) ./files/usr/lib/tailcat/tailcat-instance.sh \
		$(1)/usr/lib/tailcat/tailcat-instance.sh
endef

$(eval $(call BuildPackage,tailcat))
