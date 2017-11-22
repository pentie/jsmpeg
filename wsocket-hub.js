
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const machineIdSync = require('node-machine-id').machineIdSync;
const crypto = require('crypto');
const NodeCache = require('node-cache');
const os = require('os');
const fork = require('child_process').fork;

const UPSTREAM_RECONNECT_INTERVAL = 300;

module.exports = class WebSocketHub 
{
	constructor(configs) 
	{
		this.configs = configs;
		this.handlers = new Array();
		this.handlerClass = new Array();
		this.sources = new Array();
		this.sourcerClass = new Array();
		this.routeCmds = {};

		this.env = new Map(); 
		this.env.set('feed', this.feed.bind(this));
		this.env.set('configs', this.configs);
		this.env.set('getConfig', this.getConfig.bind(this));
		this.env.set('eachClient', this.eachClient.bind(this));
		this.env.set('nodeId', this.getNodeId());
		this.env.set('newCache', this.newCache.bind(this));
		this.env.set('handlerInfos', this.handlerInfos.bind(this));
		this.env.set('sourcerInfos', this.sourcerInfos.bind(this));
		this.env.set('activeSource', this.activeSource.bind(this));
		this.env.set('getNodeUrls', this.getLocalUrls.bind(this));
	}

	httpHandler( req, res, next)
	{
		let reqCmd = req.url.split('/',2).filter(e=>e.trim() != '');
		if (reqCmd.length === 0) return next();

		let respFunc = this.routeCmds[reqCmd[0]];
		if (!respFunc) return next();

		respFunc( req, res, next);
	}


	startServer(port)
	{
		let app = express();
		app.use(express.static('public'));
		app.use(cookieParser());
		app.use(bodyParser.json());
		app.use(this.httpHandler.bind(this));
		app.use(function (req, res) {
			res.json({ status: 'error', error: "handler not found" });
		});

		this.webServer = http.createServer(app);
		this.socketServer = new WebSocket.Server({ server: this.webServer });

		this.socketServer.connectionCount = 0;

		this.socketServer.on('connection', (function(socket, upgradeReq) {
			this.socketServer.connectionCount++;
			console.log('New ImageFeed Connection: ' + this.socketServer.connectionCount+' total)');

			socket.on('close', (function(code, message){
				this.socketServer.connectionCount--;
				console.log('Disconnected ImageFeed('+this.socketServer.connectionCount+' total)');
			}).bind(this));

			socket.on('message', (function(dataStr){
				let req = null;
				try {
					req = JSON.parse(dataStr);
				} catch (e) {
				}

				req && this.onDownRequest(socket, req);
			}).bind(this));

			socket.on('error', function(err){
				console.log('image feed err: '+err);	
			});

			this.handlers.forEach(function(handler) {
				if (typeof handler.onDownConnect === "function") { 
					handler.onDownConnect(socket);
				}
			});

		}).bind(this));

		this.webServer.listen(port, function listening() {
			console.log('Listening on %d', port);
		}.bind(this));

		this.env.set('server', this.socketServer);
	}

	static relaysSupervisor (allConfigs) 
	{
		let configs = allConfigs.get('relaysNodes');

		for (var index in configs) {
			let config = configs[index];
			if (config.active !== true) {
				continue;
			}
			let subRelay = fork(process.argv[1], ['--index', index], {silent: true});
			subRelay.index = index;
			subRelay.stdout.on('data', function(data) {
				console.log('stdout('+subRelay.index+'): ', data.toString().trim());
			});
		}
	}

	activeSource( cmdObj, callback )
	{
		let targetSource = cmdObj.sourceName;
		this.sources.forEach(function(source) {
			source.stop();
			if (source.sourceName === targetSource) {
				setImmediate( function(){
					source.start( cmdObj, callback );
				});
			}
		});
	}

	loadSourcers ()
	{
		this.sourcerClass.forEach(function (Sourcer) {
			let source = new Sourcer(this.env);
			this.sources.push(source);
			if (typeof source.http === 'function') { 
				this.routeCmds[source.sourceName] = source.http.bind(source);
			}
		}.bind(this));
	}

	loadHandlers ()
	{
		this.handlerClass.forEach(function (Handler) {
			let handler = new Handler(this.env);
			this.handlers.push(handler);
			if (typeof handler.http === 'function') { 
				this.routeCmds[handler.handlerName] = handler.http.bind(handler);
			}
		}.bind(this));
	}

	sourcerInfos()
	{
		let results = [];
		this.sources.forEach(function(sourcer) {
			if (typeof sourcer.list === "function") { 
				results.push( sourcer.list() );
			}
		});
		return results;
	}

	handlerInfos() 
	{
		let results = {
			nodeId: this.env.get('nodeId'),
			timestamp: Date.now(),
			config: this.config,
			nodeUrls: this.getLocalUrls(this.config.port),
			upstreamUrl: this.env.get('upstreamUrl'),
			wsClientCount: this.socketServer.connectionCount
		};

		this.handlers.forEach(function(handler) {
			if (typeof handler.infos === "function") { 
				let modRes = handler.infos();
				for (var key in modRes) {
					results[key] = modRes[key];
				}
			}
		});

		return results;
	}

	getLocalUrls(port) 
	{
		var ifs = os.networkInterfaces();
		let deleteKeys = [];
		for (var key in ifs) {
			if (key === 'lo') { 
				deleteKeys.push(key);
				continue;
			}

			if (/^tun/.test(key)) {
				deleteKeys.push(key);
			}
		}
		deleteKeys.forEach(function each(key){
			delete ifs[key];
		});


		var address = new Array();
		for (var key in ifs) {
			let item = ifs[key];
			item.forEach(function each(obj) {
       				if (obj.family === 'IPv4') {
					let url = 'ws://' + obj.address + ':' + port;
					address.push(url);
				}
			});
		}
		return address;
	}

	newCache (options)
	{
		options = options || {checkperiod: 500};

		if (typeof this.caches === 'undefined') {
			this.caches = [];
		}

		let cache = new NodeCache(options);
		this.caches.push(cache);
		return cache;
	}

	getNodeId () 
	{
		if (typeof this.nodeId === 'undefined') {
			let data = machineIdSync() + this.port;
			this.nodeId = crypto.createHash('md5').update(data).digest("hex");
		}
		return this.nodeId;
	}

	feed( jpeg ) 
	{
		this.handlers.forEach(function(handler) {
			if (typeof handler.feed === "function") { 
				handler.feed( jpeg );
			}
		});
	}

	onDownRequest (socket, req)
	{
		this.handlers.some(function(handler) {
			if (handler.handlerName !== req.handler) {
				return false;
			}

			do {
				if (typeof handler.onDownRequest !== "function") break;
				if (!req.hasOwnProperty('cmd')) break;
				if (!req.hasOwnProperty('userId')) break;
				handler.onDownRequest(socket, req);
			} while (false);
			return true;
		});
	}

	addSourcer (Sourcer) 
	{
		this.sourcerClass.push(Sourcer);
	}

	addHandler (Handler) 
	{
		this.handlerClass.push(Handler);
	}

	eachClient (callback, whiteList) 
	{
		let enum_list = whiteList? whiteList : this.socketServer.clients;

		enum_list.forEach(function each(client) {
			if (client.readyState === WebSocket.OPEN) {
				callback(client);
			}
		});
	}

	broadcast (chunk) 
	{
		this.socketServer.clients.forEach(function each(client) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(chunk);
			}
		});
	}

	getConfig() 
	{
		return this.config;
	}

	run (index) 
	{
		if (index === undefined) {
			this.config = this.configs.get('centerNode');
			this.env.set('isCenter', true);

			this.startServer(this.config.port);
			this.loadHandlers();
			this.loadSourcers();
		} else {
			this.config = this.configs.get('relaysNodes')[parseInt(index)];
			this.env.set('isCenter', false);
			this.env.set('upstreamUrl', this.config.upstreamUrl);

			this.startServer(this.config.port);
			this.loadHandlers();

			this.upstream(this.config.upstreamUrl);
		}
	}

	upstream (url, interval = UPSTREAM_RECONNECT_INTERVAL) 
	{
		let handlers = this.handlers;
		this.wsClient(url, interval, function recv(data){
			var client = this;

			if (data === null) {
				handlers.forEach(function(handler) {
					if (typeof handler.onUpConnect === "function") { 
						handler.onUpConnect(client.socket);
					}
				});
				return;
			}

			var signs = [];
			if (typeof data === 'string') {
				signs.push(data.charCodeAt(0));
			} else {

				var dataView = new DataView(data);
				signs.push(dataView.getUint8(0));
				signs.push(dataView.getUint16(0));
			}

			handlers.forEach(function(handler) {
				if (typeof handler.onUpResponse !== "function") { 
					return;
				}

				if (signs.includes(handler.chunkHead)) {
					handler.onUpResponse (data, client.socket);
				}
			}, this);
		});
	}

	wsClient(url, interval, recv) 
	{
		var WSClient = function() {
			this.url = url;
			this.interval = interval;
			this.reconnectTimeoutId = 0;
			this.recv = recv;
		};

		WSClient.prototype.start = function() {
			this.socket = new WebSocket(this.url, {
				perMessageDeflate: false
			});

			this.socket.binaryType = 'arraybuffer';

			this.socket.on('message', function incoming(data) {
				this.recv(data);
			}.bind(this));

			this.socket.on('open', function open(){
				this.recv(null);
			}.bind(this));

			this.socket.on('error', this.onClose.bind(this));
			this.socket.on('close', this.onClose.bind(this));
			return this;
		};

		WSClient.prototype.onClose = function(ev) {
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = setTimeout(function(){
				this.start();	
			}.bind(this), this.interval);
		};

		WSClient.prototype.send = function(data) {
			this.socket.send(data);
		};

		return new WSClient().start();
	}
};
