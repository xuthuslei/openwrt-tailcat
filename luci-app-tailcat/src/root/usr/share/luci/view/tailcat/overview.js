'use strict';'require view';'require form';'require fs';'require uci';'require rpc';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name']
});

var callTailcatVersion = fs.exec('/usr/bin/tailcat', ['--version']).then(function (r) {
	return (r && r.stdout) ? r.stdout.trim() : 'tailcat not found';
}).catch(function () { return 'tailcat not found'; });

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('tailcat'),
			L.resolveDefault(callServiceList('tailcat'), {}),
			L.resolveDefault(callTailcatVersion, 'n/a')
		]);
	},

	render: function (data) {
		var instances = data[1] && data[1].tailcat ? data[1].tailcat.instances : {};
		var binaryVersion = data[2];

		var m, s, o;

		m = new form.Map('tailcat',
			_('Tailcat — Overview'),
			_('Tailcat is netcat over Tailscale\'s data plane, without the control plane.'));

		s = m.section(form.NamedSection, 'general', 'general', _('Global Settings'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable tailcat service'));
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'derp_map', _('Custom DERP map (optional)'));
		o.datatype = 'string';
		o.placeholder = 'https://example.com/derpmap.json';
		o.editable = true;

		o = s.option(form.DummyValue, '_binary', _('tailcat binary'));
		o.value = binaryVersion;
		o.readonly = true;

		s = m.section(form.GridSection, 'instance', _('Configured Instances'),
			_('Each row is one tailcat process. Toggle <em>enabled</em> and apply to (re)start that instance.'));
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

		return m.render();
	},

	onApply: function () {
		return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () { return true; });
	}
});
