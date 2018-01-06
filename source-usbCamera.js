
const {JpegsFromUsbCamera} = require('./common-modules.js');
const usbDetect = require('usb-detection');

module.exports = class UsbCameraSource
{
	constructor( env ) 
	{
		this.sourceName = 'usbCamera';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.size = this.config.size;
		this.active = false;

		if (this.config.autoStart === true) {
			this.start( {devPath: this.config.src[0] });
		}
	}

	function getDevSerial( devPath, callback )
	{
		let cmdline = 'udevadm info --query=all ' + devPath + ' | grep "ID_SERIAL_SHORT" | awk -F \'=\' \'{print $2}\''

		exec( cmdline, (error, stdout, stderr) => {
			if (error) {
				callback( error );
				return;
			}

			if( stdout ) {
				callback( null, stdout.trim() );
				return;
			}
			callback( stderr );
		});
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
		let devPath = cmdObj.devPath;
		if (!devPath) {
			callback(null);
			return;
		}

		this.lastCmdObj = cmdObj;
		this.lastCallback = callback;

		this.source = new JpegsFromUsbCamera( this.config, devPath, this.feedProxy.bind(this) );
		this.source.start( callback );
		this.active = true;

		usbDetect.startMonitoring();
		usbDetect.on('add', this.onUsbInsert.bind(this));
		usbDetect.on('remove', this.onUsbRemove.bind(this));
	}

	/*
	devicie = {
		locationId: 0,
		vendorId: 5824,
		productId: 1155,
		deviceName: 'Teensy USB Serial (COM3)',
		manufacturer: 'PJRC.COM, LLC.',
		serialNumber: '',
		deviceAddress: 11
	}
	*/
	onUsbInsert( device )
	{
		console.log( device );

	}

	onUsbRemove( device )
	{
		console.log( device );


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
		usbDetect.stopMonitoring();
	}
};
