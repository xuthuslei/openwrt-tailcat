# openwrt-tailcat

> [English](README.md) | [中文](readme_zh.md)

> 主仓库（GitHub，Actions 产物以此为准）：https://github.com/xuthuslei/openwrt-tailcat
> 镜像仓库（AtomGit）：https://atomgit.com/lkjx/openwrt-tailcat

OpenWrt 下的 tailcat 服务插件，提供 LuCI Web 界面来管理基于 [tailscale/tailcat](https://github.com/tailscale/tailcat) 的点对点加密隧道服务。

Tailcat 是 Tailscale 数据平面的再混音：像 `netcat` 一样工作，但流量通过 WireGuard® 加密的点对点隧道传输，使用 DERP 作为 NAT 穿透的辅助通道和最终的中继后备。**无需 Tailscale 账号、无需 root、纯用户态。**

## 功能

本插件在 OpenWrt 路由器上提供两种 tailcat 实例类型，均可通过 LuCI 界面增删改查：

| 角色 | 说明 | 典型用途 |
|------|------|----------|
| **serve**（本机服务） | 在本机暴露端口 / SSH / 文件接收箱，生成一个 tailcat 短地址供远端连接 | 把路由器上的 Web 服务、SSH、配置备份目录暴露给远端 |
| **forward**（远程转发） | 连接到远端 tailcat 地址，在本机绑定一个或多个本地端口转发到远端服务 | 让路由器把远端 tailcat 服务器的端口以本地端口形式提供给 LAN 客户端 |

界面参考 OpenWrt 已有的 VPN 服务（`luci-app-openvpn`、`luci-app-wireguard`）的模式：
- **概览页**：全局开关、tailcat 版本、所有实例状态汇总
- **本机服务页**：管理 `serve` 实例（端口暴露 / 无认证 SSH / 文件接收箱）
- **远程转发页**：管理 `forward` 实例（远端地址 + 本地端口转发）
- **状态页**：显示每个实例的运行状态与 serve 实例当前的 tailcat 地址（从日志解析）
- **日志页**：按实例选择日志文件并实时刷新（3 秒）

## 目录结构

```
openwrt-tailcat/
├── .github/workflows/build.yml      # GitHub Actions：下载预编译二进制 + opkg-build 打包
│
├── tailcat/                         # 主程序包
│   ├── Makefile                     # OpenWrt package Makefile
│   └── files/
│       ├── etc/config/tailcat       # UCI 配置模板
│       ├── etc/init.d/tailcat       # procd init 脚本，按 UCI 实例启动进程
│       └── usr/lib/tailcat/
│           └── tailcat-instance.sh  # 实例命令行构造脚本（被 init 调用）
│
└── luci-app-tailcat/                # LuCI 界面包
    ├── Makefile
    ├── po/
    │   ├── en/tailcat.po            # 英文翻译
    │   └── zh-cn/tailcat.po         # 简体中文翻译
    └── src/
        ├── root/usr/share/luci/
        │   └── view/tailcat/
        │       ├── overview.js      # 概览页
        │       ├── services.js      # 本机服务（serve）配置
        │       ├── forwards.js      # 远程转发（forward）配置
        │       ├── status.js        # 运行状态页
        │       └── log.js           # 日志查看页
        ├── usr/share/luci/menu.d/luci-app-tailcat.json   # 菜单注册
        └── usr/share/rpcd/acl.d/luci-app-tailcat.json    # rpcd ACL
```

## 安装

### 方式一：直接下载预编译 ipk（推荐）

每次推送到 `main` 分支，GitHub Actions 会自动构建多架构 ipk 并附到
[Snapshot Release](https://github.com/xuthuslei/openwrt-tailcat/releases/latest)
上。根据你的路由器架构下载对应文件：

| 架构（opkg arch） | ipk 文件 | 典型设备 |
|-------------------|----------|----------|
| `x86_64` | `tailcat_0.5.0-1_x86_64.ipk` | x86 软路由 |
| `aarch64_cortexa53` | `tailcat_0.5.0-1_aarch64_cortexa53.ipk` | 树莓派 3、部分 ARM 路由 |
| `arm_cortex-a7_neon-vfpv4` | `tailcat_0.5.0-1_arm_cortex-a7_neon-vfpv4.ipk` | MT76xx、IPQ40xx 等 |
| `all` | `luci-app-tailcat_0.1.0-1_all.ipk` | LuCI 界面，所有架构通用 |

安装：

```sh
# 把对应架构的 tailcat 和 luci-app-tailcat 上传到路由器
opkg install tailcat_*.ipk luci-app-tailcat_*.ipk
/etc/init.d/rpcd restart
# 路由器后台 LuCI 中即可看到 服务 → Tailcat
```

> 架构名查询：在路由器上执行 `opkg print-architecture`，或在
> [OpenWrt Table of Hardware](https://openwrt.org/toh/start) 查对应 `Target`/`Subtarget`。

### 方式二：从源码自行编译

需要完整 OpenWrt 源码树 + Go 工具链：

```sh
cd <openwrt-source>
git clone https://github.com/xuthuslei/openwrt-tailcat.git /tmp/openwrt-tailcat
ln -s /tmp/openwrt-tailcat/tailcat           package/tailcat
ln -s /tmp/openwrt-tailcat/luci-app-tailcat  package/luci-app-tailcat

make menuconfig
#   Network -> VPN -> tailcat           (选中)
#   LuCI    -> Applications -> luci-app-tailcat (选中)

make package/tailcat/compile V=s
make package/luci-app-tailcat/compile V=s
```

> `tailcat` 包依赖 Go 工具链从源码编译 `github.com/tailscale/tailcat/cmd/tailcat`。
> 若编译环境受限，建议直接用方式一的预编译 ipk。

## 使用

安装完成后，在 LuCI 中进入 **服务（Services）→ Tailcat**。

### 1. 启用服务

在 **概览** 页，将 **Enable tailcat service** 打开并保存。

### 2. 创建本机服务（serve）

在 **本机服务** 页点击 **Add serve instance**：

| 字段 | 说明 |
|------|------|
| Name | 实例名，如 `my_web` |
| Kind | `Expose local ports` / `Auth-free SSH server` / `File drop box (recv)` |
| Ports | 当 Kind 为端口暴露时填，如 `8080,8443` 或 `all` |
| Receive directory | 当 Kind 为 recv 时填，如 `/root/tailcat-inbox` |
| Log file | 日志输出路径，tailcat 启动后会在此打印短地址 |

保存应用后，在 **状态** 页或日志中找到形如 `tcXXXXXXXXXXXXXXXXXX` 的地址，把它交给远端客户端。

### 3. 接入远程服务（forward）

在 **远程转发** 页点击 **Add forward instance**：

| 字段 | 说明 |
|------|------|
| Name | 实例名，如 `remote_web` |
| Remote tailcat address | 远端 serve 实例生成的地址，如 `tcXXXXX` |
| Local bind address | 本地监听地址，默认 `0.0.0.0`（LAN 可访问） |
| Port forwards | 空格分隔的 `本地端口:远端端口` 对，如 `18080:8080 13306:3306`；只写一个端口等价于 `端口:端口` |
| Open WAN firewall ports | 开启后在 WAN 侧防火墙放行本地转发端口，让外网（互联网）主机可访问。LAN 始终可访问。默认关闭，避免端口暴露到互联网 |

保存应用后，本机对应端口即可当作远端服务的本地端口使用。

### 4. 查看状态与日志

- **状态** 页显示每个实例的运行状态与 serve 实例当前的 tailcat 地址。
- **日志** 页可按实例选择日志文件，支持自动刷新（3 秒）。

## UCI 配置示例

`/etc/config/tailcat`：

```sh
config general 'general'
    option enabled 1
    # option derp_map 'https://example.com/derpmap.json'

# 本机服务：暴露 8080 和 8443
config instance 'my_web'
    option enabled 1
    option role 'serve'
    option serve_kind 'ports'
    option serve_ports '8080,8443'
    option log_file '/var/log/tailcat/my_web.log'

# 远程转发：把远端 8080/3306 转发到本机 18080/13306
config instance 'remote_web'
    option enabled 1
    option role 'forward'
    option remote_addr 'tcXXXXXXXXXXXXXXXXXX'
    option bind_addr '0.0.0.0'
    option forwards '18080:8080 13306:3306'
    option open_firewall 0
    option log_file '/var/log/tailcat/remote_web.log'
```

常用命令：

```sh
/etc/init.d/tailcat enable      # 开机自启
/etc/init.d/tailcat start       # 启动所有已启用实例
/etc/init.d/tailcat restart     # 重启
/etc/init.d/tailcat status      # 查看状态
```

## 持续集成

[`.github/workflows/build.yml`](.github/workflows/build.yml) 在每次 push 到 `main` 时触发：

1. 从 [tailscale/tailcat Releases](https://github.com/tailscale/tailcat/releases) 下载预编译二进制
   （linux amd64 / arm64 / armv7）
2. 用 [`opkg-utils`](https://git.yoctoproject.org/opkg-utils) 的 `opkg-build`
   把二进制 + init 脚本 + UCI 配置打包成 OpenWrt ipk
3. `luci-app-tailcat` 是纯 JS + 配置，同样用 `opkg-build` 打包（`Architecture: all`）
4. 所有 ipk 上传为 workflow artifact，并附到一个 snapshot release

架构映射：

| Go arch | opkg arch |
|---------|-----------|
| `amd64` | `x86_64` |
| `arm64` | `aarch64_cortexa53` |
| `armv7` | `arm_cortex-a7_neon-vfpv4` |

构建状态与产物：
- Actions 运行记录：https://github.com/xuthuslei/openwrt-tailcat/actions
- 最新 snapshot release：https://github.com/xuthuslei/openwrt-tailcat/releases/latest

## 与已有 VPN 服务的对比

| 特性 | tailcat（本插件） | wireguard / openvpn |
|------|-------------------|---------------------|
| 控制平面 | 无，地址带外交换 | 需手动配置或使用协调服务器 |
| 加密 | WireGuard 点对点 | WireGuard / OpenSSL |
| NAT 穿透 | DERP 辅助 + magicsock | 有限 / 依赖配置 |
| 账号 | 不需要 | 不需要 |
| 典型场景 | 临时点对点连接、端口转发、文件传输 | 站点到站点 / 长期 VPN |

本插件刻意复用了 OpenWrt 已有 VPN 服务的 LuCI 布局与 UCI 配置惯例，让熟悉 `luci-app-wireguard` 的用户可以零成本上手。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
