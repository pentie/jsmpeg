
var ffmpeg = require('fluent-ffmpeg');
var PassThroughStream = require('stream').PassThrough;
var net = require('net');
var image_checkpoint = require('./mjpeg-parser.js');

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
