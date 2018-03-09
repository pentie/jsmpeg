var JSMpeg = 
{
	//======================================================//
	// 	interface 
	//======================================================//

	config: {
		echoResponseTimeout: 3000,
		reconnectInterval: 3000,
		mjpegFrameInterval: 1000,
		mjpegTimeQueLength: 20,
		mpeg1TimeQueLength: 20,
		echoTimeQueLength: 20,
		defaultSourceIndex: 0,
		autoModeSwitch: false,
		upperThreshold: 3000,
		lowerThreshold: 60,
		elementRes: "1280x720",
		enableLog: true
	},

	infos : {
		connectionId: 0,
		videoMode : 'mpeg1',
		mjpegTime : [],
		mpeg1Time : [],
		upstreams : null,
		reports: null
	},

	onSourceConnected: function( source ) {
		this.EmitEvent("jsmpeg:connected", source);
	},
	onHeartbeatReport: function( reports ) {
		this.EmitEvent("jsmpeg:reports", reports);
	},
	onModeSwitched: function( switch_to ) {
		this.EmitEvent("jsmpeg:modeswitch", switch_to);
	},

	echo: function( callback, payload )
	{
		callback = callback? callback : function(res){
			this.log('echo:', res);
		}.bind(this);

		var data = {
			cmd: 'echo',
			timestamp: Date.now(),
			payload: payload? payload : {msg: 'no payload'}
		};
		this.getSources().forEach( function(source) {
			var sourcehost = new URL(source.url);
			sourcehost.protocol = 'http';
			source.jsonPost(sourcehost.href+'manager/echo', data, function(err, res){
				if (err) {
					callback(err);
					return;
				}
				if (res.timestamp) {
					var offset = Date.now() - parseInt(res.timestamp);
					callback( null, offset );
					return;
				}
				callback('unknowErr');
			}, this.config.echoResponseTimeout);
		}.bind(this));
	},

	switchUpstream: function( name, sourceIndex )
	{
		if (!this.infos.upstreams) {
			this.log('has no upstreams');
			return;
		}

		if ( name === undefined ) {
			var activeIndex = -1;
			var newName = null;
			for ( var index in this.infos.upstreams ) {
				var upstream = this.infos.upstreams[ index ]; 
				if ( upstream.active ) {
					activeIndex = index;
				} else {
					if (activeIndex >= 0) {
						newName || (newName = upstream.name);
					}
				}
			}

			if ( name ) {
				this.log('the input upstream name is invalid');
			}

			if ( newName ) {
				name = newName;
			} else {
				name = this.infos.upstreams[0].name;
			}
		}

		var nameValid = false;

		for ( var index in this.infos.upstreams ) {
			var upstream = this.infos.upstreams[ index ]; 

			if ( upstream.name != name ) {
				continue;
			}

			if ( upstream.active ) {
				this.log('no need to change upstream');
				return;
			}

			nameValid = true;
			break;
		}

		var source = this.getSource( sourceIndex );

		if ( !source ) {
			this.log( 'no source found');
		}

		source.send(JSON.stringify({
			handler: 'manager',
			userId: this.userid(),
			cmd: 'switchUpstream',
			name: name
		}));

		if(!this.VideoElement.player.isPlaying) {
			this.VideoElement.onClick();
		}

		return name;
	},

	forceReconnect: function () 
	{
		this.getSources().forEach( function(source) {
			source.forceReconnect = true;
			source.socket.close();
		});
	},

	switchVideoMode: function (mode) 
	{
		mode = mode? mode: ((this.infos.videoMode==='mpeg1')? 'mjpeg' : 'mpeg1');

		this.getSources().forEach( function(source) {
			var req = {
				handler: mode,
				userId: this.userid(),
				cmd: 'active',
				param: true
			};

			switch (mode) {
				case 'mpeg1':
					source.send(JSON.stringify(req));
					break;
				case 'mjpeg':
					source.send(JSON.stringify(req));

					req.handler = 'mpeg1';
					req.param = false;
					source.send(JSON.stringify(req));
					break;
				default:
					this.log('error mode: ', mode);
			}

			this.infos.videoMode = mode;
			this.onModeSwitched(mode);
		}.bind(this));
	},

	//======================================================//
	// 	do not edit the code below
	//======================================================//

	log: function(title, msg)
	{
		this.config.enableLog && console.log(title, msg);
	},

	getSource: function( index )
	{
		var sources = this.getSources();
		if (sources.length === 0) {
			return null; 
		}

		if ( index === undefined ) {
			index = this.config.defaultSourceIndex;
		}

		index = Math.min( index, sources.length -1 );
		index = Math.max( index, 0 );

		return sources[ index ];
	},

	getSources: function () 
	{
		var sources = [];
		for (var index in window.video_objs) {
			sources.push( window.video_objs[index].player.source );
		}
		return sources;
	},

	on_source_opened: function (source) 
	{
		var config = this.config;	
		var infos = this.infos;	

		source.conn_id = Math.floor(Math.random() * 1000);
		infos.connectionId = source.conn_id;
		infos.mjpegTime.length = 0;
		infos.mpeg1Time.length = 0;

		if(this.VideoElement.player.options.autoplay) {
			source.send_cmd_active(true);
		}

		this.onSourceConnected( source );
	},

	on_intra_rendered: function (y, cr, cb, source) 
	{
		if (typeof window.intra_time === 'undefined') {
			window.intra_time = 0;
			window.conn_id = 0;
		}

		var current_connid = source.conn_id;
		var current_time = Date.now();
		var interval_time = current_time - window.intra_time;
		window.intra_time = current_time;

		if (window.conn_id !== current_connid) {
			window.conn_id = current_connid; 
			return;
		}

		var payload = {
			handler: 'mpeg1',
			cmd: 'intra',
			userId: this.userid(),
			intra_crc32 : crc32(cb),
			intra_interval : interval_time,
			close_when_delay : 0
		};

		var timeQue = this.infos.mpeg1Time;
		timeQue.unshift(interval_time);
		if (timeQue.length > this.config.mpeg1TimeQueLength) {
			timeQue.pop();

			if(this.config.autoModeSwitch) {
				var valMax = Math.max.apply(null, timeQue)
				if ( valMax > this.config.upperThreshold) {
					var switch_to = 'mjpeg';
					this.switchVideoMode(switch_to);
				}
			}
		}

		source.send(JSON.stringify(payload));
	},

	on_mjpeg_rendered: function (source, renderTime) 
	{
		if (this.infos.videoMode === 'mjpeg') {
			setTimeout(function(){
				source.send(JSON.stringify({
					userId: this.userid(),
					handler: 'mjpeg',
					cmd: 'interval',
					renderTime: renderTime,
				}));
			}.bind(this), this.config.mjpegFrameInterval);
		}

		var timeQue = this.infos.mjpegTime;
		timeQue.unshift(renderTime);
		if (timeQue.length > this.config.mjpegTimeQueLength) {
			timeQue.pop();

			if(this.config.autoModeSwitch) {
				var valMin = Math.min.apply(null, timeQue)
				if ( valMin < this.config.lowerThreshold) {
					var switch_to = 'mpeg1';
					this.switchVideoMode(switch_to);
				}
			}
		}
	},

	userid: function ()
	{
		function set_cookie(cname,cvalue,exdays)
		{
			var d = new Date();
			d.setTime(d.getTime()+(exdays*24*60*60*1000));
			var expires = "expires="+d.toGMTString();
			document.cookie = cname + "=" + cvalue + "; " + expires;
		}

		function get_cookie(cname)
		{
			var name = cname + "=";
			var ca = document.cookie.split(';');
			for(var i=0; i<ca.length; i++) 
			{
				var c = ca[i].trim();
				if (c.indexOf(name)==0) return c.substring(name.length,c.length);
			}
			return "";
		}

		var id = get_cookie('id');
		if (id === '') {
			id = 'xxyxxyxxyxxyxxyx'.replace(/[xy]/g, function(c) {
				var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
				return v.toString(16);
			});

			set_cookie('id', id, 365);
		}
		return id;
	},

	Player: null,
	VideoElement: null,
	BitBuffer: null,
	Source: {}, 
	Demuxer: {},
	Decoder: {},
	Renderer: {},
	AudioOutput: {}, 

	Init : function(elm, url, config) {
		if( !url ) {
			url = elm.dataset.url;
			if ( !url ) {
				var urlobj = new URL(document.location.href);
				urlobj.protocol = "ws";
				url = urlobj.href
			}
		}
		if( !config ) {
			config = {}
		}
		for (var key in config) {
			if (this.config.hasOwnProperty(key)) {
				this.config[key] = config[key];
			}
		}

		elm.dataset.url = url;
		this.VideoElement = new JSMpeg.VideoElement(elm, this.config.elementRes);
		window.video_objs = [ this.VideoElement ];
	},

	CreateSingleVideo: function(elm, url, res) {
		this.Init(elm, url);
	},
	/*
	CreateVideoElements: function() {
		window.video_objs = [];
		var elements = document.querySelectorAll('.jsmpeg');
		for (var i = 0; i < elements.length; i++) {
			var url = elements[i].dataset.url;

			if (!url) {
				if (document.location.port) {
					url = 'ws://'+document.location.hostname+':'+document.location.port;
				} else {
					url = 'ws://'+document.location.hostname;
				}
			} else if (/^\d+$/.test(url)) {
				url = 'ws://'+document.location.hostname+':'+url;
			}

			elements[i].dataset.url = url;
			var video_obj = new JSMpeg.VideoElement(elements[i]);
			window.video_objs.push(video_obj);
		}
	},
	*/

	Now: function() {
		return window.performance 
			? window.performance.now() / 1000
			: Date.now() / 1000;
	},

	Fill: function(array, value) {
		if (array.fill) {
			array.fill(value);
		}
		else {
			for (var i = 0; i < array.length; i++) {
				array[i] = value;
			}
		}
	},

	EmitEvent: function(name, data) {
		var event = new CustomEvent(name, {detail: data});
		document.dispatchEvent(event);
	},

	/*
	standardDeviation: function (values) {
		var average = function (data) {
			var sum = data.reduce(function (sum, value) { return sum + value; }, 0);
			var avg = sum / data.length;
			return avg;
		};

		var avg = average(values);
		var avgSquareDiff = average(values.map(function (value) {
			var diff = value - avg;
			var sqrDiff = diff * diff;
			return sqrDiff;
		}));

		return Math.ceil(Math.sqrt(avgSquareDiff));
	},
	*/


};
