const monitor = require('node-usb-detection');
const { exec } = require('child_process');
const events = require('events');

class DevQueryClass 
{
	transPortPath( portNumberOrDevPath, callback )
	{
		this.getDevPortTable((err, res) => {
			if (err) {
				callback( err );
				return;
			}

			callback( null, res[ portNumberOrDevPath ]);
		});
	}

	getDevPortTable( callback )
	{
		let cmdline = 'v4l2-ctl --list-devices | sed -e  "s/^.*-\\(.*\\)).*$/\\1/; s/\\s*//" -'

		exec( cmdline, (error, stdout, stderr) => {
			if (error) {
				callback( error );
				return;
			}

			if( stdout ) {
				let output = stdout.split("\n").filter(line=>line.length>0);
				if (output.length == 0) {
					callback( 'v4l2 result error.' );
					return;
				}

				let results = {};
				for (var i=0; i<output.length/2; i++) {
					let port = output[i*2];
					let path = output[i*2+1];
					results[port] = path;
					results[path] = port;
				}

				callback( null, results );
				return;
			}
			callback( stderr );
		});
	}

	getDevSerial( devPath, callback )
	{
		if (!devPath) {
			callback('devPath is empty');
			return;
		}

		let cmdline = `udevadm info ${devPath} | awk -F = '/ID_SERIAL=/ {print $2}'`

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

	getPortNumberOfDev( devPath, callback )
	{
		if (!devPath) {
			callback('devPath is empty');
			return;
		}

		let cmdline = `udevadm info ${devPath} | awk -F - '/ID_PATH=/ {print $4}' | awk -F : '{print $2}'`

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
}

module.exports =class V4l2Monitor extends DevQueryClass {
	constructor() 
	{
		super();
		monitor.add( this.onUsbAdded.bind(this) );
		monitor.remove( this.onUsbRemoved.bind(this) );
		this.mapTable = {};
		this.updateDevTable();
		this.eventEmitter = new events.EventEmitter();
	}

	on( eventName, callback)
	{
		this.eventEmitter.on( eventName, callback );
	}

	updateDevTable( callback )
	{
		this.getDevPortTable( (err, res) => {
			if (err) {
				console.log('getDevPortTable has error: ', err);
				callback && callback();
				return;
			}
			this.mapTable = res;
			callback && callback();
		});
	}

	onUsbAdded( device, callback )
	{
		this.updateDevTable( () => {
			let portNumber = device.portNumbers.join('.');
			this.eventEmitter.emit('add', this.mapTable[ portNumber]);
		});
	}

	onUsbRemoved( device, callback )
	{
		let portNumber = device.portNumbers.join('.');
		this.eventEmitter.emit('remove', this.mapTable[ portNumber]);
	}
}



