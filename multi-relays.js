const 	fs = require('fs'),
	http = require('http'),
	WebSocket = require('ws'),
	PassThroughStream = require('stream').PassThrough,
	ffmpeg = require('fluent-ffmpeg');

const 	WEB_PORT = '8080',
	RECORD_STREAM = false;

var hub_8181 = ws_hub(8181, '640x480', 8);
var hub_8182 = ws_hub(8182, '800x600', 12);
var hub_8183 = ws_hub(8183, '1024x768', 20);
var hub_8184 = ws_hub(8184, '1280x1024', 20);

ffmpeg_src('http://localhost:8083/?action=stream', function(data){
	hub_8181.write(data);
	hub_8182.write(data);
	hub_8183.write(data);
	hub_8184.write(data);
});

function ffmpeg_src(input, callback)
{
	let output_stream = new PassThroughStream();
	let command = ffmpeg()
		.input(input)
		.output(output_stream)
		.outputOptions(['-f mjpeg', '-c:v copy'])

		.on('error', function(err) {
			console.log('src An error occurred: ' + err.message);
		})
		.on('end', function() {
			console.log('src Processing finished !');
		})
		.run();

	output_stream.on('data', function(data) {
		callback(data);
	})
	.on('error', function(err) {
		console.log('src passthrough error occurred: ' + err.message);
	});
}

function ws_hub(port, size, qscale) 
{
	let socketServer = new WebSocket.Server({port: port, perMessageDeflate: false});
	socketServer.connectionCount = 0;
	socketServer.on('connection', function(socket, upgradeReq) {
		socketServer.connectionCount++;
		console.log(
			'New WebSocket Connection: ', 
			(upgradeReq || socket.upgradeReq).socket.remoteAddress,
			(upgradeReq || socket.upgradeReq).headers['user-agent'],
			'('+socketServer.connectionCount+' total)'
		);
		socket.on('close', function(code, message){
			socketServer.connectionCount--;
			console.log(
				'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
			);
		});
	});
	socketServer.broadcast = function(data) {
		socketServer.clients.forEach(function each(client) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		});
	};

	let output_stream = new PassThroughStream();
	output_stream.on('data', function(data) {
		socketServer.broadcast(data);
	})
	.on('error', function(err) {
		console.log('passthrough error occurred: ' + err.message);
	});

	let input_stream = new PassThroughStream();

	let command = ffmpeg()
		.input(input_stream)
		.output(output_stream)
		.outputOptions(['-f mpegts', '-c:v mpeg1video', '-q:v '+qscale, '-bf 0', '-s '+size])

		.on('error', function(err) {
			console.log('An error occurred: ' + err.message);
		})
		.on('end', function() {
			console.log('Processing finished !');
		})
		.run();

	input_stream.socketServer = socketServer;
	input_stream.output_stream = output_stream;
	return input_stream;
}
