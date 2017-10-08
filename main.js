
const argv = require('minimist')(process.argv.slice(2));
const mjpeg_image = require('./ffmpeg-utils.js').mjpeg_image;
const WebSocketServer = require('./wsocket-hub.js'); 
const MJpegHandler = require('./handler-mjpeg.js');
const Mpeg1VideoHandler = require('./handler-mpeg1.js');
const LoggerHandler = require('./handler-logger.js');
const httpServer = require('http-server');


var wshub = new WebSocketServer(8081);
wshub.addHandler(Mpeg1VideoHandler);
wshub.addHandler(MJpegHandler);
wshub.addHandler(LoggerHandler);

mjpeg_image( (image) => {
	wshub.feed(image);
});

httpServer.createServer().listen(8080);
