
const {JpegsFromWebCamera} = require('./module-common.js');
const tcpPortUsed = require('tcp-port-used');
const url = require('url');
const onvif = require('node-onvif');

const ONVIF_INTERVAL = 5000;

module.exports = class WebCameraSource
{
	constructor(env) 
	{
		this.sourceName = 'webCamera';
		this.feed = env.get('feed');
		this.activeSource = env.get('activeSource');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.onvifInterval = this.config.onvifInterval || ONVIF_INTERVAL;
		this.onvifList = [];

		this.active = false;
		
		if (this.config.autoStart === true) {
			this.start();
		}

		this.updateOnvif();
	}

	updateOnvif()
	{
		this.onvifScan( (mjpgUrl) => {
			if (this.onvifList.indexOf( mjpgUrl ) >= 0) {
				return;
			}
			this.onvifList.push( mjpgUrl );
			console.log('onvif got: ', mjpgUrl);
		});

		setTimeout(()=> {
			this.updateOnvif();
		}, this.onvifInterval + 3000);
	}

	onvifScan( callback )
	{
		onvif.startProbe().then(( devInfoList ) => {
			devInfoList.forEach(( devInfo ) => {

				let device = new onvif.OnvifDevice({
					xaddr: devInfo.xaddrs[0],
					user : this.config.user,
					pass : this.config.pass
				});

				device.init().then(( info ) => {
					let rtspUrl = device.getUdpStreamUrl();
					let urlObj = url.parse(rtspUrl);
					urlObj.auth = `${this.config.user}:${this.config.pass}`;
					urlObj.protocol = 'http';
					urlObj.pathname = '/videofeed';

					let mjpgUrl = url.format(urlObj);

					callback( mjpgUrl );
				}).catch((error) => {
					console.error(error);
				});
			});
		}).catch((error) => {
			console.error(error);
		});
	}

	list() 
	{
		let actuallList = this.config.src.concat( this.onvifList );

		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			src: actuallList
		};
	}

	lastCmdObj( cmdObj )
	{
		if (cmdObj === undefined) {
			return this.defaultCmdObj;
		}

		this.defaultCmdObj = cmdObj;
	}

	getCmdObj()
	{
		let cmdObj = {
			sourceName:  this.sourceName
		};

		// equal -1, means the newest discovery one.
		if (this.config.autoStartIndex === -1) 
		{
			if (this.onvifList.length) 
			{
				cmdObj.url = this.onvifList[ this.onvifList.length-1 ];
				return cmdObj;
			}
			if (this.config.src.length) 
			{
				cmdObj.url = this.config.src[0];
				return cmdObj;
			}
			return null;
		}

		let actuallList = this.config.src;
		let actuallyIndex = Math.max( this.config.autoStartIndex, 0);

		if ( this.onvifList &&  this.onvifList.length )
		{
			actuallList = actuallList.concat( this.onvifList );
			actuallyIndex = Math.min( actuallyIndex, actuallList.length-1 );
		}

		if (actuallList.length === 0) {
			return null;
		}

		cmdObj.url = actuallList[ actuallyIndex ];
		return cmdObj;
	}

	start( cmdObj, callback )
	{
		// undefined cmdObj means internal call when module started
		if (cmdObj === undefined) {
			// internal call must wait for webcamera
			if ((cmdObj = this.getCmdObj()) === null) {
				setTimeout(()=> {
					this.start();
				}, this.onvifInterval);

				console.log( `not found webcam, start again after ${this.onvifInterval} ms` );
				let actived = this.activeSource();
				if (actived && (actived.sourceName == 'advertise')) {
					return;
				}
				console.log('fuck', actived? actived.sourceName: null);
				this.activeSource('advertise');
			} else {
				console.log(`first active camera: ${cmdObj.url}.`);

				this.activeSource( cmdObj, (ffmpegCmd) => {
					console.log('webcam is comming, playing: ', ffmpegCmd);
				});
			}
			return;
		} else {
			//As a remote call, url must be set explicitly
			if (cmdObj.url === undefined) {
				console.log('the input cmdObj.url must be set');
				return;
			}
		}

		this.lastCmdObj( cmdObj );

		this.source = new JpegsFromWebCamera( this.config, cmdObj.url, this.feedProxy.bind(this), (err)=>{
			err && console.log( err );
			this.source && this.source.stop();
			this.onWebCameraShutdown();
		});
		this.source.start( callback );
		this.active = true;
	}

	onWebCameraShutdown()
	{
		this.activeSource('advertise');

		let cmdObj = this.lastCmdObj();
		let urlObj = url.parse( cmdObj.url );

		tcpPortUsed.waitUntilUsedOnHost( 
			parseInt(urlObj.port), urlObj.hostname, 
			this.config.retryTimeMs, 
			this.config.timeOutMs )
		.then( ()=> {
			console.log(`Port ${urlObj.port} on ${urlObj.hostname} is now in use.`);

			this.activeSource( cmdObj, (ffmpegCmd) => {
				console.log('webcam is back, playing: ', ffmpegCmd);
			});

		}, (err)=> {
			console.log('tcpPortUsed error:', err.message);
		});
	}

	feedProxy( jpeg ) 
	{
		this.active && this.feed( jpeg );
	}

	pause ()
	{
		this.active = false;
	}

	resume ()
	{
		this.active = true;
	}

	stop ()
	{
		this.active = false;
		this.source && this.source.stop();
	}
};


