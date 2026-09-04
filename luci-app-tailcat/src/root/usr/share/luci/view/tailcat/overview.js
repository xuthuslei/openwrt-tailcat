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
			}).catch(function () { return 'n/a'; })
		]);
	},

	render: function (data) {
		var instances = data[1] && data[1].tailcat ? data[1].tailcat.instances : {};
		var binaryVersion = data[2];

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

		o = s.option(form.Flag, 'open_firewall', _('Open WAN firewall ports'));
		o.rmempty = false;
		o.default = '0';
		o.modalonly = true;
		o.depends('role', 'forward');

		// Common fields
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
