
const { exec } = require('child_process');
const { JpegsFromUsbCamera } = require('./module-common.js');
const V4l2Monitor = require('./module-v4l2-detection.js');
const AdvertiseBox = require('./module-advertise.js');

module.exports = class UsbCameraSource
{
	constructor( env ) 
	{
		this.sourceName = 'usbCamera';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.advConfig = env.get('configs').get('advertise');
		this.advBox = new AdvertiseBox( this.advConfig, this.feedProxy.bind(this));
		this.advBox.ownerName = this.sourceName;

		this.size = this.config.size;
		this.active = false;
		this.isRunning = false;
		this.exceptionShutdown = false;
		this.currentCmdObj = {};

		this.config.autoStartIndex = Math.max(this.config.autoStartIndex, 0);
		this.config.autoStartIndex = Math.min(this.config.autoStartIndex, this.config.src.length-1);

		if (this.config.autoStart === true) {
			this.start(null, (cmdline)=>{
				console.log('first: ', cmdline);
			});
		}

		this.monitor = new V4l2Monitor();
		this.monitor.on('add', this.onCaptureInsert.bind(this));
		this.monitor.on('remove', this.onCaptureRemove.bind(this));

		this.advBoxSupervisor();
	}

	onCaptureInsert( devPath )
	{
		console.log( 'camera added:', devPath );

		if (this.config.src.indexOf( devPath ) === -1) {
			this.config.src.push( devPath );
		} 

		do {
			if (this.config.forceStart) {
				break;
			}

			if (this.currentCmdObj.devPath !== devPath) {
				return;
			}

			if (this.exceptionShutdown) {
				this.exceptionShutdown = false;
				break;
			}

			if (this.active) {
				break;
			}

			return;
		} while( false );

		let comdObj = {
			devPath: devPath,
			sourceName: this.sourceName
		};
		
		this.stop();

		this.start( comdObj, (cmdline) => {
			console.log('usb insert, playing: ', comdObj.devPath );
		});
	}

	onCaptureRemove( devPath )
	{
		console.log( 'camera remove:', devPath );
		if (this.isRunning) {
			return;
		}

		if (this.currentCmdObj.devPath !== devPath) {
			return;
		}

		console.log('exception play advertise movies');
		this.advBox.start();
		this.exceptionShutdown= true;
	}


	list() 
	{
		return {
			name: this.sourceName,
			caption: this.config.caption,
			active: this.active,
			src: this.config.src
		};
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
		this.active = true;
		if ( ! cmdObj ) {
			cmdObj = {devPath: this.config.src[ this.config.autoStartIndex] };
		}

		this.waitSourceNotRunning( 3000, (useTimeMs) => {
			if (useTimeMs === -1) {
				console.log( 'Please run stop first, Too fast');
				return;
			}

			if (useTimeMs > 0) {
				console.log( 'Wait '+ useTimeMs + ' ms to start');
			}

			this.source = new JpegsFromUsbCamera( this.config, cmdObj.devPath, this.feedProxy.bind(this), (err)=>{
				this.isRunning = false;
				
				if (err) {
					let errStr = err.toString();
					if (errStr.indexOf('SIGKILL') >= 0) {
						console.log('ffmpeg was killed');
					} else
					if (errStr.indexOf('No such file or directory') >= 0) {
						console.log('ffmpeg not found: ' + cmdObj.devPath);
					} else {
						console.log( err );
					}
				}

				this.active && !this.advBox.active && this.advBox.start();
			});

			this.source.start( (cmdline )=>{
				this.isRunning = true;
				this.advBox.stop();
				callback && callback( cmdline ); 
			});

			this.currentCmdObj = cmdObj;
		})

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
};
