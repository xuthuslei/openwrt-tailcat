'use strict';'require view';'require form';'require fs';'require uci';

return view.extend({
 load: function () {
  // The init script sets TAILCAT_ADDR_FILE=/var/run/tailcat/<section>.addr
  // for each serve instance; tailcat writes its own address there.
  // Read each file into a section_id -> addr map.
  var addrMap = {};
  return uci.load('tailcat').then(function () {
   var sections = uci.sections('tailcat', 'instance');
   var promises = [];
   for (let i = 0; i < sections.length; i++) {
    let sid = sections[i]['.name'];
    let role = uci.get('tailcat', sid, 'role');
    if (role && role !== 'serve') continue;
    let addrFile = '/var/run/tailcat/' + sid + '.addr';
    promises.push(fs.read(addrFile).then(function (out) {
     out = (out || '').trim();
     if (out) addrMap[sid] = out;
    }).catch(function () {}));
   }
   return Promise.all(promises);
  }).then(function () {
   return addrMap;
  });
 },

 render: function (addrMap) {
  var m, s, o;

		m = new form.Map('tailcat',
			_('Local Services (serve)'),
			'A <em>serve</em> 实例在本路由器上暴露端口 / SSH / 文件接收箱，供远端 tailcat 客户端连接。');

		s = m.section(form.GridSection, 'instance', _('Serve Instances'));
		s.addremove = true;
		s.addbtntitle = _('Add serve instance');
		s.sortable = true;
		s.anonymous = true;
		s.maxcols = 6;
		s.nodescriptions = true;
		s.filter = function (section_id) {
		 var r = uci.get('tailcat', section_id, 'role');
		 return (!r || r === 'serve');
		};
		s.addModalOptions = function (modal, section_id) {
		 uci.set('tailcat', section_id, 'role', 'serve');
		};

		// grid columns (modalonly=false, read-only display)
		o = s.option(form.DummyValue, '_name_disp', _('Name'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_kind_disp', _('Kind'));
		o.textvalue = function (section_id) {
		 var kind = uci.get('tailcat', section_id, 'serve_kind') || 'ports';
		 if (kind === 'ports') return _('Expose local ports');
		 if (kind === 'ssh') return _('Auth-free SSH server');
		 if (kind === 'recv') return _('File drop box (recv)');
		 return kind;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_detail_disp', _('Detail'));
		o.textvalue = function (section_id) {
		 var kind = uci.get('tailcat', section_id, 'serve_kind') || 'ports';
		 if (kind === 'ports') {
		  return uci.get('tailcat', section_id, 'serve_ports') || '—';
		 }
		 if (kind === 'recv') {
		  return uci.get('tailcat', section_id, 'recv_dir') || '—';
		 }
		 if (kind === 'ssh') {
		  return '—';
		 }
		 return '—';
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_addr_disp', _('Tailcat address'));
		o.textvalue = function (section_id) {
		 var a = addrMap[section_id] || '';
		 if (!a) { return '—'; }
		 var disp = (/^tc/i.test(a) && a.length > 18) ? a.slice(0, 14) + '…' : a;
		 return '<span class="tailcat-addr-text">' + disp + '</span>' +
		  '<button type="button" class="cbi-button cbi-button-neutral tailcat-addr-copy" data-addr="' + a + '" title="' + _('Copy full address') + '">⧉</button>';
		};
		o.rawhtml = true;
		o.modalonly = false;

		// Enabled as a real checkbox in the grid (like overview),
		// directly toggleable from the table.
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		// modal fields (modalonly=true, editable in Add/Edit dialog)
		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'my_web';
		o.rmempty = false;
		o.modalonly = true;
		o.cfgvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};

		// Enabled in modal (same UCI field, different option name
		// to avoid DOM id conflict with the grid Flag above).
		o = s.option(form.Flag, '_enabled_modal', _('Enabled'));
		o.rmempty = false;
		o.modalonly = true;
		o.cfgvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'enabled');
		};
		o.write = function (section_id, value) {
		 uci.set('tailcat', section_id, 'enabled', value);
		};

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
		o.onchange = function (ev, kind) {
		 var root = ev.target.closest('.cbi-section');
		 if (!root) return;
		 root.classList.toggle('tailcat-kind-ports', kind === 'ports');
		 root.classList.toggle('tailcat-kind-recv', kind === 'recv');
		};

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
		o.modalonly = true;

		o = s.option(form.Value, 'dns_name', _('DNS name to publish'));
		o.datatype = 'hostname';
		o.placeholder = 'cloudcone-cc.example.com';
		o.description = _('The FQDN whose TXT record will carry "tailcat=<addr>". Clients can then connect by name: tailcat ssh <dns_name>.');
		o.depends('dns_publish', '1');
		o.modalonly = true;

		o = s.option(form.Value, 'key_name', _('Persistent key name'));
		o.datatype = 'string';
		o.placeholder = 'default';
		o.description = _('Name of a persistent tailcat key (see Keys section). "default" is loaded automatically. Empty = ephemeral key (new address each restart).');
		o.modalonly = true;

		o = s.option(form.Value, 'derp_region', _('DERP relay region'));
		o.datatype = 'string';
		o.placeholder = 'auto';
		o.description = _('DERP relay region for this serve instance: region ID (301), code (nyc), name substring, or a custom DERP server hostname. "auto" = pick by latency at each startup. Only applies when a key is (re)generated.');
		o.modalonly = true;

		o = s.option(form.Flag, 'derp_fixed', _('Fixed DERP region'));
		o.rmempty = false;
		o.default = '0';
		o.description = _('Bake the chosen DERP region into the key and tailcat address, so server restarts and clients rendezvous in the same place. Recommended for DNS-published services.');
		o.modalonly = true;

		o = s.option(form.Flag, 'verbose', _('Verbose logs'));
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.datatype = 'filepath';
		o.placeholder = '/var/log/tailcat/my_web.log';
		o.modalonly = true;

		return m.render().then(function (node) {
		 // Delegate clicks on the ⧉ copy button.
		 node.addEventListener('click', function (ev) {
		  var btn = ev.target.closest('.tailcat-addr-copy');
		  if (!btn) { return; }
		  var addr = btn.getAttribute('data-addr') || '';
		  if (!addr) { return; }
		  if (navigator.clipboard && navigator.clipboard.writeText) {
		   navigator.clipboard.writeText(addr);
		  } else {
		   var ta = document.createElement('textarea');
		   ta.value = addr;
		   ta.style.position = 'fixed';
		   ta.style.opacity = '0';
		   document.body.appendChild(ta);
		   ta.select();
		   try { document.execCommand('copy'); } catch (e) {}
		   document.body.removeChild(ta);
		  }
		  var orig = btn.textContent;
		  btn.textContent = '✓';
		  setTimeout(function () { btn.textContent = orig; }, 1200);
		 });
		 return node;
		});
	}
});
