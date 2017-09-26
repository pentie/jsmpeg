
var argv = require('minimist')(process.argv.slice(2));
var httpServer = require('http-server');
var image_server = require('./image-wsocket.js');
var mpeg1_server = require('./mpeg1-wsocket.js');
var mjpeg_image = require('./ffmpeg-utils.js').mjpeg_image;


let image_bcast = image_server(54018);
let mpeg1_bcast = mpeg1_server(8181);

mjpeg_image(function(image){
	image_bcast.feed(image);
	mpeg1_bcast.feed(image);
});

httpServer.createServer().listen(8080);
