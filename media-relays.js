
const argv = require('minimist')(process.argv.slice(2));
const mjpeg_image = require('./ffmpeg-utils.js').mjpeg_image;
const WebSocketHub = require('./wsocket-hub.js'); 
const MJpegHandler = require('./handler-mjpeg.js');
const Mpeg1VideoHandler = require('./handler-mpeg1.js');
const ManagerHandler = require('./handler-manager.js');
const LoggerHandler = require('./handler-logger.js');

var wshub = new WebSocketHub(8081);
wshub.addHandler(Mpeg1VideoHandler);
wshub.addHandler(MJpegHandler);
wshub.addHandler(ManagerHandler);
wshub.addHandler(LoggerHandler);
wshub.run('ws://localhost:8080');
