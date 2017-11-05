
const argv = require('minimist')(process.argv.slice(2));
const WebSocketHub = require('./wsocket-hub.js'); 

if (argv.index === undefined) {
	WebSocketHub.relaysSupervisor( require('config') );
	return;
}

var wshub = new WebSocketHub( require('config') );
wshub.addHandler( require('./handler-mpeg1.js') );
wshub.addHandler( require('./handler-mjpeg.js') );
wshub.addHandler( require('./handler-manager.js') );
wshub.addHandler( require('./handler-logger.js') );
wshub.run(argv.index);
