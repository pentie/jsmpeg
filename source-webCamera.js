
const {getMediaUrls} = require('./module-common.js');
const {JpegsPcmFromWeb} = require('./module-transcode.js');
const AdvertiseBox = require('./module-advertise.js');
const ScanOnvif = require('./module-onvif.js');
const tcpPortUsed = require('tcp-port-used');
const url = require('url');

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
		this.onvifConfig = this.config.get('onvif');

		this.advBox = new AdvertiseBox( 
			this.advConfig, 
			this.feedAdvertiseImage.bind(this),
			this.feedAdvertisePCM.bind(this)
		);
		this.advBox.ownerName = this.sourceName;

		this.urgencyUrl = null;
		this.onvifBox = new ScanOnvif( this.onvifConfig, (mjpegUrl)=>{
			this.urgencyUrl = mjpgUrl;
		});

		this.active = false;
		this.isRunning = false;
		this.onvifTimerId = null;
		
		if (this.config.autoStart === true) {
			this.start();
		}

		this.advBoxSupervisor();
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
			if ((cmdObj = this.onvifBox.getCmdObj(
				      this.config.autoStartIndex, this.config.src )) === null) {
				console.log( `No webcam, check after ${this.onvifBox.onvifInterval} ms`);
				! this.advBox.active && this.advBox.start();

				setTimeout(()=> {
					this.waitAvailableWebcam( null, callback );
				}, this.onvifBox.onvifInterval);
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
		this.onvifBox.startOnvif();

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
				let urlObj = getMediaUrls( mjpgUrl );

				this.source = new JpegsPcmFromWeb( this.config, urlObj,
					this.feedProxyImage.bind(this),
					this.feedProxyPCM.bind(this),
				//endCallback
				(stdout, stderr) => {
					this.isRunning = false;
					this.source && this.source.stop();
					this.active && this.waitWebcamBackAgain( urlObj );

					console.debug( stdout, stderr );
				},
				//errCallback
				(err, stdout, stderr) => {
					this.isRunning = false;
					this.source && this.source.stop();
					this.active && this.waitWebcamBackAgain( urlObj );

					console.debug( stdout, stderr );

					if ( ! err) {return;}

					let errStr = err.toString();
					if (errStr.indexOf('Connection refused') >= 0) {
						console.log('ffmpeg lost the camera');
					}else 
					if (errStr.indexOf('SIGKILL') >= 0) {
						console.log('ffmpeg was killed');
					} else {
						console.log( err );
					}
				});

				this.source.start( (cmdline )=>{
					console.log(cmdline);

					this.isRunning = true;
					this.urgencyUrl = null;
					this.advBox.stop();
					callback && callback( cmdline ); 
				});
			});
		});
	}

	waitWebcamBackAgain( urlObj ) 
	{
		!this.advBox.active && this.advBox.start();

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

			let cmdObj = {
				sourceName:  this.sourceName,
				url: urlObj.oriUrl 
			};

			this.start( cmdObj, (cmdline)=> {
				console.log('tcpPortUsed found webcam is back, waked');
			});

		}, (err)=> {
			if (this.isRunning) {
				console.log('tcpPortUsed stop waitting');
				return;
			}

			if (this.source.oriUrl !== urlObj.oriUrl ) {
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
				this.waitWebcamBackAgain( urlObj );
			});
		});
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

	feedProxyImage( jpeg ) 
	{
		this.active && this.feedImage( jpeg );
	}

	feedProxyPCM( chunk ) 
	{
		this.active && this.feedPCM( chunk );
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
		this.onvifBox.stopOnvif();
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

	list() 
	{
		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			src: this.onvifBox.getSrcList(this.config.src)
		};
	}

};


