JSMpeg.Decoder.JsonMsg = (function(){ "use strict";

var JsonMsg = function(options) {
	this.source = null;
	JSMpeg.config.videoMode = options.start;

};

JsonMsg.prototype.write = function(buffer) {
	JSMpeg.infos.reports = JSON.parse(buffer);
	delete JSMpeg.infos.reports.cmd;
	JSMpeg.onHeartbeatReport( JSMpeg.infos.reports );
};

return JsonMsg;

})();
