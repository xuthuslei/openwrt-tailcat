'use strict';
//
// LuCI controller for luci-app-tailcat.
//
// Registers the "Tailcat" entry under the Services menu and exposes
// three pages:
//   admin/services/tailcat          Overview / status
//   admin/services/tailcat/services Local services (serve instances)
//   admin/services/tailcat/forwards Remote forwards (forward instances)
//   admin/services/tailcat/log      Live log viewer
//
// Following the luci-app-openvpn / luci-app-wireguard pattern, the
// page bodies are implemented as client-side view modules under
// view/tailcat/*.js and wired up here.
//

return L.Class.extend({
	// Declare dependencies so rpcd has loaded the required ubus modules.
	dependencies: ['fs', 'ubus', 'uci'],

	routes: function () {
		return [
			// Overview / status
			L.serverroute('admin/services/tailcat', {
				get: function (req) {
					return L.View('tailcat/overview', { noheader: true });
				},
			}),
			// Local services (serve)
			L.serverroute('admin/services/tailcat/services', {
				get: function (req) {
					return L.View('tailcat/services', { noheader: true });
				},
			}),
			// Remote forwards
			L.serverroute('admin/services/tailcat/forwards', {
				get: function (req) {
					return L.View('tailcat/forwards', { noheader: true });
				},
			}),
			// Log viewer
			L.serverroute('admin/services/tailcat/log', {
				get: function (req) {
					return L.View('tailcat/log', { noheader: true });
				},
			}),
		];
	},

	// The menu entry is defined declaratively in a JSON file under
	// /usr/share/luci/menu.d/luci-app-tailcat.json (see that file).
});
