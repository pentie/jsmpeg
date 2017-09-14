const 	
	argv = require('minimist')(process.argv.slice(2)),
	async = require("async"),
	redis = require("redis"),
	client = redis.createClient(),
	http = require('http'),
	net = require('net'),
	WebSocket = require('ws'),
	protobuf = require("protobufjs"),
	crc32 = require('js-crc').crc32,
	httpServer = require('http-server'),
	PassThroughStream = require('stream').PassThrough,
	ffmpeg = require('fluent-ffmpeg');

require('./config.js');

var all_hubs = [];
var pb_report = null;
var que_reports = new Array();

JSMpegConfig.relays.forEach(function(item){
	all_hubs.push(ws_hub(item[0], item[1], item[2]));
});

protobuf.load("feedback.proto", function(err, root) {
	if (err) throw err;

	pb_report = root.lookupType('FeedBack.IntraReport');

	ffmpeg_src(input_src(), function(data){
		all_hubs.forEach(function(hub){
			hub.write(data);
		});
	});
});

httpServer.createServer().listen(8080);
check_crc_routine();


//----------------------------------------------------
// server routine

client_cmd_handler =  function(data, socket) 
{
	let report = null;
	try {
		let msg= pb_report.decode(data);
		report = pb_report.toObject(msg);
	} catch (e){
		console.log('decode message error');
		console.log('error: ' + typeof data);
	}

	let key = report.crc32Cb;
	let spec_timeout = report.closeWhenDelay;

	let new_req = [key, Date.now(), spec_timeout, socket];
	que_reports.push(new_req);
}


function check_crc_routine()
{
	check_from_redis(()=>{
		setTimeout(check_crc_routine, 1000);
	});
}

function check_from_redis(cb_done)
{
	if (que_reports.length === 0) {
		cb_done();
		return;
	}

	let key_map = new Map();

	async.waterfall([ (next_step) => {
		let keys = new Array();

		for (var index in que_reports) {
			let req = que_reports[index];
			let key = req[0];
			if (keys.indexOf(key) == -1) {
				keys.push(key);
			}
		}

		let null_res = new Array();
		client.mget(keys, (err, res) => {
			//console.log('mget', keys, res);

			if (err) {
				next_step('error', 'first mget error');
				return;
			}

			for (var i=0; i<keys.length; i++) {
				let res_key = keys[i]
				let res_val = res[i];

				if (res_val === null) {
					null_res.push(res_key);
				} else {
					key_map.set(res_key, parseInt(res_val));
				}

			}
			next_step(null, null_res);
		});


	  },(null_res, next_step) => {
		let sets = new Array();
	  	for (var index in null_res) {
			let key = null_res[index]; 
			let timeval = Date.now(); 

			for (var index in que_reports) {
				let req = que_reports[index];
				let [reqkey, hit_time, spec_timeout, socket] = req;
				if (key === reqkey) {
					timeval = hit_time;
					break;
				}
			}

			sets.push(key);
			sets.push(timeval);
		}

	  	client.msetnx(sets, (err, res)=>{
			if (err) {
				next_step('error', 'msetnx error');
				return;
			}

			//console.log('msetnx', sets, res);

			if (res) {
				for (var i=0; i<null_res.length; i++) {
					let key = sets[i*2];
					let val = sets[i*2+1];
					key_map.set(key, val);
				}
				next_step('done', key_map);
			} else {
				next_step(null, null_res);
			}
		
		});

	  },(re_mgets, next_step) => {
		client.mget(re_mgets, (err, res) => {

			//console.log('mget2', re_mgets, res);

			if (err) {
				next_step('error', 'second mget error');
				return;
			}

			for (var i=0; i<re_mgets.length; i++) {
				let res_key = re_mgets[i]
				let res_val = parseInt(res[i]);
				key_map.set(res_key, res_val);
			}
			next_step('done', key_map);
		});

	  }],(err, ok_map) => {
	 	if (err !== 'done') {
			console.log('redis request error');
			cb_done();
			return;
		}

		//console.log('okmap', ok_map);

		for (var index in que_reports) {
			let req = que_reports[index];
			let [key, hit_time, spec_timeout, socket] = req;
			let start_time = ok_map.get(key);

			let offset = hit_time - start_time;

			if (offset > JSMpegConfig.MaxDelayTime) {
				//socket.close();
				socket.terminate();
				console.log('key ' + key + ' exceed ' + offset+ ', ws close <----------------');
			} else {
				//console.log('valid key: ' + key + ', offset ' + offset);
			}
		}

		que_reports.length = 0;
		cb_done();
	});
}


/*-----------------------------------------------------------------*/
// ffmpeg 

function input_src()
{
	if (process.argv.length > 2) {
		let src = process.argv[2];

		if (src == 'local') {
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
	}

	return '/dev/video0';
}

function ffmpeg_src(input, callback)
{
	let recv_stream = new PassThroughStream();
	recv_stream.on('data', function(data) {
		callback(data);
	})
	.on('error', function(err) {
		console.log('src passthrough error occurred: ' + err.message);
	});

	let input_opts;
	if (input.match(/http:\/\//)) {
		input_opts = [];
	} else {
		input_opts = ['-f v4l2', '-input_format mjpeg'];
	}

	let command = ffmpeg()
		.input(input)
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

}

function ws_hub(port, size, qscale) 
{
	qscale || (qscale = 0);
	let socketServer = new WebSocket.Server({port: port, perMessageDeflate: false, binaryType: 'arraybuffer'});
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
		socket.on('message', function(data){
			client_cmd_handler(data, socket);
		});
		socket.on('error', function(err){
			console.log('ws_hub err: '+err);	
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
	input_stream.on('error', function(err) {
		console.log('passthrough error occurred: ' + err.message);
	});

	let command = ffmpeg()
		.input(input_stream)
		//.inputOptions(['-c:v mjpeg_cuvid'])
		.output(output_stream)
		.outputOptions(['-f mpegts', '-c:v mpeg1video', '-q:v '+qscale, '-bf 0', '-s '+size])

		.on('error', function(err) {
			console.log('ws_hub: error occurred: ' + err.message);
		})
		.on('end', function() {
			console.log('ws_hub: Processing finished !');
		})
		.run();

	input_stream.socketServer = socketServer;
	input_stream.output_stream = output_stream;
	return input_stream;
}
