'use strict';
//
// View: tailcat/log
//
// Live log viewer. Lets the user pick which instance's log_file to
// tail and streams the last N lines, refreshing on a timer. This
// mirrors the "System Log" pattern but scopes it to tailcat.
//

return L.view.extend({
	load: function () {
		var luci = window.L || L;
		var uci = luci.require('uci').default;
		return uci.load('tailcat').then(function () { return uci; });
	},

	render: function (uci) {
		var luci = window.L || L;
		var E = luci.bind;
		var fs = luci.require('fs').default;

		// Build the instance dropdown from configured instances that
		// have a log_file set.
		var instances = uci.sections('tailcat', 'instance');
		var options = instances.map(function (sec) {
			var logFile = uci.get('tailcat', sec['.name'], 'log_file');
			if (!logFile) return null;
			return E('option', { value: logFile }, [
				sec['.name'] + ' — ' + logFile,
			]);
		}).filter(Boolean);

		var select = E('select', { class: 'cbi-input-select', id: 'tailcat-log-select' },
			options.length ? options : [E('option', { value: '' }, ['No log files configured'])]
		);

		var pre = E('pre', {
			id: 'tailcat-log-output',
			style: 'background:#f5f5f5;border:1px solid #ddd;padding:8px;max-height:60vh;overflow:auto;font-size:12px;line-height:1.4;white-space:pre-wrap;',
		}, ['Select an instance log file above.']);

		var refreshBtn = E('button', {
			class: 'cbi-button cbi-button-neutral',
			onclick: function () { self.refresh(); },
		}, ['Refresh']);

		var clearBtn = E('button', {
			class: 'cbi-button cbi-button-negative',
			onclick: function () {
				pre.firstChild.nodeValue = '';
			},
		}, ['Clear']);

		var autoChk = E('input', {
			type: 'checkbox',
			id: 'tailcat-log-auto',
			checked: true,
		});
		var autoLabel = E('label', { for: 'tailcat-log-auto', style: 'margin-left:6px;' }, ['Auto-refresh (3s)']);

		select.onchange = function () { self.refresh(); };

		var self = {
			refresh: function () {
				var path = select.value;
				if (!path) {
					pre.firstChild.nodeValue = '(no log file selected)';
					return;
				}
				fs.read(path, 65536).then(function (content) {
					if (!content) {
						pre.firstChild.nodeValue = '(empty or not yet created)';
						return;
					}
					// Show the tail: last 500 lines.
					var lines = content.split('\n');
					if (lines.length > 500) {
						lines = ['… (' + (lines.length - 500) + ' earlier lines truncated) …'].concat(lines.slice(-500));
					}
					pre.firstChild.nodeValue = lines.join('\n');
					// Scroll to bottom.
					pre.scrollTop = pre.scrollHeight;
				}).catch(function (err) {
					pre.firstChild.nodeValue = 'Error reading log: ' + (err.message || err);
				});
			},
		};

		// Kick off the first load.
		self.refresh();

		// Auto-refresh timer.
		var timer = null;
		function startTimer() {
			if (timer) clearInterval(timer);
			if (autoChk.checked) {
				timer = setInterval(function () { self.refresh(); }, 3000);
			}
		}
		autoChk.onchange = startTimer;
		startTimer();

		// Cleanup on view destroy.
		this.onUnload = function () {
			if (timer) clearInterval(timer);
		};

		return E('div', {}, [
			E('h2', {}, ['Tailcat Logs']),
			E('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;' }, [
				E('label', { for: 'tailcat-log-select' }, ['Instance: ']),
				select,
				refreshBtn,
				clearBtn,
				autoChk,
				autoLabel,
			]),
			pre,
			E('p', { style: 'color:#888;font-size:11px;' }, [
				'Logs are written by each tailcat instance to the path set in its ',
				E('code', {}, ['log_file']),
				' option. The tailcat address for serve instances is printed as ',
				E('code', {}, ['# 🐈 Server listening with new address: tcXXXX…']),
				'.',
			]),
		]);
	},
});
