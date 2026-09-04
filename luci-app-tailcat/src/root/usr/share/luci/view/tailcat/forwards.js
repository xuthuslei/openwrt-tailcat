'use strict';'require view';'require form';'require fs';'require uci';

return view.extend({
	load: function () {
		return uci.load('tailcat');
	},

	render: function () {
		var m, s, o;

		m = new form.Map('tailcat',
			_('Remote Forwards'),
			_('Define remote tailcat servers once, then create port forwards that reference them by name.'));

		// --- Remote Servers -------------------------------------------------
		// Each server needs both a read-only grid column (modalonly=false,
		// shown in the table) and an editable modal field (modalonly=true,
		// shown in the Add/Edit dialog). LuCI's cloneOptions skips
		// modalonly=false options when building the modal, so we define
		// two option objects per field: a DummyValue for display and a
		// Value/Flag for editing.
		s = m.section(form.GridSection, 'server', _('Remote Servers'));
		s.addremove = true;
		s.addbtntitle = _('Add remote server');
		s.sortable = true;
		s.anonymous = true;
		s.maxcols = 3;
		s.nodescriptions = true;

		// grid column: show name (read-only in table)
		o = s.option(form.DummyValue, '_name_disp', _('Name'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};
		o.modalonly = false;

		// grid column: show remote_addr (read-only in table)
		o = s.option(form.DummyValue, '_addr_disp', _('Tailcat address'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'remote_addr') || '—';
		};
		o.modalonly = false;

		// grid column: show enabled flag (read-only in table)
		o = s.option(form.DummyValue, '_en_disp', _('Enabled'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'enabled') === '1' ? '✓' : '✗';
		};
		o.modalonly = false;

		// modal fields (editable in Add/Edit dialog)
		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'vps';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'remote_addr', _('Tailcat address'));
		o.datatype = 'string';
		o.placeholder = 'tcXXXXXXXXXXXXXXXXXX';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = true;
		o.default = '1';

		// --- Port Forwards --------------------------------------------------
		s = m.section(form.GridSection, 'instance', _('Port Forwards'));
		s.addremove = true;
		s.addbtntitle = _('Add port forward');
		s.sortable = true;
		s.anonymous = true;
		s.maxcols = 6;
		s.nodescriptions = true;
		s.filter = function (section_id) {
		 return uci.get('tailcat', section_id, 'role') === 'forward';
		};
		s.addModalOptions = function (modal, section_id) {
		 uci.set('tailcat', section_id, 'role', 'forward');
		 uci.set('tailcat', section_id, 'bind_addr', '0.0.0.0');
		};

		// grid columns (modalonly=false, read-only display)
		o = s.option(form.DummyValue, '_name_disp', _('Name'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_srv_disp', _('Remote server'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'server') || '—';
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_ports_disp', _('Ports (local:remote)'));
		o.textvalue = function (section_id) {
		 var lp = uci.get('tailcat', section_id, 'local_port');
		 var rp = uci.get('tailcat', section_id, 'remote_port');
		 if (!lp || !rp) return '—';
		 return lp + ':' + rp;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_en_disp', _('Enabled'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'enabled') === '1' ? '✓' : '✗';
		};
		o.modalonly = false;

		// modal fields (modalonly=true, editable in Add/Edit dialog)
		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'remote_web';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = true;
		o.default = '1';

		o = s.option(form.ListValue, 'server', _('Remote server'));
		o.rmempty = false;
		o.modalonly = true;
		o.description = _('Select a remote server defined above.');
		// Populate from all 'server' sections.
		var serverSections = uci.sections('tailcat', 'server');
		for (var i = 0; i < serverSections.length; i++) {
			var sec = serverSections[i];
			var sname = uci.get('tailcat', sec['.name'], 'name') || sec['.name'];
			var addr = uci.get('tailcat', sec['.name'], 'remote_addr') || '';
			o.value(sname, sname + (addr ? ' (' + addr + ')' : ''));
		}

		o = s.option(form.Value, 'local_port', _('Local port'));
		o.datatype = 'port';
		o.placeholder = '18080';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'remote_port', _('Remote port'));
		o.datatype = 'port';
		o.placeholder = '8080';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'bind_addr', _('Local bind address'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';
		o.default = '0.0.0.0';
		o.rmempty = false;
		o.modalonly = true;
		o.description = _('As a router, forward instances bind 0.0.0.0 by default so LAN clients can reach them.');

		o = s.option(form.Flag, 'open_firewall', _('Open WAN firewall ports'));
		o.rmempty = false;
		o.default = '0';
		o.modalonly = true;
		o.editable = true;
		o.description = _('When enabled, open the WAN-side firewall for the local forward ports so external (Internet) hosts can reach them. LAN access is always available. Default is off to avoid exposing ports to the Internet.');

		o = s.option(form.Flag, 'verbose', _('Verbose logs'));
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.datatype = 'filepath';
		o.placeholder = '/var/log/tailcat/remote_web.log';
		o.modalonly = true;

		return m.render();
	},

	onApply: function () {
		return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () { return true; });
	}
});
