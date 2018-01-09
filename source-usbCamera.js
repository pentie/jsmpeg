
const { exec } = require('child_process');
const { JpegsFromUsbCamera } = require('./common-modules.js');
const usbDetect = require('usb-detection');

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
			this.start( {devPath: this.config.src[0] });
		}

		usbDetect.startMonitoring();

		usbDetect.on('add', (device)=>{
			if( this.currentCmdObj.serialNumber == device.serialNumber ) {
				this.onUsbInsert(device);
			}
		});

		usbDetect.on('remove', (device)=>{
			if( this.currentCmdObj.serialNumber == device.serialNumber ) {
				this.onUsbRemove(device);
			}
		});
	}

	getUvcSerial( devPath, callback )
	{
		if ( this.serials === undefined ) {
			this.serials = new Map();
		}

		if (this.serials.has( devPath )) {
			callback( null, this.serials.get( devPath ));
			return;
		}

		this.getDevSerial( devPath, (err, res) => {
			callback( err, res );
			res && this.serials.set( devPath, res );
		});
	}

	getDevSerial( devPath, callback )
	{
		if (!devPath) {
			callback('devPath is empty');
			return;
		}

		let cmdline = 'udevadm info --query=all ' + devPath + ' | grep "ID_SERIAL" | awk -F \'=\' \'{print $2}\''

		exec( cmdline, (error, stdout, stderr) => {
			console.log( error, stdout, stderr );
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
		this.getUvcSerial( cmdObj.devPath, (err, res) => {
			if (err) {
				console.log( err );
				return;
			}

			cmdObj.serialNumber = res;
			console.log(cmdObj);

			this.source = new JpegsFromUsbCamera( this.config, cmdObj.DevPath, this.feedProxy.bind(this) );
			this.source.start( callback );
			this.active = true;
			this.currentCmdObj = cmdObj;

		});
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

		do {
			if (this.exceptionShutdown) {
				this.exceptionShutdown = false;
				break;
			}

			if (this.active) {
				break;
			}

			if (this.config.forceStart) {
				break;
			}

			return;
		} while( false );


		this.currentCmdObj.sourceName = this.sourceName;
		this.activeSource( this.currentCmdObj, (cmdline) => {
			console.log('usb insert, playing: ', cmdline);
		});
	}

	onUsbRemove( device )
	{
		console.log( device );
		if (this.active) {
			activeSource('advertise');
			this.exceptionShutdown= true;
		}
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
