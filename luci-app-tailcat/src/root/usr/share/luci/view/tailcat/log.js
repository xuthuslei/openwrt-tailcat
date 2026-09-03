'use strict';'require view';'require fs';'require uci';

return view.extend({
	load: function () {
		return uci.load('tailcat');
	},

	render: function () {
		var instances = uci.sections('tailcat', 'instance');
		var options = instances.map(function (sec) {
			var logFile = uci.get('tailcat', sec['.name'], 'log_file');
			if (!logFile) return null;
			return E('option', { value: logFile }, [sec['.name'] + ' — ' + logFile]);
		}).filter(Boolean);

		var select = E('select', { class: 'cbi-input-select', id: 'tailcat-log-select' },
			options.length ? options : [E('option', { value: '' }, [_('No log files configured')])]
		);

		var pre = E('pre', {
			id: 'tailcat-log-output',
			style: 'background:#f5f5f5;border:1px solid #ddd;padding:8px;max-height:60vh;overflow:auto;font-size:12px;line-height:1.4;white-space:pre-wrap;',
		}, [_('Select an instance log file above.')]);

		var self = {
			refresh: function () {
				var path = select.value;
				if (!path) {
					pre.firstChild.nodeValue = _('(no log file selected)');
					return;
				}
				fs.read(path, 65536).then(function (content) {
					if (!content) {
						pre.firstChild.nodeValue = _('(empty or not yet created)');
						return;
					}
					var lines = content.split('\n');
					if (lines.length > 500) {
						lines = ['… (' + (lines.length - 500) + _(' earlier lines truncated) …')].concat(lines.slice(-500));
					}
					pre.firstChild.nodeValue = lines.join('\n');
					pre.scrollTop = pre.scrollHeight;
				}).catch(function (err) {
					pre.firstChild.nodeValue = _('Error reading log: ') + (err.message || err);
				});
			},
		};

		var refreshBtn = E('button', {
			class: 'cbi-button cbi-button-neutral',
			onclick: function () { self.refresh(); },
		}, [_('Refresh')]);

		var clearBtn = E('button', {
			class: 'cbi-button cbi-button-negative',
			onclick: function () {
				pre.firstChild.nodeValue = '';
			},
		}, [_('Clear')]);

		var autoChk = E('input', {
			type: 'checkbox',
			id: 'tailcat-log-auto',
			checked: true,
		});
		var autoLabel = E('label', { for: 'tailcat-log-auto', style: 'margin-left:6px;' }, [_('Auto-refresh (3s)')]);

		select.onchange = function () { self.refresh(); };

		self.refresh();

		var timer = null;
		function startTimer() {
			if (timer) clearInterval(timer);
			if (autoChk.checked) {
				timer = setInterval(function () { self.refresh(); }, 3000);
			}
		}
		autoChk.onchange = startTimer;
		startTimer();

		return E('div', {}, [
			E('h2', {}, [_('Tailcat Logs')]),
			E('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;' }, [
				E('label', { for: 'tailcat-log-select' }, [_('Instance: ')]),
				select,
				refreshBtn,
				clearBtn,
				autoChk,
				autoLabel,
			]),
			pre,
			E('p', { style: 'color:#888;font-size:11px;' }, [
				_('Logs are written by each tailcat instance to the path set in its '),
				E('code', {}, ['log_file']),
				_(' option. The tailcat address for serve instances is printed as '),
				E('code', {}, ['# 🐈 Server listening with new address: tcXXXX…']),
				'.',
			]),
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	onUnload: function () {
		// Timer cleanup would go here if we tracked it outside render scope.
	}
});
