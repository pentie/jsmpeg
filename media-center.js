
const mjpeg_image = require('./ffmpeg-utils.js').mjpeg_image;
const WebSocketHub = require('./wsocket-hub.js'); 
const MJpegHandler = require('./handler-mjpeg.js');
const Mpeg1VideoHandler = require('./handler-mpeg1.js');
const ManagerHandler = require('./handler-manager.js');
const LoggerHandler = require('./handler-logger.js');
const config = require('./config-center.js');

var wshub = new WebSocketHub(config);
wshub.addHandler(Mpeg1VideoHandler);
wshub.addHandler(MJpegHandler);
wshub.addHandler(ManagerHandler);
wshub.addHandler(LoggerHandler);
wshub.run();

mjpeg_image( (image) => {
	wshub.feed(image);
});
