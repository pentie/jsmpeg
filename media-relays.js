
const argv = require('minimist')(process.argv.slice(2));
const mjpeg_image = require('./ffmpeg-utils.js').mjpeg_image;
const WebSocketHub = require('./wsocket-hub.js'); 
const MJpegHandler = require('./handler-mjpeg.js');
const Mpeg1VideoHandler = require('./handler-mpeg1.js');
const ManagerHandler = require('./handler-manager.js');
const LoggerHandler = require('./handler-logger.js');
const configs = require('./config-relays.js');
const fork = require('child_process').fork;


if (argv.index === undefined) {
	for (var index in configs) {
		let subRelay = fork(process.argv[1], ['--index', index], {silent: true});
		subRelay.index = index;
		subRelay.stdout.on('data', function(data) {
			console.log('stdout('+subRelay.index+'): ', data.toString().trim());
		});
	}
} else {
	let index = parseInt(argv.index);
	let wshub = new WebSocketHub(configs[index]);
	wshub.addHandler(Mpeg1VideoHandler);
	wshub.addHandler(MJpegHandler);
	wshub.addHandler(ManagerHandler);
	wshub.addHandler(LoggerHandler);
	wshub.run();
}




