
var ffmpeg = require('fluent-ffmpeg');
var PassThroughStream = require('stream').PassThrough;
var net = require('net');

//-----------------------------------------------------------

const SOI = new Buffer([0xff, 0xd8]);
const EOI = new Buffer([0xff, 0xd9]);

MjpegParser = function (image_callback) {
	if (!Buffer.prototype['indexOf']) bufferTools.extend();
	this.image_callback = image_callback;
	this._buffer = null;
}

MjpegParser.prototype.checkpoint = function (chunk) 
{
	let image = null;
	let imgStart, imgEnd;
	while (chunk) {
		if (this._buffer) {
			if (-1 != (imgEnd = chunk.indexOf(EOI))) {
				imgEnd += EOI.length;
				image = Buffer.concat([this._buffer, chunk.slice(0, imgEnd)]);
				this.image_callback(image);
				this._buffer = null;
				chunk = chunk.slice(imgEnd);
			} else {
				this._buffer = Buffer.concat([this._buffer, chunk]);
				chunk = null;
			}
		} else {
			chunk = -1 != (imgStart = chunk.indexOf(SOI)) ? chunk.slice(imgStart) : null;
			if (chunk) this._buffer = new Buffer(0);
		}
	}
}

MjpegParser.prototype.flush = function () {
	this._buffer = null;
};

var image_checkpoint = function(image_callback){
	return new MjpegParser(image_callback);
};

//-----------------------------------------------------------

var check_src = function (src)
{
	if ((src === null) || (src === 'local')) {
		return '/dev/video0';
	}

	if (src.match(/\/dev\/video/)) {
		return src;
	} 

	if (src.match(/^http:\/\//)) {
		return src;
	}
	
	if (net.isIP(src)) {
		return 'http://'+src+':8083/?action=stream';
	}

	return '/dev/video0';
};


var mjpeg_chunk = function (callback, src=null) 
{
	src = check_src(src);
	let recv_stream = new PassThroughStream();

	// callback are:  function(data){}
	recv_stream.on('data', callback);

	recv_stream.on('error', function(err) {
		console.log('src passthrough error: ' + err.message);
	});

	let input_opts;
	if (src.match(/http:\/\//)) {
		input_opts = [];
	} else {
		input_opts = ['-f v4l2', '-input_format mjpeg'];
	}

	let command = ffmpeg()
		.input(src)
		.inputOptions(input_opts)
		.output(recv_stream)
		.outputOptions(['-f mjpeg', '-c:v copy'])

		.on('error', function(err) {
			console.log('ffmpeg_src: error occurred: ' + err.message);
		})
		.on('end', function() {
			console.log('ffmpeg_src: Processing finished !');
		})
		.run();
};

var mjpeg_image = function (callback, src=null) 
{
	let extractor = image_checkpoint(callback);

	mjpeg_chunk(function(chunk) {
		extractor.checkpoint(chunk);
	}, src);
};

var mpeg1video_chunk = function (callback, qscale=8)
{
	let output_stream = new PassThroughStream();

	// callback are:  function(chunk){}
	output_stream.on('data', callback);

	output_stream.on('error', function(err) {
		console.log('passthrough error occurred: ' + err.message);
	});

	let input_stream = new PassThroughStream();
	input_stream.on('error', function(err) {
		console.log('passthrough error occurred: ' + err.message);
	});

	let command = ffmpeg()
		.input(input_stream)
		//.inputOptions(['-c:v mjpeg_cuvid'])
		.output(output_stream)
		.outputOptions(['-f mpegts', '-c:v mpeg1video', '-q:v '+qscale, '-bf 0'])
		.on('error', function(err) {
			console.log('mpeg1video_chunk: error occurred: ' + err.message);
		})
		.on('end', function() {
			console.log('mpeg1video_chunk: Processing finished !');
		})
		.run();
	
	return function(chunk) {
		input_stream.write(chunk);	
	};
};

module.exports = {
	mjpeg_chunk: mjpeg_chunk,
	mjpeg_image: mjpeg_image,
	mpeg1video_chunk: mpeg1video_chunk
};
