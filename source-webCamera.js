
const {JpegsFromWebCamera} = require('./module-transcode.js');
const AdvertiseBox = require('./module-advertise.js');
const tcpPortUsed = require('tcp-port-used');
const url = require('url');
const onvif = require('node-onvif');

const ONVIF_INTERVAL = 5000;

module.exports = class WebCameraSource
{
	static get name() { 
		return 'webCamera'; 
	}

	constructor(env) 
	{
		this.sourceName = WebCameraSource.name;
		this.feedImage = env.get('feedImage');
		this.feedPCM = env.get('feedPCM');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.advConfig = env.get('configs').get('advertise');
		this.advBox = new AdvertiseBox( 
			this.advConfig, 
			this.feedAdvertiseImage.bind(this),
			this.feedAdvertisePCM.bind(this)
		);
		this.advBox.ownerName = this.sourceName;

		this.onvifInterval = this.config.onvifInterval || ONVIF_INTERVAL;
		this.onvifList = [];
		this.urgencyUrl = null;

		this.active = false;
		this.isRunning = false;
		this.onvifTimerId = null;
		
		if (this.config.autoStart === true) {
			this.start();
		}

		this.advBoxSupervisor();
	}

	onFoundNewCamera( mjpgUrl )
	{
		// This is daemon routine.
		console.log('onvif got: ', mjpgUrl);

		if (this.config.alwaysNewest === true) {
			console.log('force play the newest camera');
			this.urgencyUrl = mjpgUrl;
		}
	}

	waitAvailableWebcam( cmdObj, callback )
	{
		if ( ! this.active) {
			console.log('drop the waitting for webcam');
			return;
		}

		if (this.urgencyUrl) {
			callback( this.urgencyUrl );
			return;
		}

		// undefined cmdObj means internal call when module started
		if ( ! cmdObj ) 
		{
			// internal call must wait for webcamera
			if ((cmdObj = this.getCmdObj()) === null) {
				console.log( `Not found webcam, start again after ${this.onvifInterval} ms` );
				! this.advBox.active && this.advBox.start();

				setTimeout(()=> {
					this.waitAvailableWebcam( null, callback );
				}, this.onvifInterval);
			} else {
				console.log(`get active camera: ${cmdObj.url}.`);
				callback( cmdObj.url );
			}
			return;
		}
			
		//url must be set explicitly
		if ( ! cmdObj.url ) {
			console.log('the input cmdObj.url must be set');
			return;
		}

		if (cmdObj.url === 'activeDiscovery') {
			process.nextTick(()=> {
				this.waitAvailableWebcam( null, callback );
			});
			return;
		}

		callback( cmdObj.url );
	}

	waitSourceNotRunning( timeMs, callback )
	{
		if( ! this.isRunning ) {
			callback( 0 );
			return;
		}

		let beginTime = Date.now();

		let startTimerId = setInterval(()=>{
			let offset =  Date.now() - beginTime;

			if (offset > timeMs) {
				clearInterval( startTimerId );
				callback( -1 );
				return;
			}

			if( ! this.isRunning ) {
				clearInterval( startTimerId );
				callback( offset );
			}
		}, 10);
	}

	start( cmdObj, callback )
	{
		this.startOnvif();

		this.active = true;
		this.waitSourceNotRunning( 3000, (useTimeMs) => {
			if (useTimeMs === -1) {
				console.log( 'Please run stop first, Too fast');
				return;
			}

			if (useTimeMs > 0) {
				console.log( 'Wait '+ useTimeMs + ' ms to start');
			}

			this.waitAvailableWebcam( cmdObj, (mjpgUrl)=> {
				this.source = new JpegsFromWebCamera( this.config, mjpgUrl,
					this.feedProxy.bind(this),
					//endCallback
					(stdout, stderr)=>{
						this.isRunning = false;
						this.source && this.source.stop();
						this.active && this.waitWebcamBackAgain( mjpgUrl );
						console.debug(stdout);
						console.debug(stderr);
					},
					//errCallback
					(err, stdout, stderr) => {
						this.isRunning = false;
						this.source && this.source.stop();
						this.active && this.waitWebcamBackAgain( mjpgUrl );

						console.debug(stdout);
						console.debug(stderr);
						if (err) {
							let errStr = err.toString();
							if (errStr.indexOf('Connection refused') >= 0) {
								console.log('ffmpeg lost the camera');
							}else 
							if (errStr.indexOf('SIGKILL') >= 0) {
								console.log('ffmpeg was killed');
							} else {
								console.log( err );
							}
						}
					});

				this.source.start( (cmdline )=>{
					this.isRunning = true;
					this.urgencyUrl = null;
					this.advBox.stop();
					callback && callback( cmdline ); 
				});
			});
		});
	}

	waitWebcamBackAgain( mjpgUrl ) 
	{
		!this.advBox.active && this.advBox.start();

		let cmdObj = {
			sourceName:  this.sourceName,
			url: mjpgUrl
		};
		
		let urlObj = url.parse( cmdObj.url );

		tcpPortUsed.waitUntilUsedOnHost( 
			parseInt(urlObj.port), urlObj.hostname, 
			this.config.retryTimeMs, 
			this.config.timeOutMs )
		.then( ()=> {
			console.log(`Port ${urlObj.port} on ${urlObj.hostname} is now in use.`);

			if (this.isRunning) {
				console.log('tcpPortUsed has useful result. but needless');
				return;
			}

			this.start( cmdObj, (cmdline)=> {
				console.log('tcpPortUsed found webcam is back, waked');
			});

		}, (err)=> {
			if (this.isRunning) {
				console.log('tcpPortUsed stop waitting');
				return;
			}

			if (this.source.url !== mjpgUrl) {
				console.log('tcpPortUsed found target url has changed');
				return;
			}

			if (this.urgencyUrl) {
				console.log('tcpPortUsed error after found urgencyUrl. waitup start');
				this.stop();
				this.start();
				return;
			}

			process.nextTick(()=> {
				this.waitWebcamBackAgain( mjpgUrl );
			});
		});
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

	feedAdvertiseImage( jpeg ) 
	{
		if ( this.isRunning ) {
			return;
		}

		this.active && this.feedImage( jpeg );
	}

	feedAdvertisePCM ( chunk ) 
	{
		if ( this.isRunning ) {
			return;
		}

		this.active && this.feedPCM( chunk );
	}

	feedProxy( jpeg ) 
	{
		this.active && this.feedImage( jpeg );
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
		this.stopOnvif();
		this.active = false;
		this.advBox.stop();
		this.source && this.source.stop();
	}

	advBoxSupervisor()
	{
		console.log( this.sourceName, 'start advBox Supervisor');
		this.advErrorCounter = 0;

		if (this.advBoxTimeInterval) {
			clearInterval( this.advBoxTimeInterval );
		}

		this.advBoxTimeInterval = setInterval(()=>{
			if ( ! this.advBox.active ) {
				this.advErrorCounter = 0;
				return;
			}
			if ( ! this.isRunning ) {
				this.advErrorCounter = 0;
				return;
			}

			this.advErrorCounter++;

			if ( this.advErrorCounter >= 3 ) {
				console.log( this.sourceName, 'force stop advBox');
				this.advBox.stop();
			}
			this.advErrorCounter = 0;
		}, 1000);
	}

	startOnvif()
	{
		this.stopOnvif();
		this.onvifTimerId = setInterval(()=>{
			this.onvifScan( (mjpgUrl) => {
				if (this.onvifList.indexOf( mjpgUrl ) >= 0) {
					return;
				}
				this.onvifList.push( mjpgUrl );
				this.onFoundNewCamera( mjpgUrl );
			});
		}, this.onvifInterval + 3000);
		console.log('start onvif discovery');
	}

	stopOnvif()
	{
		if (this.onvifTimerId) {
			clearInterval( this.onvifTimerId );
			this.onvifTimerId = null;
			console.log('stop onvif discovery');
		}
	}

	onvifScan( callback )
	{
		onvif.startProbe().then(( devInfoList ) => {
			devInfoList.forEach(( devInfo ) => {
/*
{ 
	urn: 'urn:uuid:97EAD713-33A1-463F-999F-16BEDE4F0A6E',
    name: 'IP Webcam',
    hardware: 'BUILD_608',
    location: 'global',
    types: [ 'dn:NetworkVideoTransmitter' ],
    xaddrs: [ 'http://192.168.51.146:8080/onvif/device_service' ],
    scopes: 
     [ 'onvif://www.onvif.org/name/IP_Webcam',
       'onvif://www.onvif.org/type/video_encoder',
       'onvif://www.onvif.org/type/audio_encoder',
       'onvif://www.onvif.org/hardware/BUILD_608',
	   'onvif://www.onvif.org/location/global' 
	] 
}
*/
				// UUID: devInfo.urn
				// Name: devInfo.name
				// URL: devInfo.xaddrs[0]

				let authStr = null;
				if ((typeof this.config.user === 'string') && (this.config.user.length>1)) {
					authStr = `${this.config.user}:${this.config.pass}`;
				}

				let urlObj = url.parse(devInfo.xaddrs[0]);
				urlObj.authStr = authStr;
				urlObj.pathname = '/videofeed';
				let mjpgUrl = url.format(urlObj);
				callback( mjpgUrl );
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

};


