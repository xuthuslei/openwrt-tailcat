'use strict';
//
// View: tailcat/overview
//
// Top-level status page. Shows the global enable toggle, the tailcat
// binary version, and a summary table of all configured instances
// (role, enabled, status). Mirrors the "Status" tab pattern from
// luci-app-wireguard / luci-app-openvpn.
//
// All DOM is built declaratively and bound to the luci UI helpers
// (form.Map, ui.tables, fs/uci ubus calls).
//

return L.view.extend({
	// Pull the config + runtime state once on load.
	load: function () {
		var luci = window.L || L;
		var uci = luci.require('uci').default;
		var fs = luci.require('fs').default;
		var ubus = luci.require('ubus').default;

		return Promise.all([
			uci.load('tailcat'),
			ubus.call('service', 'list', { name: 'tailcat' }).catch(function () { return {}; }),
			fs.exec('/usr/bin/tailcat', ['--version']).then(function (r) {
				return (r && r.stdout) ? r.stdout.trim() : 'tailcat not found';
			}).catch(function () { return 'tailcat not found'; }),
		]).then(function (results) {
			return {
				uci: results[0],
				instances: results[1] || {},
				binaryVersion: results[2],
			};
		});
	},

	render: function (data) {
		var luci = window.L || L;
		var form = luci.require('form').default;
		var uci = luci.require('uci').default;

		var m, s, o;

		m = new form.Map('tailcat',
			_('Tailcat — Overview'),
			_('Tailcat is netcat over Tailscale\'s data plane, without the control plane. This page shows the global enable flag and a summary of all configured service instances.'));

		// --- Global section ---
		s = m.section(form.NamedSection, 'general', 'general',
			_('Global Settings'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable tailcat service'));
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'derp_map', _('Custom DERP map (optional)'));
		o.datatype = 'string';
		o.placeholder = 'https://example.com/derpmap.json';
		o.editable = true;

		// --- Binary info (read-only) ---
		o = s.option(form.DummyValue, '_binary', _('tailcat binary'));
		o.value = data.binaryVersion;
		o.readonly = true;

		// --- Instances summary table ---
		s = m.section(form.GridSection, 'instance',
			_('Configured Instances'),
			_('Each row is one tailcat process. Toggle <em>enabled</em> and apply to (re)start that instance. Use the tabs above to add Local Services or Remote Forwards.'));
		s.addremove = false;
		s.nodescriptions = true;
		s.sortable = true;
		s.anonymous = false;
		s.maxcols = 4;

		o = s.option(form.DummyValue, '_name', _('Name'));
		o.textvalue = function (section_id) { return section_id; };
		o.modalonly = false;

		o = s.option(form.DummyValue, 'role', _('Role'));
		o.modalonly = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.editable = true;
		o.modalonly = false;

		o = s.option(form.DummyValue, '_status', _('Status'));
		o.textvalue = function (section_id) {
			var inst = data.instances[section_id];
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

		return m.render();
	},

	// Restart the service after applying config so instances pick up changes.
	onApply: function () {
		var luci = window.L || L;
		var fs = luci.require('fs').default;
		return fs.exec('/etc/init.d/tailcat', ['restart'])
			.then(function () { return true; });
	},
});
