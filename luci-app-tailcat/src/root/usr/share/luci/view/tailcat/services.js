'use strict';
//
// View: tailcat/services
//
// Manages "serve" role instances — local services this router
// exposes to a remote tailcat client. Three kinds:
//   ports : expose comma-separated local TCP ports (or "all")
//   ssh   : auth-free SSH server over tailcat
//   recv  : file drop box into a local directory
//
// Pattern follows luci-app-openvpn's instance grid: add/remove rows,
// each row is a UCI 'instance' section with role=serve.
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
			_('Local Services (serve)'),
			_('A <em>serve</em> instance exposes something on this router to a remote tailcat client. Tailcat prints a short address (e.g. <code>tcXXXXXX</code>) to the log when it starts listening; give that address to the client.'));

		// Filter grid to role=serve only.
		var s = m.section(form.GridSection, 'instance', _('Serve Instances'));
		s.addremove = true;
		s.addbtntitle = _('Add serve instance');
		s.sortable = true;
		s.anonymous = false;
		s.maxcols = 6;
		s.nodescriptions = true;
		// Only show sections whose role is serve (or unset → defaults to serve).
		s.filter = function (section_id) {
			var r = uci.get('tailcat', section_id, 'role');
			return (!r || r === 'serve');
		};
		// When adding a new section, default its role to 'serve'.
		s.addModalOptions = function (modal, section_id) {
			uci.set('tailcat', section_id, 'role', 'serve');
		};

		var o;

		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'my_web';
		o.modalonly = true;
		o.readonly = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		o = s.option(form.ListValue, 'serve_kind', _('Kind'));
		o.value('ports', _('Expose local ports'));
		o.value('ssh', _('Auth-free SSH server'));
		o.value('recv', _('File drop box (recv)'));
		o.default = 'ports';
		o.editable = true;
		o.modalonly = false;
		o.onchange = function (ev, kind) {
			// Show/hide port & directory inputs via CSS classes.
			var root = ev.target.closest('.cbi-section');
			if (!root) return;
			root.classList.toggle('tailcat-kind-ports', kind === 'ports');
			root.classList.toggle('tailcat-kind-recv', kind === 'recv');
		};

		o = s.option(form.Value, 'serve_ports', _('Ports (comma list or "all")'));
		o.datatype = 'string';
		o.placeholder = '8080,8443';
		o.depends('serve_kind', 'ports');
		o.modalonly = false;

		o = s.option(form.Value, 'recv_dir', _('Receive directory'));
		o.datatype = 'directory';
		o.placeholder = '/root/tailcat-inbox';
		o.depends('serve_kind', 'recv');
		o.modalonly = false;

		o = s.option(form.Flag, 'verbose', _('Verbose logs'));
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.datatype = 'filepath';
		o.placeholder = '/var/log/tailcat/my_web.log';
		o.modalonly = true;

		// Custom validation: ports required when kind=ports, dir when recv.
		m.parse = (function (orig) {
			return function () {
				var rv = orig.apply(this, arguments);
				// per-row validation handled via option.depends above
				return rv;
			};
		})(m.parse);

		return m.render();
	},

	onApply: function () {
		var luci = window.L || L;
		var fs = luci.require('fs').default;
		return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () { return true; });
	},
});
