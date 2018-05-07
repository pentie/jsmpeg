
const {getMediaUrls} = require('./module-common.js');
const {JpegsPcmFromWeb} = require('./module-transcode.js');
const AdvertiseBox = require('./module-advertise.js');
const ScanOnvif = require('./module-onvif.js');
const tcpPortUsed = require('tcp-port-used');
const url = require('url');
const waterfall = require('async/waterfall');

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
			this.urgencyUrl = mjpegUrl;
		});

		this.active = false;
		this.isRunning = false;
		this.onvifTimerId = null;
		this.feedTickTime = -1;
		
		if (this.config.autoStart === true) {
			this.start();
		}

		this.advBoxSupervisor();
	}

	waitAvailableWebcamSrc( cmdObj, callback )
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
					this.waitAvailableWebcamSrc( null, callback );
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
				this.waitAvailableWebcamSrc( null, callback );
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

	start( cmdObj, done ) 
	{
		this.onvifBox.startOnvif();
		this.active = true;

		waterfall([ callback => {
			this.waitSourceNotRunning( 3000, useTimeMs=> {
				if (useTimeMs === -1) {
					return callback('Please run stop first, Too fast');
				}

				if (useTimeMs > 0) {
					console.log( 'Wait '+ useTimeMs + ' ms to start');
				}

				callback(null, cmdObj);
			});
		},

		(cmdObj, callback) => {
			this.waitAvailableWebcamSrc( cmdObj, (srcUrl)=> {
				let urlObj = getMediaUrls( srcUrl );
				callback( null, urlObj );
			});
		},

		(urlObj, callback) => {
			this.source = new JpegsPcmFromWeb( this.config, urlObj,
				this.feedProxyImage.bind(this),
				this.feedProxyPCM.bind(this),
			//endCallback
			(stdout, stderr) => {
				console.debug( 'JpegsPcmFromWeb end: ' , stderr );
				callback( null, urlObj );
			},
			//errCallback
			(err, stdout, stderr) => {
				if ( err) {
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
				console.debug( 'JpegsPcmFromWeb err' );
				callback( null, urlObj );
			});

			this.source.start( (cmdline )=>{
				console.log( 'JpegsPcmFromWeb: ' + cmdline);
				this.feedTickTime = Date.now();
				this.isRunning = true;
				this.urgencyUrl = null;
				this.advBox.stop();
				done && done( cmdline ); 
			});
		},

		(urlObj, callback) => {
			this.isRunning = false;
			this.source && this.source.stop();

			if (this.active) {
				this.waitWebcamBackAgain( urlObj );
			} else {
				callback('source is inactive, neednt wait for webcam');
			}
		}

		], (err, result) => {
			if (err) {
				console.log(err);
			}
		});
	}

	waitWebcamBackAgain( urlObj ) 
	{
		!this.advBox.active && this.advBox.start();

		tcpPortUsed.waitUntilUsedOnHost( 
			urlObj.port, urlObj.hostname, 
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

	advBoxSupervisor()
	{
		console.log( this.sourceName, 'start advBox Supervisor');
		let actionTime = Date.now();
		let actionReport = false;

		if (this.advBoxTimeInterval) {
			clearInterval( this.advBoxTimeInterval );
		}

		this.advBoxTimeInterval = setInterval(()=>{
			if ( Date.now() - this.feedTickTime > 2000 ) {
				if (Date.now() - actionTime > 3000 ) {
					this.source && this.source.stop();
					actionTime = Date.now();
					if ( actionReport === false ) { 
						console.log('force stop source');
						actionReport = true;
					}
				}
			} else {
				actionReport = false;
			}

			if ( this.advBox.active ) {
				if ( Date.now() - this.feedTickTime < 1000 ) {
					this.advBox.stop();
				}
			}
		}, 1000);
	}

	feedAdvertiseImage( jpeg ) 
	{
		if ( Date.now() - this.feedTickTime < 1000 ) {
			return;
		}

		this.active && this.feedImage( jpeg );
	}

	feedAdvertisePCM ( chunk ) 
	{
		if ( Date.now() - this.feedTickTime < 1000 ) {
			return;
		}

		this.active && this.feedPCM( chunk );
	}

	feedProxyImage( jpeg ) 
	{
		this.feedTickTime = Date.now();
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

	list() 
	{
		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			src: this.onvifBox.getSrcList(this.config.src)
		};
	}

	advBoxToggle()
	{
		console.log(this.name, "advBox toggled, no effect on this source.");
	}
};


	function __start( cmdObj, callback )
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

			this.waitAvailableWebcamSrc( cmdObj, (srcUrl)=> {
				let urlObj = getMediaUrls( srcUrl );

				this.source = new JpegsPcmFromWeb( this.config, urlObj,
					this.feedProxyImage.bind(this),
					this.feedProxyPCM.bind(this),
				//endCallback
				(stdout, stderr) => {
					this.isRunning = false;
					this.source && this.source.stop();
					this.active && this.waitWebcamBackAgain( urlObj );

					console.debug( 'JpegsPcmFromWeb end: ' , stdout, stderr );
				},
				//errCallback
				(err, stdout, stderr) => {
					this.isRunning = false;
					this.source && this.source.stop();
					this.active && this.waitWebcamBackAgain( urlObj );

					console.debug( 'JpegsPcmFromWeb end: ' ,err, stdout, stderr );

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
				},
				// pcmEnd
				(stdout, stderr) => {
					console.debug( 'JpegsPcmFromWeb end: ' , stdout, stderr );
				},
			
				//pcmErr
				(err, stdout, stderr) => {
					console.debug( 'JpegsPcmFromWeb end: ' ,err, stdout, stderr );
				});

				this.source.start( (cmdline )=>{
					console.log( 'JpegsPcmFromWeb: ' + cmdline);

					this.isRunning = true;
					this.urgencyUrl = null;
					this.advBox.stop();
					callback && callback( cmdline ); 
				});
			});
		});
	}


