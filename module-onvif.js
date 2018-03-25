
const onvif = require('node-onvif');

const ONVIF_INTERVAL = 5000;

module.exports = class ScanOnvif
{
	constructor( config, onFoundNewCamera ) 
	{
		this.config = {
			enable: false,
			onvifInterval: ONVIF_INTERVAL, 
			alwaysNewest: true
		};

		if ( config ) {
			this.config.enable = config.enable === true;
			this.config.onvifInterval = config.onvifInterval || ONVIF_INTERVAL;
			this.config.alwaysNewest = config.alwaysNewest || true;
		}

		this.onFoundNewCamera = onFoundNewCamera;
		this.onvifInterval = this.config.onvifInterval;
		this.onvifList = [];
		this.onvifTimerId = null;
	}

	getCmdObj( autoStartIndex, configSrc )
	{
		let cmdObj = {
			sourceName:  this.sourceName
		};

		// equal -1, means the newest discovery one.
		if (autoStartIndex === -1) 
		{
			if (this.onvifList.length) 
			{
				cmdObj.url = this.onvifList[ this.onvifList.length-1 ];
				return cmdObj;
			}
			if (configSrc.length) 
			{
				cmdObj.url = configSrc[0];
				return cmdObj;
			}
			return null;
		}

		let actuallList = this.getSrcList( configSrc );
		let actuallyIndex = Math.min( Math.max(autoStartIndex,0), actuallList.length-1 );

		if (actuallList.length === 0) {
			return null;
		}

		cmdObj.url = actuallList[ actuallyIndex ];
		return cmdObj;
	}

	getSrcList( configSrc )
	{
		 return configSrc.concat( this.onvifList );
	}

	startOnvif()
	{
		if ( ! this.config.enable ) return;

		this.stopOnvif();
		this.onvifTimerId = setInterval(()=>{
			this.onvifScan( (mjpgUrl) => {
				if (this.onvifList.indexOf( mjpgUrl ) >= 0) {
					return;
				}
				this.onvifList.push( mjpgUrl );

				console.log('onvif got: ', mjpgUrl);

				if (this.config.alwaysNewest === true) {
					console.log('force active the newest camera');
					this.onFoundNewCamera( mjpgUrl );
				}

			});
		}, this.config.onvifInterval + 3000);
		console.log('start onvif discovery');
	}

	stopOnvif()
	{
		if ( ! this.config.enable ) return;

		if (this.onvifTimerId) {
			clearInterval( this.onvifTimerId );
			this.onvifTimerId = null;
			console.log('stop onvif discovery');
		}
	}

	onvifScan( callback )
	{
		if ( ! this.config.enable ) return;

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
			scopes: [
				'onvif://www.onvif.org/name/IP_Webcam',
				'onvif://www.onvif.org/type/video_encoder',
		      		'onvif://www.onvif.org/type/audio_encoder',
		      		'onvif://www.onvif.org/hardware/BUILD_608',
		          	'onvif://www.onvif.org/location/global' 
			]}
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

}
