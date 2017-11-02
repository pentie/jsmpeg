var JSMpeg = 
{
	config: {
		mjpegFrameInterval: 1000,
		videoMode : 'mpeg1',
		mjpegTimeQueLength: 50,
		mpeg1TimeQueLength: 50,
		connectionId: 0
	},

	infos : {
		mjpegTime : [],
		mpeg1Time : [],
		reports: null

	},

	switch_video_mode: function (mode) 
	{
		for (var index in window.video_objs) {
			var source = window.video_objs[index].player.source; 

			var req = {
				handler: mode,
				userId: JSMpeg.userid(),
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
					console.log('error mode: ', mode);
			}
		}
	},

	on_source_opened: function (source) 
	{
		source.conn_id = Math.floor(Math.random() * 1000);
		JSMpeg.config.connectionId = source.conn_id;

		source.send(JSON.stringify({
			handler: JSMpeg.config.videoMode,
			userId: JSMpeg.userid(),
			cmd: 'active',
			param: true
		}));

		console.log('source opened: ', source.conn_id);
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
			userId: JSMpeg.userid(),
			intra_crc32 : crc32(cb),
			intra_interval : interval_time,
			close_when_delay : 0
		};

		var timeQue = JSMpeg.infos.mpeg1Time;
		timeQue.unshift(interval_time);
		if (timeQue.length > JSMpeg.config.mpeg1TimeQueLength) {
			timeQue.pop();
		}

		source.send(JSON.stringify(payload));
		console.log('intra_frame_calback:', payload.intra_crc32, payload.intra_interval);
	},

	on_mjpeg_rendered: function (source, renderTime) 
	{
		if (JSMpeg.config.videoMode === 'mjpeg') {
			setTimeout(function(){
				source.send(JSON.stringify({
					userId: JSMpeg.userid(),
					handler: 'mjpeg',
					cmd: 'interval',
					renderTime: renderTime,
				}));
			}, JSMpeg.config.mjpegFrameInterval);
		}

		var timeQue = JSMpeg.infos.mjpegTime;
		timeQue.unshift(renderTime);
		if (timeQue.length > JSMpeg.config.mjpegTimeQueLength) {
			timeQue.pop();
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
	}
};

// Automatically create players for all found <div class="jsmpeg"/> elements.
if (document.readyState === 'complete') {
	JSMpeg.CreateVideoElements();
}
else {
	document.addEventListener('DOMContentLoaded', JSMpeg.CreateVideoElements);
}

