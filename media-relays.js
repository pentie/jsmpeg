let log4js = require('log4js');
log4js.configure({
  appenders: { out: { type: 'stdout' } },
  categories: { default: { appenders: [ 'out' ], level: 'debug' } }
});
const logger = log4js.getLogger('con');
console.log = logger.info.bind(logger);
console.debug = logger.debug.bind(logger);

const argv = require('minimist')(process.argv.slice(2));
const WebSocketHub = require('./container-wsocket.js'); 

let allConfigs = require('config');

if (argv.index === undefined) {
	let configs = allConfigs.get('relaysNodes');
	let [ index, activeCount ] = WebSocketHub.getFirstActive( configs );
	if (activeCount === 0) {
		console.log( 'The configs has no active item' );
		return;
	}

	if (activeCount > 1) {
		WebSocketHub.relaysSupervisor( allConfigs );
		return;
	}

	argv.index = index;
}

var wshub = new WebSocketHub( allConfigs );
wshub.addHandler( require('./handler-mpeg1.js') );
wshub.addHandler( require('./handler-mjpeg.js') );
wshub.addHandler( require('./handler-manager.js') );
wshub.runRelays( argv.index );
