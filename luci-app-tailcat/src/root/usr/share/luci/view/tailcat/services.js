'use strict';'require view';'require form';'require fs';'require uci';

return view.extend({
 load: function () {
  // The init script sets TAILCAT_ADDR_FILE=/var/run/tailcat/<section>.addr
  // for each serve instance; tailcat writes its own address there.
  // Read each file into a section_id -> addr map.
  var addrMap = {};
  return uci.load('tailcat').then(function () {
   var sections = uci.sections('tailcat', 'instance');
   var promises = [];
   for (var i = 0; i < sections.length; i++) {
    var sid = sections[i]['.name'];
    var role = uci.get('tailcat', sid, 'role');
    if (role && role !== 'serve') continue;
    var addrFile = '/var/run/tailcat/' + sid + '.addr';
    promises.push(fs.read(addrFile).then(function (out) {
     out = (out || '').trim();
     if (out) addrMap[sid] = out;
    }).catch(function () {}));
   }
   return Promise.all(promises);
  }).then(function () {
   return addrMap;
  });
 },

 render: function (addrMap) {
  var m, s, o;

		m = new form.Map('tailcat',
			_('Local Services (serve)'),
			'A <em>serve</em> 实例在本路由器上暴露端口 / SSH / 文件接收箱，供远端 tailcat 客户端连接。');

		s = m.section(form.GridSection, 'instance', _('Serve Instances'));
		s.addremove = true;
		s.addbtntitle = _('Add serve instance');
		s.sortable = true;
		s.anonymous = true;
		s.maxcols = 6;
		s.nodescriptions = true;
		s.filter = function (section_id) {
		 var r = uci.get('tailcat', section_id, 'role');
		 return (!r || r === 'serve');
		};
		s.addModalOptions = function (modal, section_id) {
		 uci.set('tailcat', section_id, 'role', 'serve');
		};

		// grid columns (modalonly=false, read-only display)
		o = s.option(form.DummyValue, '_name_disp', _('Name'));
		o.textvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_kind_disp', _('Kind'));
		o.textvalue = function (section_id) {
		 var kind = uci.get('tailcat', section_id, 'serve_kind') || 'ports';
		 if (kind === 'ports') return _('Expose local ports');
		 if (kind === 'ssh') return _('Auth-free SSH server');
		 if (kind === 'recv') return _('File drop box (recv)');
		 return kind;
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_detail_disp', _('Detail'));
		o.textvalue = function (section_id) {
		 var kind = uci.get('tailcat', section_id, 'serve_kind') || 'ports';
		 if (kind === 'ports') {
		  return uci.get('tailcat', section_id, 'serve_ports') || '—';
		 }
		 if (kind === 'recv') {
		  return uci.get('tailcat', section_id, 'recv_dir') || '—';
		 }
		 if (kind === 'ssh') {
		  return '—';
		 }
		 return '—';
		};
		o.modalonly = false;

		o = s.option(form.DummyValue, '_addr_disp', _('Tailcat address'));
		o.textvalue = function (section_id) {
		 return addrMap[section_id] || '—';
		};
		o.modalonly = false;

		// Enabled as a real checkbox in the grid (like overview),
		// directly toggleable from the table.
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.editable = true;
		o.modalonly = false;

		// modal fields (modalonly=true, editable in Add/Edit dialog)
		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'my_web';
		o.rmempty = false;
		o.modalonly = true;
		o.cfgvalue = function (section_id) {
		 return uci.get('tailcat', section_id, 'name') || section_id;
		};

		o = s.option(form.ListValue, 'serve_kind', _('Kind'));
		o.value('ports', _('Expose local ports'));
		o.value('ssh', _('Auth-free SSH server'));
		o.value('recv', _('File drop box (recv)'));
		o.default = 'ports';
		o.editable = true;
		o.modalonly = true;
		o.onchange = function (ev, kind) {
		 var root = ev.target.closest('.cbi-section');
		 if (!root) return;
		 root.classList.toggle('tailcat-kind-ports', kind === 'ports');
		 root.classList.toggle('tailcat-kind-recv', kind === 'recv');
		};

		o = s.option(form.Value, 'serve_ports', _('Ports (comma list or "all")'));
		o.datatype = 'string';
		o.placeholder = '8080,8443';
		o.depends('serve_kind', 'ports');
		o.modalonly = true;

		o = s.option(form.Value, 'recv_dir', _('Receive directory'));
		o.datatype = 'directory';
		o.placeholder = '/root/tailcat-inbox';
		o.depends('serve_kind', 'recv');
		o.modalonly = true;

		o = s.option(form.Flag, 'verbose', _('Verbose logs'));
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'log_file', _('Log file'));
		o.datatype = 'filepath';
		o.placeholder = '/var/log/tailcat/my_web.log';
		o.modalonly = true;

		return m.render();
	},

	// LuCI 25.x has no form.Map onApply hook: the base view's
	// handleSaveApply persists UCI and applies the changes. We hook
	// it so tailcat restarts AFTER the apply completes — chaining the
	// restart into handleSave would block ui.changes.apply and leave
	// the "unsaved changes" notice stuck.
	handleSaveApply: function (ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function () {
			return fs.exec('/etc/init.d/tailcat', ['restart']);
		});
	}
});
