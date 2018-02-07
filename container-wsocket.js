
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const machineIdSync = require('node-machine-id').machineIdSync;
const uuidv1 = require('uuid/v1');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const os = require('os');
const fork = require('child_process').fork;

const UPSTREAM_RECONNECT_INTERVAL = 300;

module.exports = class WebSocketHub 
{
	constructor( configs ) 
	{
		this.configs = configs;
		this.handlers = new Array();
		this.handlerClass = new Array();
		this.sources = new Array();
		this.sourcerClass = new Array();
		this.missingClients = new Array();
		this.upstreamClients = {};
		this.routeCmds = {};

		this.env = new Map(); 
		this.env.set('feed', this.feed.bind(this));
		this.env.set('configs', this.configs);
		this.env.set('getConfig', this.getConfig.bind(this));
		this.env.set('eachClient', this.eachClient.bind(this));
		this.env.set('findClient', this.findClient.bind(this));
		this.env.set('broadcast', this.broadcast.bind(this));
		this.env.set('nodeId', this.getNodeId());
		this.env.set('newCache', this.newCache.bind(this));
		this.env.set('handlerInfos', this.handlerInfos.bind(this));
		this.env.set('sourcerInfos', this.sourcerInfos.bind(this));
		this.env.set('activeSource', this.activeSource.bind(this));
		this.env.set('getNodeUrls', this.getLocalUrls.bind(this));
		this.env.set('defaultUpstream', this.defaultUpstream.bind(this));
		this.env.set('switchUpstream', this.switchUpstream.bind(this));
	}

	httpHandler( req, res, next)
	{
		let reqCmd = req.url.split('/',2).filter(e=>e.trim() != '');
		if (reqCmd.length === 0) return next();

		let respFunc = this.routeCmds[reqCmd[0]];
		if (!respFunc) return next();

		respFunc( req, res, next);
	}


	startServer( port, done )
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
			socket.uuid = uuidv1();

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

			if ( ! this.isCenter) {
				if ( this.switchUpstream( socket ) === null ) {
					this.missingClients.push( socket );
					console.log('switchUpstream error when connected');	
				}
			}

			this.handlers.forEach(function(handler) {
				if (typeof handler.onDownConnect === "function") { 
					handler.onDownConnect( socket );
				}
			});
		}).bind(this));

		this.webServer.listen(port, ()=> {
			console.log('Listening on %d', port);
			process.nextTick(()=>{
				done && done();
			});
		});

		this.env.set('server', this.socketServer);
	}

	static getFirstActive( configs ) 
	{
		let firstActiveIndex = null;
		let activeCount = 0;
		for (var index in configs) {
			let config = configs[index];
			if (config.active !== true) {
				continue;
			}
			if ( firstActiveIndex === null ) {
				firstActiveIndex = index;
			}
			activeCount++;
		}

		return [ firstActiveIndex, activeCount ];
	}

	static centerSupervisor( allConfigs ) 
	{
		let configs = allConfigs.get('centerNodes');

		for (var index in configs) {
			let config = configs[index];
			if (config.active !== true) {
				continue;
			}
			let subCenter = fork(process.argv[1], ['--index', index], {silent: true});
			subCenter.index = index;
			subCenter.stdout.on('data', function(data) {
				console.log('stdout('+subCenter.index+'): ', data.toString().trim());
			});
		}
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
		let actived = this.sources.find( (source) => { 
			return source.active;
		});

		if (cmdObj === undefined) {
			return actived;
		}

		actived && console.log( 'already actived: ', actived.sourceName );

		process.nextTick(()=>{
			this.sources.forEach(function(source) {
				source.stop();
				if (source.sourceName === cmdObj.sourceName) {
					setTimeout(()=>{
						source.start( cmdObj, callback );
					}, 300);
				}
			});
		});
	}

	loadSourcers ( allowSources = [] )
	{
		let loadedSources = [];
		this.sourcerClass.forEach((Sourcer) => {
			if (allowSources.indexOf( Sourcer.name ) === -1) {
				return;
			}
			loadedSources.push( Sourcer.name );

			let source = new Sourcer(this.env);
			this.sources.push(source);
			if (typeof source.http === 'function') { 
				this.routeCmds[source.sourceName] = source.http.bind(source);
			}
		});

		console.log( 'loaded source: ', loadedSources );
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
			upstreams : this.env.get('upstreams'),
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

	addSourcer( Sourcer ) 
	{
		this.sourcerClass.push(Sourcer);
	}

	addHandler( Handler ) 
	{
		this.handlerClass.push(Handler);
	}

	findClient (callback, whiteList) 
	{
		let resClient = null;

		if ( whiteList ) {
			for ( var i=0; i < whiteList.length; i++ ) {
				let client = whiteList[i]; 
				if (client.readyState !== WebSocket.OPEN) {
					continue;
				}
				if ( callback( client )) { 
					resClient = client;
					break;
				}
			}
		} else {
			this.socketServer.clients.forEach( function(client) {
				if (client.readyState !== WebSocket.OPEN) {
					return;
				}
				if ( callback( client )) { 
					resClient = client;
				}
			});
		}

		return resClient;
	}

	broadcast( chunk, whiteList ) 
	{
		this.eachClient(function(client){
			client.send(chunk);
		}, whiteList);
	}

	eachClient( callback, whiteList ) 
	{
		if ( whiteList ) {
			for ( var i=0; i < whiteList.length; i++ ) {
				let client = whiteList[i]; 
				if (client.readyState === WebSocket.OPEN) {
					callback(client);
				}
			}
		} else {
			this.socketServer.clients.forEach( function(client) {
				if (client.readyState === WebSocket.OPEN) {
					callback(client);
				}
			});
		}
	}

	getConfig() 
	{
		return this.config;
	}

	runCenter (index) 
	{
		this.isCenter = true;
		this.config = this.configs.get('centerNodes')[parseInt(index)];
		this.env.set('isCenter', this.isCenter);

		this.config.setgid && process.setgid( this.config.setgid );
		this.config.setuid && process.setuid( this.config.setuid );

		let soureName = this.config.defaultSource;
		this.configs.source[soureName].autoStart = true;
		this.configs.source[soureName].autoStartIndex = this.config.defaultSourceIndex || 0;

		this.startServer( this.config.port, ()=>{
			this.loadHandlers();
			this.loadSourcers( this.config.allowSources );
		});
	}

	runRelays (index) 
	{
		this.isCenter = false;
		this.config = this.configs.get('relaysNodes')[parseInt(index)];
		this.env.set('isCenter', this.isCenter);
		this.env.set('upstreams', this.config.upstreams);

		this.startServer( this.config.port, ()=>{
			this.loadHandlers();
			this.runUpstreams(this.config.upstreams);
		});
	}

	switchUpstream( socket, name ) 
	{
		if ( this.isCenter) {
			return false;
		}

		if ( ! name ) {
			name = this.defaultUpstream();
			if ( ! name ) {
				console.log( 'get defaultUpstream error when name=default' );
				return false;
			}
			console.log('specify upstream as: ', name);
		}

		if( socket.upstreamName === name ) {
			console.log("same upstream, needn\'t to change : ", socket.upstreamName);
			return false;
		}

		if ( ! this.upstreamClients.hasOwnProperty( name )) {
			console.log('not found the upstgream: ', name, this.upstreamClients.keys() );
			return null;
		}

		let targetClients = this.upstreamClients[name].downClients;
		if ( targetClients.indexOf( socket ) >= 0 ) {
			console.log( 'target upstream client have already owned ths socket' );
			return false;
		}

		if ( socket.upstreamName ) {
			if ( this.upstreamClients.hasOwnProperty( socket.upstreamName )) {
				let oldDownClients = this.upstreamClients[socket.upstreamName].downClients;
				let indexExists = oldDownClients.indexOf( socket );
				if ( indexExists >= 0 ) {
					console.log( 'splice socket from: ', socket.upstreamName);
					oldDownClients.splice( indexExists, 1 );
				}
			}
		}

		targetClients.push( socket );
		socket.upstreamName = name;
		return true;
	}

	defaultUpstream( name )
	{
		if (this.isCenter) {
			return null; 
		}

		if ( name === undefined ) 
		{
			let theFirst = null;

			for (var upName in this.upstreamClients) {
				if (theFirst === null) {
					theFirst = upName;
				}
				let config = this.upstreamClients[upName].config;
				if (config.default) {
					return upName;
				}
			};

			for (var index in this.config.upstreams) {
				let config = this.config.upstreams[index];
				if (config.active !== undefined) {
					if (config.active !== true) {
						continue;
					}
				}
				if (theFirst === null) {
					theFirst = config.name;
				}
				if (config.default) {
					return config.name;
				}
			};

			return theFirst;

		} else {
			let oriDefault = null;
			let done = false;

			for (var upName in this.upstreamClients) {
				let upClient = this.upstreamClients[upName]; 

				if( upClient.config.default ) {
					if (oriDefault === null) {
						oriDefault = upClient;
					}
				}

				if( upClient.config.name === name ) {
					upClient.config.default = true;
					done = true;
				} else {
					upClient.config.default = false;
				}
			};

			if( !done ) {
				if( oriDefault ){
					oriDefault.config.default = true;
				}
			}
		}
	}

	runUpstreams( configs, interval = UPSTREAM_RECONNECT_INTERVAL ) 
	{
		configs.forEach( (config)=> {
			if ( config.active !== true ) {
				return;
			}

			let handlers = this.handlers;

			let sendToHandlers = function( handleName, data, client ){
				for (var i=0; i < handlers.length; i++) {
					let handler = handlers[i];
					if ( handler.handlerName == handleName ) {
						handler.onUpResponse( data, client );
						break;
					}
				}
			};

			let upstreamClient = this.wsClient( config.url, interval, function( data ){
				var client = this;

				if (data === null) {
					for (var i=0; i < handlers.length; i++) {
						let handler = handlers[i];
						if (typeof handler.onUpConnect === "function") { 
							handler.onUpConnect( client );
						}
					};
					return;
				}

				if (typeof data === 'string') {
					sendToHandlers( 'manager', data, client );
					return;
				}

				if ( data.readUInt16BE() === 0xFFD8 ) {
					sendToHandlers( 'mjpeg', data, client );
					return;
				}

				sendToHandlers( 'mpeg1', data, client );
			});

			upstreamClient.config = config;
			upstreamClient.downClients = new Array();

			this.upstreamClients[ config.name ] =  upstreamClient;
		});

		if (this.missingClients.length) {
			this.missingClients.forEach(( item ) => {
				console.log('reSwitch upstreams');
				this.switchUpstream( item );
			});
		}
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

			this.socket.binaryType = 'nodebuffer';

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
			if (this.socket.readyState === WebSocket.OPEN) {
				this.socket.send(data);
			}
		};

		return new WSClient().start();
	}
};
