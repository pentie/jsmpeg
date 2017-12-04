
const WebSocketHub = require('./container-wsocket.js'); 

var wshub = new WebSocketHub( require('config') );
wshub.addSourcer( require('./source-webCamera.js') );
wshub.addSourcer( require('./source-usbCamera.js') );
wshub.addSourcer( require('./source-localMp4.js') );
wshub.addHandler( require('./handler-mpeg1.js') );
wshub.addHandler( require('./handler-mjpeg.js') );
wshub.addHandler( require('./handler-manager.js') );
wshub.addHandler( require('./handler-logger.js') );
wshub.run();
