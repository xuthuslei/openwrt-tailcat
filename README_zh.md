# openwrt-tailcat

> [English](README.md) | [中文](readme_zh.md)

> 主仓库（GitHub，Actions 产物以此为准）：https://github.com/xuthuslei/openwrt-tailcat
> 镜像仓库（AtomGit）：https://atomgit.com/lkjx/openwrt-tailcat

OpenWrt 下的 tailcat 服务插件，提供 LuCI Web 界面来管理基于 [tailscale/tailcat](https://github.com/tailscale/tailcat) 的点对点加密隧道服务。

Tailcat 是 Tailscale 数据平面的再混音：像 `netcat` 一样工作，但流量通过 WireGuard® 加密的点对点隧道传输，使用 DERP 作为 NAT 穿透的辅助通道和最终的中继后备。**无需 Tailscale 账号、无需 root、纯用户态。**

## 功能

本插件在 OpenWrt 路由器上管理两种 tailcat 实例，均可通过 LuCI 界面增删改查：

| 角色 | 说明 | 典型用途 |
|------|------|----------|
| **serve**（本机服务） | 在本机暴露端口 / 无认证 SSH / 文件接收箱，生成一个 tailcat 短地址供远端连接 | 把路由器上的 Web 服务、SSH 或接收目录暴露给远端 |
| **forward**（远程转发） | 拨号一个*命名远程服务器*，在本机绑定一个本地端口转发到远端服务端口 | 让路由器把远端 tailcat 服务器的端口以本地端口形式提供给 LAN 客户端 |

forward 实例本身不携带远端 tailcat 地址。你先定义每个远端对端为一个**远程服务器**（名称 + tailcat 地址），再用任意数量的 forward 实例按名称引用它。

界面参考 OpenWrt 已有的 VPN 服务（`luci-app-openvpn`、`luci-app-wireguard`）。**服务 → Tailcat** 下注册了四个页面：

- **概览（Overview）**：全局开关、tailcat 二进制版本，以及一个包含所有实例的网格，每行带启用复选框与运行状态。
- **本机服务（Local Services，`serve` 实例）**：serve 实例网格，显示类型、端口/接收目录、当前 tailcat 地址与启用复选框；新增/编辑弹窗暴露名称、类型、端口、接收目录、verbose、日志文件。
- **远程转发（Remote Forwards，`forward` 实例）**：一个页面两个网格 —— **远程服务器**（名称 + tailcat 地址 + 启用）与**端口转发**（每行一个 forward 实例，按名称引用服务器）。新增/编辑弹窗暴露名称、服务器、本地端口、远端端口、绑定地址、open-WAN-firewall、verbose、日志文件。
- **日志（Log）**：按实例选择 `log_file` 并流式查看，自动刷新（3 秒）。

> 源码树中还存在一个 `status.js` 视图，但它**没有**在 LuCI 菜单中注册；每实例状态改为在概览页网格中以列形式呈现。

## 目录结构

```
openwrt-tailcat/
├── .github/workflows/build.yml      # GitHub Actions：下载预编译二进制，手工拼装 ipk
│
├── tailcat/                         # 主程序包
│   ├── Makefile                     # OpenWrt package Makefile（Go 源码编译路径）
│   └── files/
│       ├── etc/config/tailcat       # UCI 配置模板（general + server + instance）
│       ├── etc/init.d/tailcat       # procd init 脚本，按已启用实例逐个启动进程
│       └── usr/lib/tailcat/
│           └── tailcat-instance.sh  # 实例命令行构造脚本（被 init 调用）
│
└── luci-app-tailcat/                # LuCI 界面包（Architecture: all）
    ├── Makefile
    ├── po/
    │   ├── en/tailcat.po            # 英文翻译
    │   └── zh-cn/tailcat.po         # 简体中文翻译
    └── src/
        ├── root/usr/share/luci/view/tailcat/
        │   ├── overview.js          # 概览（全局开关 + 实例网格）
        │   ├── services.js          # 本机服务（serve 实例）
        │   ├── forwards.js          # 远程转发（服务器网格 + 转发网格）
        │   ├── status.js            # 状态视图（存在，但未注册到菜单）
        │   └── log.js               # 日志查看（按实例，3 秒自动刷新）
        └── usr/share/
            ├── luci/menu.d/luci-app-tailcat.json   # 菜单注册
            └── rpcd/acl.d/luci-app-tailcat.json    # rpcd ACL
```

> `build.yml` 中的构建任务会把 `src/root/usr/share/luci/view/tailcat/` 下的视图打包进 ipk 的 `www/luci-static/resources/view/tailcat/`，并通过 `scripts/po2lmo.py` 把 `.po` 编译成 `.lmo`。

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

在 **概览** 页，将 **Enable tailcat service** 打开并保存应用。该页还显示 tailcat 二进制版本，以及一个包含所有实例的网格，每行带运行状态。

### 2. 定义远程服务器（可选，仅当你要使用 forward 时）

在 **远程转发** 页的 **远程服务器** 网格中点击 **Add remote server**：

| 字段 | 说明 |
|------|------|
| Name | 用于在 forward 实例中引用此对端的短名称，如 `vps` |
| Tailcat address | 远端 serve 实例生成的地址，如 `tcXXXXXXXXXXXXXXXXXX` |
| Enabled | 该服务器定义的开关 |

服务器条目只保存对端地址，本身不启动任何进程。

### 3. 创建本机服务（serve）

在 **本机服务** 页点击 **Add serve instance**：

| 字段 | 说明 |
|------|------|
| Name | 实例名，如 `my_web` |
| Kind | `Expose local ports` / `Auth-free SSH server` / `File drop box (recv)` |
| Ports | 当 Kind 为端口暴露时填，如 `8080,8443` 或 `all` |
| Receive directory | 当 Kind 为 recv 时填，如 `/root/tailcat-inbox` |
| Verbose logs | 开启 tailcat 诊断日志 |
| Log file | 日志输出路径，tailcat 启动后会在此打印短地址 |

保存应用后，同页的 **Tailcat address** 列会显示地址（如 `tcXXXXXXXXXXXXXXXXXX`），把它交给远端客户端。地址同时写入 `/var/run/tailcat/<section>.addr`。

### 4. 接入远程服务（forward）

在 **远程转发** 页的 **端口转发** 网格中点击 **Add port forward**：

| 字段 | 说明 |
|------|------|
| Name | 实例名，如 `remote_web` |
| Remote server | 在上方远程服务器网格中选择一个命名服务器 |
| Local port | 本地监听 TCP 端口，如 `18080` |
| Remote port | 要转发到的远端服务器端口，如 `8080` |
| Local bind address | 本地监听地址，默认 `0.0.0.0`（LAN 可访问） |
| Open WAN firewall ports | 开启后在 WAN 侧防火墙放行本地端口，让外网（互联网）主机可访问。LAN 始终可访问。默认关闭 |
| Verbose logs | 开启 tailcat 诊断日志 |
| Log file | 日志输出路径 |

保存应用后，本地端口的行为等同于远端服务。每个 forward 实例映射**一个**本地端口到**一个**远端端口；如需多个端口，创建多个引用同一服务器的 forward 实例。

### 5. 查看状态与日志

- 概览页网格显示每个实例的运行状态（运行中 / 已停止 / 已禁用）。
- **日志** 页可按实例选择日志文件，支持自动刷新（3 秒）。

## UCI 配置示例

`/etc/config/tailcat`：

```sh
config general 'general'
    option enabled 1
    # option derp_map 'https://example.com/derpmap.json'

# 一个远端对端，被 forward 实例按名称引用。
config server 'vps'
    option enabled 1
    option name 'vps'
    option remote_addr 'tcXXXXXXXXXXXXXXXXXX'

# 本机服务：暴露 8080 和 8443。
config instance 'my_web'
    option enabled 1
    option role 'serve'
    option serve_kind 'ports'
    option serve_ports '8080,8443'
    option verbose 0
    option log_file '/var/log/tailcat/my_web.log'

# 远程转发：把命名 'vps' 服务器的 8080 端口转发到本地 18080。
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

段类型说明：

- `general` —— 全局开关（`enabled`）与可选的自定义 DERP map（`derp_map`）。
- `server` —— 一个远端对端：`name`、对端的 `remote_addr`、`enabled` 标志。forward 实例按名称引用这些段。
- `instance` —— 一个 tailcat 进程。`role=serve` 暴露本机服务；`role=forward` 拨号一个命名 `server` 并绑定本地端口。

转发端口映射：推荐做法是每个实例配一个 `local_port` + 一个 `remote_port`。当未设置 `local_port`/`remote_port` 时，旧的 `forwards` 选项（空格分隔的 `本地:远端` 对，单独一个端口等价于 `端口:端口`）仍然有效。

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
