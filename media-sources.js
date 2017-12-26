
const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const machineIdSync = require('node-machine-id').machineIdSync;
const uuidv1 = require('uuid/v1');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const os = require('os');
const fork = require('child_process').fork;

class WSHostFrameworkBase
{
	constructor( configs ) 
	{
		this.configs = configs;
		this.pluginClasses = new Map();
		this.pluginInstances = new Array();

		this.env = new Map(); 
		this.env.set('configs', this.configs);
		this.env.set('nodeId', this.getNodeId());
		this.env.set('getNodeUrls', this.getLocalUrls.bind(this));
		this.env.set('getConfig', this.getConfig.bind(this));
		this.env.set('eachClient', this.eachClient.bind(this));
	}

	getNodeId () 
	{
		if (this.nodeId === undefined) {
			let data = machineIdSync() + this.port;
			this.nodeId = crypto.createHash('md5').update(data).digest("hex");
		}
		return this.nodeId;
	}

	getConfig() 
	{
		return this.config;
	}

	eachClient( callback, whiteList ) 
	{
		if (whiteList) {
			for (var i=0; i < whiteList.length; i++) {
				let client = whiteList[i]; 
				if (client.readyState === WebSocket.OPEN) {
					callback( client );
				}
			}
		} else {
			this.socketServer.clients.forEach( function(client) {
				if (client.readyState === WebSocket.OPEN) {
					callback( client );
				}
			});
		}
	}

	addPlugin( PluginClass ) 
	{
		this.pluginClasses.set( PluginClass.pluginName, PluginClass );
	}

	runPlugin( pluginName, config )
	{
		let PluginClass = this.pluginClasses.get( pluginName );
		this.pluginInstances.push( new PluginClass(this.env, config ));
	}

	startServer( port )
	{
		let app = express();
		app.use(express.static('public'));
		app.use(this.httpHandler.bind(this));
		app.use(function (req, res) {
			res.json({ status: 'error', error: "handler not found" });
		});

		this.webServer = http.createServer(app);
		this.socketServer = new WebSocket.Server({ server: this.webServer });

		this.socketServer.on('connection', (function(socket, upgradeReq) {
			socket.on('error', this.onServerError.bind(this));
			socket.on('close', this.onServerClose.bind(this));

			socket.on('message', (function(dataStr){
				let reqJson = null;
				try {
					reqJson = JSON.parse(dataStr);
				} catch (e) {
				}

				reqJson && this.onServerMessage(socket, reqJson);
			}).bind(this));

			
			this.sources.forEach(function( source ) {
				if (typeof source.onDownConnect === "function") { 
					source.onDownConnect( socket );
				}
			});

			socket.uuid = uuidv1();
		}).bind(this));

		this.webServer.listen(port, function listening() {
			console.log('Listening on %d', port);
		}.bind(this));

		this.env.set('server', this.socketServer);
	}

	onServerError( err ) { console.log('image feed err: '+err );}
	onServerClose( code, message ) { console.log('server close: '+code );}
	onServerMessage( socket, reqJson ) { console.log('server recv: ', reqJson );}

	static sourceSupervisor( allConfigs ) 
	{
		let configs = allConfigs.get('sourceNodes');

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

	static getLocalUrls( port ) 
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
}
