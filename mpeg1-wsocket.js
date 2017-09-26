var async = require("async");
var redis = require("redis");
var client = redis.createClient();
var crc32 = require('js-crc').crc32;
var WebSocket = require('ws');
var mpeg1video_chunk = require('./ffmpeg-utils.js').mpeg1video_chunk;

const DEFAULT_QSCALE = 8;
const MAX_EXPIRE_TIME = 3600;
const MAX_DELAY_TIME = 5000;
const CHANNELS = [1, 2, 4];

Mpeg1VideoWebsocket = function (port) 
{
	this.que_reports = [];

	this.socketServer=new WebSocket.Server({port: port, perMessageDeflate:false, binaryType:'arraybuffer'});
	this.socketServer.connectionCount = 0;

	this.socketServer.on('connection', (function(socket, upgradeReq) {
		this.socketServer.connectionCount++;
		//socket.client_id = ;
		console.log(
			'New mpeg1video Connection: ', 
			(upgradeReq || socket.upgradeReq).socket.remoteAddress,
			(upgradeReq || socket.upgradeReq).headers['user-agent'],
			'('+this.socketServer.connectionCount+' total)'
		);

		socket.on('close', (function(code, message){
			this.socketServer.connectionCount--;
			console.log(
				'Disconnected mpeg1video('+this.socketServer.connectionCount+' total)'
			);
		}).bind(this));

		socket.on('message', (function(dataStr){
			let req = null;
			try {
				req = JSON.parse(dataStr);
			} catch (e) {
			}

			if (req) {
				this.__onCmdRequest(socket, req);
			}
		}).bind(this));

		socket.on('error', function(err){
			console.log('mpeg1video err: '+err);	
		});
	}).bind(this));

	this.chunker = mpeg1video_chunk(this.__broadcast.bind(this), DEFAULT_QSCALE);
	this.__check_crc_routine();
};

Mpeg1VideoWebsocket.prototype.feed = function(images_chunk) {
	this.chunker(images_chunk);
};

Mpeg1VideoWebsocket.prototype.__onCmdRequest= function(socket, req) 
{
	let user_id = req.user_id;
	let key = req.intra_crc32;
	let intra_interval = req.intra_interval;
	let spec_timeout = req.close_when_delay;
	
	console.log(user_id, key, intra_interval);

	let new_req = [key, Date.now(), spec_timeout, intra_interval, socket];
	this.que_reports.push(new_req);
};

Mpeg1VideoWebsocket.prototype.__broadcast = function(chunk) {
	this.socketServer.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(chunk);
		}
	});
};

Mpeg1VideoWebsocket.prototype.__check_crc_routine = function ()
{
	this.__check_from_redis(()=>{
		setTimeout(this.__check_crc_routine.bind(this), 1000);
	});
};

Mpeg1VideoWebsocket.prototype.__check_from_redis = function (cb_done)
{
	if (this.que_reports.length === 0) {
		cb_done();
		return;
	}

	let key_map = new Map();

	async.waterfall([ (next_step) => {
		let keys = [];

		for (var index in this.que_reports) {
			let req = this.que_reports[index];
			let key = req[0];
			if (keys.indexOf(key) == -1) {
				keys.push(key);
			}
		}

		let null_res = [];
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
		let sets = [];
	  	for (var index in null_res) {
			let key = null_res[index]; 
			let timeval = Date.now(); 

			for (var index in this.que_reports) {
				let req = this.que_reports[index];
				let [reqkey, hit_time, spec_timeout, intra_interval, socket] = req;
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

		let batch = client.batch();
		for (var key in ok_map.keys()) {
			batch.expire(key, MAX_EXPIRE_TIME);
		}
		batch.exec();


		for (var index in this.que_reports) {
			let req = this.que_reports[index];
			let [key, hit_time, spec_timeout, intra_interval, socket] = req;
			let start_time = ok_map.get(key);
			let offset = hit_time - start_time;

			if (offset > MAX_DELAY_TIME) {
				//fixme
				//socket.close();
				socket.terminate();
				console.log('key ' + key + ' exceed ' + offset+ ', ws close <----------------');
			} else {
				//console.log('valid key: ' + key + ', offset ' + offset);
			}
		}

		this.que_reports.length = 0;
		cb_done();
	});
};


module.exports = function(port){
	return new Mpeg1VideoWebsocket(port);
};
