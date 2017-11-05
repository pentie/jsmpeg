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

require('./src/websocket.js');
require('./src/buffer.js');
require('./src/ts.js');
require('./src/decoder.js');
require('./src/mpeg1.js');

//----------------------------------------------------------
// mepg1 player for crc

var Crc_Player = function(url, options) {
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

var intra_time = 0;
var conn_id = 0;

intra_frame_calback = function (y, cr, cb, source) 
{
	let current_connid = source.conn_id;
	let current_time = Date.now();
	let interval_time = current_time - intra_time;
	intra_time = current_time;

	if (conn_id !== current_connid) {
		conn_id = current_connid; 
		return;
	}

	if (typeof decoder.rand_id === 'undefined') {
		decoder.rand_id = 'xxyxxyxxyxxyxxyx'.replace(/[xy]/g, function(c) {
			var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
			return v.toString(16);
		});
	}

	var payload = {
		userId: decoder.rand_id,
		intraCrc32: crc32(cb),
		intraInterval: interval_time,
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

JSMpeg.Player = Crc_Player;

new JSMpeg.Player('ws://localhost:8081');
