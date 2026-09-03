'use strict';'require view';'require form';'require fs';'require uci';

return view.extend({
	load: function () {
		return uci.load('tailcat');
	},

	render: function () {
		var m, s, o;

		m = new form.Map('tailcat',
			_('Remote Forwards (forward)'),
			_('A <em>forward</em> instance connects to a remote tailcat server address and binds local TCP ports.'));

		s = m.section(form.GridSection, 'instance', _('Forward Instances'));
		s.addremove = true;
		s.addbtntitle = _('Add forward instance');
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

		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'remote_web';
		o.modalonly = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		o = s.option(form.Value, 'remote_addr', _('Remote tailcat address'));
		o.datatype = 'string';
		o.placeholder = 'tcXXXXXXXXXXXXXXXXXX';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'bind_addr', _('Local bind address'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';
		o.default = '0.0.0.0';
		o.rmempty = false;
		o.modalonly = true;
		o.description = _('As a router, forward instances bind 0.0.0.0 by default so LAN clients can reach them.');

		o = s.option(form.Value, 'forwards', _('Port forwards (local:remote pairs)'));
		o.datatype = 'string';
		o.placeholder = '18080:8080 13306:3306';
		o.rmempty = false;
		o.modalonly = true;

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
