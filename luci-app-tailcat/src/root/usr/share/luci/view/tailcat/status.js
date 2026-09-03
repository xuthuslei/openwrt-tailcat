'use strict';'require view';'require fs';'require uci';'require rpc';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name']
});

var callTailcatVersion = fs.exec('/usr/bin/tailcat', ['--version']).then(function (r) {
	return (r && r.stdout) ? r.stdout.trim() : 'n/a';
}).catch(function () { return 'n/a'; });

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
		var version = data[2];
		var sections = uci.sections('tailcat', 'instance');
		var rows = [];
		var addrPromises = [];

		sections.forEach(function (sec) {
			var sid = sec['.name'];
			var role = uci.get('tailcat', sid, 'role') || 'serve';
			var enabled = uci.get('tailcat', sid, 'enabled') === '1';
			var logFile = uci.get('tailcat', sid, 'log_file');
			var running = !!(instances[sid] && instances[sid].running);

			var statusCell;
			if (!enabled) {
				statusCell = E('span', { style: 'color:#888' }, ['○ disabled']);
			} else if (running) {
				statusCell = E('span', { style: 'color:#0a0;font-weight:bold' }, ['● running']);
			} else {
				statusCell = E('span', { style: 'color:#a00;font-weight:bold' }, ['● stopped/failed']);
			}

			var addrCell = E('em', { class: 'tailcat-addr-' + sid }, ['…']);
			if (role === 'serve' && logFile) {
				addrPromises.push(
					fs.read(logFile, 4096).then(function (content) {
						if (!content) {
							addrCell.firstChild.nodeValue = '(not listening yet)';
							return;
						}
						var match = content.match(/address:\s*([A-Za-z0-9_-]{20,})/);
						addrCell.firstChild.nodeValue = match ? match[1] : '(address not found in log)';
						addrCell.style.fontFamily = 'monospace';
					}).catch(function () {
						addrCell.firstChild.nodeValue = '(log not available)';
					})
				);
			} else {
				addrCell.firstChild.nodeValue = role === 'forward' ? '— (client)' : '';
			}

			var detailCell;
			if (role === 'serve') {
				var kind = uci.get('tailcat', sid, 'serve_kind') || 'ports';
				if (kind === 'ports') {
					detailCell = 'serve ports: ' + (uci.get('tailcat', sid, 'serve_ports') || '?');
				} else if (kind === 'ssh') {
					detailCell = 'serve auth-free SSH';
				} else if (kind === 'recv') {
					detailCell = 'recv into ' + (uci.get('tailcat', sid, 'recv_dir') || '?');
				}
			} else {
				detailCell = 'dial ' + (uci.get('tailcat', sid, 'remote_addr') || '?') +
					' → ' + (uci.get('tailcat', sid, 'forwards') || '?');
			}

			rows.push(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, [sid]),
				E('td', { class: 'td' }, [role]),
				E('td', { class: 'td' }, [statusCell]),
				E('td', { class: 'td' }, [addrCell]),
				E('td', { class: 'td' }, [detailCell]),
			]));
		});

		var table = E('table', { class: 'table' }, [
			E('thead', {}, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, [_('Instance')]),
					E('th', { class: 'th' }, [_('Role')]),
					E('th', { class: 'th' }, [_('Status')]),
					E('th', { class: 'th' }, [_('Tailcat Address')]),
					E('th', { class: 'th' }, [_('Detail')]),
				]),
			]),
			E('tbody', {}, rows.length ? rows : [
				E('tr', { class: 'tr' }, [
					E('td', { class: 'td', colspan: 5 }, [_('No instances configured.')]),
				]),
			]),
		]);

		var actions = E('div', { class: 'cbi-page-actions' }, [
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				onclick: function () { window.location.reload(); },
			}, [_('Refresh')]),
			E('button', {
				class: 'cbi-button cbi-button-positive',
				onclick: function () {
					fs.exec('/etc/init.d/tailcat', ['restart']).then(function () {
						window.alert(_('tailcat service restarted'));
						window.location.reload();
					});
				},
			}, [_('Restart Service')]),
		]);

		// Resolve address lookups after render.
		Promise.all(addrPromises).then(function () {
			// DOM already updated in place via the captured addrCell refs.
		});

		return E('div', {}, [
			E('h2', {}, [_('Tailcat Status')]),
			E('p', {}, [_('tailcat binary version: '), E('code', {}, [version])]),
			table,
			actions,
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
