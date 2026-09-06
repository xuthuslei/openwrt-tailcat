'use strict';'require view';'require form';'require fs';'require uci';'require rpc';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name']
});

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('tailcat'),
			L.resolveDefault(callServiceList('tailcat'), {}),
			fs.exec('/usr/bin/tailcat', ['--version']).then(function (r) {
			 return (r && r.stdout) ? r.stdout.trim() : 'n/a';
			}).catch(function () { return 'n/a'; }),
			// Resolve DERP relay hostname for each forward instance by
			// looking up the referenced server's remote_addr, then running
			// `tailcat parse` on it (literal tc… addrs) or on the TXT-
			// resolved address (domains). Returns a map: section_id → host.
			// uci.sections() is synchronous in this LuCI version.
			(function () {
				var secs = uci.sections('tailcat', 'instance') || [];
				var tasks = [];
				for (var j = 0; j < secs.length; j++) {
					(function (sec) {
						if (uci.get('tailcat', sec['.name'], 'role') !== 'forward') { return; }
						var serverName = uci.get('tailcat', sec['.name'], 'server') || '';
						var remote_addr = '';
						var serverSecs = uci.sections('tailcat', 'server') || [];
						for (var k = 0; k < serverSecs.length; k++) {
							var sname = uci.get('tailcat', serverSecs[k]['.name'], 'name') || serverSecs[k]['.name'];
							if (sname === serverName || serverSecs[k]['.name'] === serverName) {
								remote_addr = uci.get('tailcat', serverSecs[k]['.name'], 'remote_addr') || '';
								break;
							}
						}
						if (!remote_addr) { return; }
						var resolveFirst = !remote_addr.match(/^tc/i) && remote_addr.indexOf('.') >= 0;
						var secId = sec['.name'];
						if (resolveFirst) {
							tasks.push(
								fs.exec('/usr/lib/tailcat/tailcat-derp-info.sh', [remote_addr])
									.then(function (r) { return [secId, (r && r.stdout) ? r.stdout.trim() : 'auto']; })
									.catch(function () { return [secId, 'auto']; })
							);
						} else {
							tasks.push(
								fs.exec('/usr/bin/tailcat', ['parse', remote_addr])
									.then(function (r) {
										if (!r || !r.stdout) { return [secId, 'auto']; }
										var m = r.stdout.match(/"HostName"\s*:\s*"([^"]+)"/);
										return [secId, m ? m[1] : 'auto'];
									})
									.catch(function () { return [secId, 'auto']; })
							);
						}
					})(secs[j]);
				}
				return Promise.all(tasks).then(function (pairs) {
					var derpMap = {};
					for (var p = 0; p < pairs.length; p++) { derpMap[pairs[p][0]] = pairs[p][1]; }
					return derpMap;
				});
			})()
		]);
	},

	render: function (data) {
		var instances = (data[1] && data[1].tailcat && data[1].tailcat.instances) ? data[1].tailcat.instances : {};
		var binaryVersion = data[2];
		var derpMap = data[3] || {};

		var m, s, o;

		m = new form.Map('tailcat',
			_('Tailcat — Overview'),
			'Tailcat 是基于 Tailscale 数据平面的 netcat，无需控制平面。');

		s = m.section(form.NamedSection, 'general', 'general', _('Global Settings'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable tailcat service'));
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'derp_map', _('Custom DERP map (optional)'));
		o.datatype = 'string';
		o.placeholder = 'https://example.com/derpmap.json';
		o.editable = true;

		o = s.option(form.Value, 'cf_api_token', _('Cloudflare API token'));
		o.datatype = 'string';
		o.description = _('Required only when a serve instance opts in to DNS publishing. Token must have Zone:DNS:Edit on the target zone.');
		o.password = true;
		o.editable = true;

		o = s.option(form.Value, 'cf_zone_id', _('Cloudflare zone ID'));
		o.datatype = 'string';
		o.description = _('The Cloudflare zone ID that hosts the DNS name(s) you publish.');
		o.editable = true;

		o = s.option(form.DummyValue, '_binary', _('tailcat version'));
		// In LuCI 25.x the DummyValue renderWidget uses
		// (cfgvalue != null) ? cfgvalue : this.default, where cfgvalue
		// is read from the UCI option ('_binary' doesn't exist -> null).
		// Set default so the version still displays.
		o.default = binaryVersion;
		o.readonly = true;

		s = m.section(form.GridSection, 'instance', _('Configured Instances'),
		 '每一行是一个 tailcat 进程。点击编辑可修改实例配置，切换启用并应用即可（重新）启动该实例。');
		s.addremove = true;
		s.nodescriptions = true;
		s.sortable = true;
		s.anonymous = true;
		s.maxcols = 4;

		// grid columns (modalonly=false, read-only display)
		o = s.option(form.DummyValue, '_name', _('Name'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, 'role', _('Role'));
		o.modalonly = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		o = s.option(form.DummyValue, '_status', _('Status'));
		o.textvalue = function (section_id) {
		 var inst = instances[section_id];
		 if (inst && inst.running) {
		  return '<span style="color:#0a0;font-weight:bold">● running</span>';
		 }
		 if (uci.get('tailcat', section_id, 'enabled') === '1') {
		  return '<span style="color:#a00;font-weight:bold">● failed/stopped</span>';
		 }
		 return '<span style="color:#888">○ disabled</span>';
		};
		o.rawhtml = true;
		o.modalonly = false;
		o.write = function () {};
		o.remove = function () {};

		// DERP relay info column (forward instances).
		// The derpMap is pre-resolved in load() by running
		// `tailcat parse` (or tailcat-derp-info.sh for domains)
		// on each forward instance's remote_addr, extracting
		// Region.Nodes[].HostName.
		o = s.option(form.DummyValue, '_derp', _('DERP relay'));
		o.textvalue = function (section_id) {
		 var role = uci.get('tailcat', section_id, 'role');
		 if (role !== 'forward') { return '<span style="color:#888">—</span>'; }
		 var host = derpMap[section_id];
		 if (!host || host === 'unknown' || host === 'auto') {
		  return '<span style="color:#888">auto</span>';
		 }
		 return '<span style="color:#06c;font-weight:bold">' + host + '</span>';
		};
		o.rawhtml = true;
		o.modalonly = false;
		o.write = function () {};
		o.remove = function () {};

		// modal fields (modalonly=true, editable in Add/Edit dialog)
		o = s.option(form.Value, 'name', _('Name'));
		o.rmempty = false;
		o.modalonly = true;
		o.cfgvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};

		// Hidden role field for depends conditionals
		o = s.option(form.ListValue, 'role', _('Role'));
		o.modalonly = true;
		o.value('serve', _('Serve'));
		o.value('forward', _('Forward'));
		o.default = 'serve';
		o.readonly = true;  // Can't change role after creation

		// Enabled in modal (same UCI field, different option name).
		o = s.option(form.Flag, '_enabled_modal', _('Enabled'));
		o.rmempty = false;
		o.modalonly = true;
		o.cfgvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'enabled');
		};
		o.write = function (section_id, value) {
		 uci.set('tailcat', section_id, 'enabled', value);
		};

		// Serve-specific fields (only shown for role=serve)
		o = s.option(form.ListValue, 'serve_kind', _('Kind'));
		o.value('ports', _('Expose local ports'));
		o.value('ssh', _('Auth-free SSH server'));
		o.value('ssh_auth', _('SSH server (public key)'));
		o.value('exit_node', _('Exit node'));
		o.value('files', _('SFTP file server'));
		o.value('recv', _('File drop box (recv)'));
		o.default = 'ports';
		o.editable = true;
		o.modalonly = true;
		o.depends('role', 'serve');

		o = s.option(form.Value, 'serve_ports', _('Ports (comma list or "all")'));
		o.datatype = 'string';
		o.placeholder = '8080,8443';
		o.depends('serve_kind', 'ports');
		o.modalonly = true;

		o = s.option(form.Value, 'recv_dir', _('Receive directory'));
		o.datatype = 'directory';
		o.placeholder = '/root/tailcat-inbox';
		o.depends('serve_kind', 'recv');
		o.modalonly = true;

		o = s.option(form.Value, 'files_dir', _('Files directory'));
		o.datatype = 'directory';
		o.placeholder = '/pub';
		o.depends('serve_kind', 'files');
		o.modalonly = true;

		o = s.option(form.ListValue, 'files_mode', _('Files mode'));
		o.value('ro', _('Read-only (default)'));
		o.value('rw', _('Read-write'));
		o.value('wo', _('Write-only (flat)'));
		o.value('wo+', _('Write-only (recursive)'));
		o.default = 'ro';
		o.depends('serve_kind', 'files');
		o.modalonly = true;

		// SSH key sources (multi-select, ssh_auth only).
		// 1. OpenWrt Dropbear authorized_keys
		o = s.option(form.Flag, 'ssh_use_dropbear_keys', _('Use OpenWrt Dropbear keys'));
		o.rmempty = false;
		o.default = '1';
		o.description = _('Include /etc/dropbear/authorized_keys (the standard OpenWrt SSH public key file).');
		o.depends('serve_kind', 'ssh_auth');
		o.modalonly = true;

		// 2. GitHub users (comma-separated, fetched from github.com/<user>.keys)
		o = s.option(form.Value, 'ssh_github_users', _('GitHub users'));
		o.datatype = 'string';
		o.placeholder = 'alice,bob';
		o.description = _('Comma-separated GitHub usernames; their public keys are fetched at startup from https://github.com/<user>.keys.');
		o.depends('serve_kind', 'ssh_auth');
		o.modalonly = true;

		// 3. Other authorized_keys file paths (comma-separated)
		o = s.option(form.Value, 'ssh_extra_key_files', _('Other key files'));
		o.datatype = 'string';
		o.placeholder = '/root/.ssh/authorized_keys,/etc/ssh/extra_keys';
		o.description = _('Comma-separated additional authorized_keys file paths or literal OpenSSH public key lines.');
		o.depends('serve_kind', 'ssh_auth');
		o.modalonly = true;

		// Tunnel-layer client allowlist (applies to ALL serve kinds).
		o = s.option(form.Value, 'allowed', _('Allowed client public keys'));
		o.datatype = 'string';
		o.placeholder = 'nodekey:abc123…,nodekey:def456…';
		o.description = _('Comma-separated client node public keys allowed to reach this service. Without this, any peer that knows the tailcat address can connect. Obtain client keys with "tailcat printpub" on each client.');
		o.depends('role', 'serve');
		o.modalonly = true;

		// DNS publishing (serve instances, opt-in).
		o = s.option(form.Flag, 'dns_publish', _('Publish address to DNS'));
		o.rmempty = false;
		o.default = '0';
		o.description = _('When enabled, the generated tailcat address is written as a TXT record "tailcat=<addr>" at the DNS name below. Requires Cloudflare API credentials in the Overview page.');
		o.depends('role', 'serve');
		o.modalonly = true;

		o = s.option(form.Value, 'dns_name', _('DNS name to publish'));
		o.datatype = 'hostname';
		o.placeholder = 'cloudcone-cc.example.com';
		o.description = _('The FQDN whose TXT record will carry "tailcat=<addr>". Clients can then connect by name: tailcat ssh <dns_name>.');
		o.depends('dns_publish', '1');
		o.modalonly = true;

		// Forward-specific fields (only shown for role=forward)
		o = s.option(form.ListValue, 'server', _('Remote server'));
		o.modalonly = true;
		o.description = _('Select a remote server defined above.');
		o.depends('role', 'forward');
		var serverSections = uci.sections('tailcat', 'server');
		for (var si = 0; si < serverSections.length; si++) {
			var sec = serverSections[si];
			var sname = uci.get('tailcat', sec['.name'], 'name') || sec['.name'];
			o.value(sname, sname);
		}

		o = s.option(form.Value, 'bind_addr', _('Local bind address'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';
		o.default = '0.0.0.0';
		o.modalonly = true;
		o.depends('role', 'forward');

		o = s.option(form.Value, 'local_port', _('Local port'));
		o.datatype = 'port';
		o.placeholder = '18080';
		o.modalonly = true;
		o.depends('role', 'forward');

		o = s.option(form.Value, 'remote_port', _('Remote port'));
		o.datatype = 'port';
		o.placeholder = '8080';
		o.modalonly = true;
		o.depends('role', 'forward');

		o = s.option(form.Value, 'remote_host', _('Remote host (exit-node)'));
		o.datatype = 'host';
		o.placeholder = '192.168.1.10';
		o.description = _('Optional: forward through the remote tailcat server (which must run as an exit node) to this IP behind it. Empty = direct forward to the remote port.');
		o.modalonly = true;
		o.depends('role', 'forward');

		o = s.option(form.Flag, 'open_firewall', _('Open WAN firewall ports'));
		o.rmempty = false;
		o.default = '0';
		o.modalonly = true;
		o.depends('role', 'forward');

		// Common fields
		o = s.option(form.Value, 'key_name', _('Persistent key name'));
		o.datatype = 'string';
		o.placeholder = 'default';
		o.description = _('Name of a persistent tailcat key (see Keys section). "default" is loaded automatically. Empty = ephemeral key (new address each restart).');
		o.modalonly = true;

		o = s.option(form.Value, 'derp_region', _('DERP relay region'));
		o.datatype = 'string';
		o.placeholder = 'auto';
		o.description = _('DERP relay region for this serve instance: region ID (301), code (nyc), name substring, or a custom DERP server hostname. "auto" = pick by latency at each startup. Only applies when a key is (re)generated.');
		o.depends('role', 'serve');
		o.modalonly = true;

		o = s.option(form.Flag, 'derp_fixed', _('Fixed DERP region'));
		o.rmempty = false;
		o.default = '0';
		o.description = _('Bake the chosen DERP region into the key and tailcat address, so server restarts and clients rendezvous in the same place. Recommended for DNS-published services.');
		o.depends('role', 'serve');
		o.modalonly = true;

		o = s.option(form.Flag, 'verbose', _('Verbose logs'));
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.datatype = 'filepath';
		o.placeholder = '/var/log/tailcat/my_web.log';
		o.modalonly = true;

		return m.render();
	}
});
