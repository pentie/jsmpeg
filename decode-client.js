argv = require('minimist')(process.argv.slice(2)),
http = require('http'),
net = require('net'),
WebSocket = require('ws'),
protobuf = require("protobufjs"),
crc32 = require('js-crc').crc32;

JSMpeg = {
	Player: null,
	MaxExpireTime: 1000 * 3600,
	MaxDelayTime: 5000,
	BitBuffer: null,
	Source: {}, 
	Demuxer: {}, 
	Decoder: {},
	Renderer: {},
	pbIntraReport: null,
	Fill: function(array, value) {
		if (array.fill) {
			array.fill(value);
			return;
		}

		for (var i = 0; i < array.length; i++) {
			array[i] = value;
		}
	}
};

require('./src/buffer.js');
require('./src/ts.js');
require('./src/decoder.js');
require('./src/mpeg1.js');
require('./src/websocket.js');

//----------------------------------------------------------
// mepg1 player for crc

var Crc_Player = function(url, options) {
	this.enable = false;
	this.options = options || {};

	if (!url.match(/^wss?:\/\//)) {
		console.log('error, url must be wss://');
		return;
	}

	this.options.decodeFirstFrame = true;
	this.options.streaming = true;
	this.loop = true;

	this.source = new JSMpeg.Source.WebSocket(url, this.options);
	this.demuxer = new JSMpeg.Demuxer.TS(this.options);
	this.video = new JSMpeg.Decoder.MPEG1Video(this.options);
	this.video.source = this.source;

	this.source.connect(this.demuxer);
	this.demuxer.connect(JSMpeg.Demuxer.TS.STREAM.VIDEO_1, this.video);

	this.source.start();
	this.play();
};

Crc_Player.prototype.play = function() {
	this.animationId = setImmediate(this.update.bind(this));
	this.wantsToPlay = true;
};

Crc_Player.prototype.update = function() {
	this.animationId = setImmediate(this.update.bind(this));
	if (!this.source.established) {return;}
	this.video.decode();
};


//----------------------------------------------------------
// main and entry

intra_frame_calback = function (y, cr, cb, decoder) {
	let source = decoder.source;

	var payload = {
		crc32Y: crc32(y),
		crc32Cr: crc32(cr),
		crc32Cb: crc32(cb),
		closeWhenDelay: 0
	};

	let report = JSMpeg.pbIntraReport;

	var err = report.verify(payload);
	if (err) throw Error(err);

	var msg = report.create(payload);
	var buff = report.encode(msg).finish();

	if (buff.length > 0) {
		source.send(buff);
	}
}


protobuf.load("feedback.proto", function(err, root) {
	if (err) throw err;

	JSMpeg.pbroot = root;
	JSMpeg.pbIntraReport= root.lookupType('FeedBack.IntraReport');
	JSMpeg.Player = Crc_Player;

	let urls = argv._;

	if (urls.length === 0) {
		require('./config.js');
		JSMpegConfig.relays.forEach(function(item){
			urls.push('ws://localhost:' + item[0]);
		});
	}

	console.log('connect urls: ',urls);

	for (var i in urls) {
		new JSMpeg.Player(urls[i]);
	}
});
