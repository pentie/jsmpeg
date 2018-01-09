
const { exec } = require('child_process');
const { JpegsFromUsbCamera } = require('./common-modules.js');
const V4l2Monitor = require('./v4l2-detection.js');

module.exports = class UsbCameraSource
{
	constructor( env ) 
	{
		this.sourceName = 'usbCamera';
		this.feed = env.get('feed');
		this.activeSource = env.get('activeSource');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.size = this.config.size;
		this.active = false;
		this.exceptionShutdown = false;
		this.currentCmdObj = {};

		if (this.config.autoStart === true) {
			this.start();
		}

		this.monitor = new V4l2Monitor();
		this.monitor.on('add', this.onCaptureInsert.bind(this));
		this.monitor.on('remove', this.onCaptureRemove.bind(this));
	}

	onCaptureInsert( devPath )
	{
		console.log( 'camera added:', devPath );

		do {
			if (this.config.forceStart) {
				this.currentCmdObj.devPath = devPath;
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


		this.currentCmdObj.sourceName = this.sourceName;
		this.activeSource( this.currentCmdObj, (cmdline) => {
			console.log('usb insert, playing: ', cmdline);
		});
	}

	onCaptureRemove( devPath )
	{
		console.log( 'camera remove:', devPath );
		if (this.active) {
			if (this.currentCmdObj.devPath !== devPath) {
				return;
			}

			this.activeSource('advertise');
			this.exceptionShutdown= true;
		}
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

	start( cmdObj, callback )
	{
		if (cmdObj === undefined) {
			cmdObj = {devPath: this.config.src[0] };
		}

		console.log(cmdObj);

		this.source = new JpegsFromUsbCamera( this.config, cmdObj.devPath, this.feedProxy.bind(this) );
		this.source.start( callback );
		this.active = true;
		this.currentCmdObj = cmdObj;
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
