var JSMpeg = 
{
	config: {
		mjpeg_frame_interval: 1000,
	},

	get_analytics: function()
	{

	},

	switch_video_mode: function (mode) 
	{
		for (var index in window.video_objs) {
			var source = window.video_objs[index].player.source; 

			var req_template = {
				handler: mode,
				user_id: userid(),
				cmd: 'active',
				param: true
			};

			switch (mode) {
				case 'mpeg1':
					source.send(JSON.stringify(req_template));
					window.mjpeg_enabled = false;
					break;
				case 'mjpeg':
					source.send(JSON.stringify(req_template));
					window.mjpeg_enabled = true;

					req_template.handler = 'mpeg1';
					req_template.param = false;
					source.send(JSON.stringify(req_template));
					break;
				default:
					console.log('error mode: ', mode);
			}
		}
	},

	on_source_opened: function (source) 
	{
		source.conn_id = Math.floor(Math.random() * 1000);
		window.mjpeg_enabled = source.options.start === 'mjpeg';

		source.send(JSON.stringify({
			handler: source.options.start,
			user_id: userid(),
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
			user_id: userid(),
			intra_crc32 : crc32(cb),
			intra_interval : interval_time,
			close_when_delay : 0
		};

		source.send(JSON.stringify(payload));
		console.log('intra_frame_calback:', payload.intra_crc32, payload.intra_interval);
	},

	on_mjpeg_rendered: function (source, renderTime) 
	{
		if (window.mjpeg_enabled) {
			setTimeout(function(){
				source.send(JSON.stringify({
					user_id: userid(),
					handler: 'mjpeg',
					cmd: 'interval',
					renderTime: renderTime,
				}));
			}, JSMpeg.config.mjpeg_frame_interval);
		}
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

