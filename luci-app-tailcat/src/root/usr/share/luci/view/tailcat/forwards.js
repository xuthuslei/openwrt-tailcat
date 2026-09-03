'use strict';
//
// View: tailcat/forwards
//
// Manages "forward" role instances — connecting to a remote tailcat
// server address and binding local ports that forward into the remote
// service. Each row is a UCI 'instance' section with role=forward.
//
// Key fields:
//   remote_addr  the tailcat address to dial, e.g. tcXXXXX
//   bind_addr    local bind address (default 127.0.0.1)
//   forwards     space-separated local:remote pairs (or bare port = port:port)
//

return L.view.extend({
	load: function () {
		var luci = window.L || L;
		var uci = luci.require('uci').default;
		return uci.load('tailcat').then(function () { return uci; });
	},

	render: function (uci) {
		var luci = window.L || L;
		var form = luci.require('form').default;

		var m = new form.Map('tailcat',
			_('Remote Forwards (forward)'),
			_('A <em>forward</em> instance connects to a remote tailcat server address and binds one or more local TCP ports that forward into the remote service. Use this to make a remote tailcat server\'s ports reachable as ordinary local ports on this router.'));

		var s = m.section(form.GridSection, 'instance', _('Forward Instances'));
		s.addremove = true;
		s.addbtntitle = _('Add forward instance');
		s.sortable = true;
		s.anonymous = false;
		s.maxcols = 6;
		s.nodescriptions = true;
		// Only show sections whose role is forward.
		s.filter = function (section_id) {
			return uci.get('tailcat', section_id, 'role') === 'forward';
		};
		// When adding a new section, default its role to 'forward'.
		s.addModalOptions = function (modal, section_id) {
			uci.set('tailcat', section_id, 'role', 'forward');
			uci.set('tailcat', section_id, 'bind_addr', '127.0.0.1');
		};

		var o;

		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'remote_web';
		o.modalonly = true;
		o.readonly = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		o = s.option(form.Value, 'remote_addr', _('Remote tailcat address'));
		o.datatype = 'string';
		o.placeholder = 'tcXXXXXXXXXXXXXXXXXX';
		o.rmempty = false;
		o.modalonly = false;

		o = s.option(form.Value, 'bind_addr', _('Local bind address'));
		o.datatype = 'ipaddr';
		o.placeholder = '127.0.0.1';
		o.rmempty = false;
		o.modalonly = false;

		o = s.option(form.Value, 'forwards', _('Port forwards (local:remote pairs)'));
		o.datatype = 'string';
		o.placeholder = '18080:8080 13306:3306';
		o.rmempty = false;
		o.modalonly = false;

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
		var luci = window.L || L;
		var fs = luci.require('fs').default;
		return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () { return true; });
	},
});
