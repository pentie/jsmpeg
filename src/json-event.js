JSMpeg.Decoder.JsonMsg = (function(){ "use strict";

var JsonMsg = function(options) {
	this.source = null;
	JSMpeg.config.videoMode = options.start;

};

JsonMsg.prototype.write = function(buffer) {
	JSMpeg.infos.reports = JSON.parse(buffer);
	delete JSMpeg.infos.reports.cmd;

	if (typeof event_infos_callback === "function") { 

		var oldMode = JSMpeg.config.videoMode;

		event_infos_callback (JSMpeg.infos, JSMpeg.config);

		if (JSMpeg.config.videoMode !== oldMode) {
			JSMpeg.switch_video_mode(JSMpeg.config.videoMode);
		}
	}
};

return JsonMsg;

})();
