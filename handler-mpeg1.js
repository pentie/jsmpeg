
const {Mpeg1tsFromJpegs} = require('./common-modules.js');

const DEFAULT_QSCALE = 8;
const MAX_EXPIRE_TIME = 3600;
const MAX_DELAY_TIME = 5000;

module.exports = class Mpeg1VideoHandler 
{
	constructor(env) 
	{
		this.handlerName = 'mpeg1';
		this.chunkHead = 0x47;	
		this.eachClient = env.get('eachClient');
		this.isCenter = env.get('isCenter');
		this.config = env.get('getConfig')();
		this.nodeId = env.get('nodeId');
		this.cache = env.get('newCache')();

		if (this.isCenter) {
			this.chunker = new Mpeg1tsFromJpegs( null, this.downstream.bind(this), DEFAULT_QSCALE );
			this.chunker.start();
		}
	}

	infos () 
	{
		let counter = 0;
		this.eachClient(function(client) {
			if (client.feedActive) {
				counter++;
			}
		});

		return {
			mpeg1ClientCount: counter,
			mpeg1ActiveCount: this.cache.keys().length
		};
	}

	onUpConnect (socket) 
	{
		socket.send(JSON.stringify({
			userId: this.nodeId,
			handler: this.handlerName,
			cmd: 'active',
			param: true
		}));
	}

	onUpResponse (chunk, socket) 
	{
		this.downstream(chunk);
	}

	feed (chunk) 
	{
		this.chunker.write(chunk);
	}

	downstream (chunk) 
	{
		this.eachClient(function(client) {
			client.feedActive && client.send(chunk);
		});
	}

	onDownConnect (socket) 
	{
		socket.feedActive = false;
	}

	onDownRequest (socket, req) 
	{
		//console.log(req);

		let userId = req.userId;
		 
		 switch (req.cmd) {
		 	case 'active':
				socket.feedActive = !!(req.param === true);
				break;

			case 'intra':
				this.cache.set(userId, Date.now(), 3);

				let key = req.intra_crc32;
				let intra_interval = req.intra_interval;
				let spec_timeout = req.close_when_delay;
				let new_req = [key, Date.now(), spec_timeout, intra_interval, socket];
				
				//console.log(userId, key, intra_interval);
				break;

			default:
				console.log('cmd not handled: ', req);
		 }
	}
};


/*************************/
/*

var async = require("async");
var redis = require("redis");
var client = redis.createClient();
var crc32 = require('js-crc').crc32;


function _check_crc_routine ()
{
	this.__check_from_redis(()=>{
		setTimeout(this._check_crc_routine.bind(this), 1000);
	});
}

function __check_from_redis (cb_done)
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
}

*/

