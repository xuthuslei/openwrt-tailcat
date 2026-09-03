'use strict';
//
// View: tailcat/status
//
// Runtime status page. For each configured instance it shows:
//   - the tailcat address printed at startup (parsed from log_file)
//   - the local/remote ports bound
//   - procd running state
//
// This page polls ubus every few seconds when the service is enabled.
//

return L.view.extend({
	load: function () {
		var luci = window.L || L;
		var uci = luci.require('uci').default;
		var ubus = luci.require('ubus').default;
		var fs = luci.require('fs').default;

		return uci.load('tailcat').then(function () {
			return Promise.all([
				ubus.call('service', 'list', { name: 'tailcat' }).catch(function () { return {}; }),
				fs.exec('/usr/bin/tailcat', ['--version']).then(function (r) {
					return (r && r.stdout) ? r.stdout.trim() : 'n/a';
				}).catch(function () { return 'n/a'; }),
			]).then(function (extra) {
				return { uci: uci, instances: extra[0] || {}, version: extra[1] };
			});
		});
	},

	// Extract the tailcat address from a serve instance's log file.
	// tailcat prints lines like:
	//   # 🐈 Server listening with new address: tcXXXXXX
	extractAddress: function (logPath) {
		var luci = window.L || L;
		var fs = luci.require('fs').default;
		if (!logPath) return Promise.resolve('');
		return fs.read(logPath, 4096).then(function (content) {
			if (!content) return '';
			var match = content.match(/address:\s*([A-Za-z0-9_-]{20,})/);
			return match ? match[1] : '';
		}).catch(function () { return ''; });
	},

	render: function (data) {
		var luci = window.L || L;
		var E = luci.bind;

		var sections = data.uci.sections('tailcat', 'instance');
		var rows = [];
		var addrPromises = [];

		sections.forEach(function (sec) {
			var role = data.uci.get('tailcat', sec['.name'], 'role') || 'serve';
			var enabled = data.uci.get('tailcat', sec['.name'], 'enabled') === '1';
			var logFile = data.uci.get('tailcat', sec['.name'], 'log_file');
			var running = !!(data.instances[sec['.name']] && data.instances[sec['.name']].running);

			var statusCell;
			if (!enabled) {
				statusCell = E('span', { style: 'color:#888' }, ['○ disabled']);
			} else if (running) {
				statusCell = E('span', { style: 'color:#0a0;font-weight:bold' }, ['● running']);
			} else {
				statusCell = E('span', { style: 'color:#a00;font-weight:bold' }, ['● stopped/failed']);
			}

			var addrCell = E('em', { class: 'tailcat-addr-' + sec['.name'] }, ['…']);
			if (role === 'serve' && logFile) {
				addrPromises.push(
					this.extractAddress(logFile).then(function (addr) {
						if (addr) {
							addrCell.firstChild.nodeValue = addr;
							addrCell.style.fontFamily = 'monospace';
						} else {
							addrCell.firstChild.nodeValue = '(not listening yet)';
						}
					}).bind(this)
				);
			} else {
				addrCell.firstChild.nodeValue = role === 'forward' ? '— (client)' : '';
			}

			var detailCell;
			if (role === 'serve') {
				var kind = data.uci.get('tailcat', sec['.name'], 'serve_kind') || 'ports';
				if (kind === 'ports') {
					detailCell = 'serve ports: ' + (data.uci.get('tailcat', sec['.name'], 'serve_ports') || '?');
				} else if (kind === 'ssh') {
					detailCell = 'serve auth-free SSH';
				} else if (kind === 'recv') {
					detailCell = 'recv into ' + (data.uci.get('tailcat', sec['.name'], 'recv_dir') || '?');
				}
			} else {
				detailCell = 'dial ' + (data.uci.get('tailcat', sec['.name'], 'remote_addr') || '?') +
					' → ' + (data.uci.get('tailcat', sec['.name'], 'forwards') || '?');
			}

			rows.push(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, [sec['.name']]),
				E('td', { class: 'td' }, [role]),
				E('td', { class: 'td' }, [statusCell]),
				E('td', { class: 'td' }, [addrCell]),
				E('td', { class: 'td' }, [detailCell]),
			]));
		}.bind(this));

		var table = E('table', { class: 'table' }, [
			E('thead', {}, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, ['Instance']),
					E('th', { class: 'th' }, ['Role']),
					E('th', { class: 'th' }, ['Status']),
					E('th', { class: 'th' }, ['Tailcat Address']),
					E('th', { class: 'th' }, ['Detail']),
				]),
			]),
			E('tbody', {}, rows.length ? rows : [
				E('tr', { class: 'tr' }, [
					E('td', { class: 'td', colspan: 5 }, ['No instances configured.']),
				]),
			]),
		]);

		var header = E('div', {}, [
			E('h2', {}, ['Tailcat Status']),
			E('p', {}, ['tailcat binary version: ', E('code', {}, [data.version])]),
		]);

		var actions = E('div', { class: 'cbi-page-actions' }, [
			E('button', {
				class: 'cbi-button cbi-button-neutral',
				onclick: function () { window.location.reload(); },
			}, ['Refresh']),
			E('button', {
				class: 'cbi-button cbi-button-positive',
				onclick: function () {
					var fs = luci.require('fs').default;
					fs.exec('/etc/init.d/tailcat', ['restart']).then(function () {
						window.alert('tailcat service restarted');
						window.location.reload();
					});
				},
			}, ['Restart Service']),
		]);

		// Resolve address lookups after render.
		Promise.all(addrPromises).then(function () {
			// DOM already updated in place via the captured addrCell refs.
		});

		return E('div', {}, [header, table, actions]);
	},
});
