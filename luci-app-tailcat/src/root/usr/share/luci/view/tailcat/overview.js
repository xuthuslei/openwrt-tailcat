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

		o = s.option(form.DummyValue, '_binary', _('tailcat binary'));
		o.textvalue = function () { return binaryVersion; };
		o.readonly = true;

		// Build a read-only HTML table of all configured instances.
		// We avoid form.GridSection here because it always renders
		// an "Edit" button that opens an empty modal (overview is
		// read-only; editing happens on the Services/Forwards pages).
		var instanceSections = uci.sections('tailcat', 'instance');
		var rows = [];
		for (var i = 0; i < instanceSections.length; i++) {
			var sid = instanceSections[i]['.name'];
			var instName = uci.get('tailcat', sid, 'name') || sid;
			var role = uci.get('tailcat', sid, 'role') || 'serve';
			var enabled = uci.get('tailcat', sid, 'enabled') === '1';
			var inst = instances[sid];
			var running = !!(inst && inst.running);
			var statusHtml;
			if (running) {
				statusHtml = '<span style="color:#0a0;font-weight:bold">● running</span>';
			} else if (enabled) {
				statusHtml = '<span style="color:#a00;font-weight:bold">● failed/stopped</span>';
			} else {
				statusHtml = '<span style="color:#888">○ disabled</span>';
			}
			rows.push([
				instName,
				role,
				enabled ? '✓' : '✗',
				statusHtml
			]);
		}

		// Use a DummyValue to inject the pre-built HTML table.
		s = m.section(form.NamedSection, 'general', 'general');
		s.addremove = false;
		o = s.option(form.DummyValue, '_instances');
		o.rawhtml = true;
		o.textvalue = function () {
			var html = '<h3>' + _('Configured Instances') + '</h3>';
			html += '<p>每一行是一个 tailcat 进程。切换启用并应用即可（重新）启动该实例。</p>';
			html += '<table class="table"><thead><tr>';
			html += '<th>' + _('Name') + '</th>';
			html += '<th>' + _('Role') + '</th>';
			html += '<th>' + _('Enabled') + '</th>';
			html += '<th>' + _('Status') + '</th>';
			html += '</tr></thead><tbody>';
			if (rows.length === 0) {
				html += '<tr><td colspan="4"><em>' + _('No instances configured') + '</em></td></tr>';
			} else {
				for (var r = 0; r < rows.length; r++) {
					html += '<tr>';
					for (var c = 0; c < rows[r].length; c++) {
						html += '<td>' + rows[r][c] + '</td>';
					}
					html += '</tr>';
				}
			}
			html += '</tbody></table>';
			return html;
		};

		return m.render();
	},

	handleApply: function (ev) {
	 var self = this;
	 return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () {
	  return new Promise(function (r) { setTimeout(r, 1500); });
	 }).then(function () {
	  return self.load();
	 }).then(function (data) {
	  return self.render(data);
	 });
	},

	onApply: function () {
		return fs.exec('/etc/init.d/tailcat', ['restart']).then(function () { return true; });
	}
});
