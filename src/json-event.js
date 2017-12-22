JSMpeg.Decoder.JsonMsg = (function(){ "use strict";

var JsonMsg = function(options) {
	this.source = null;
	JSMpeg.config.videoMode = options.start;

};

JsonMsg.prototype.write = function(buffer) {
	JSMpeg.infos.reports = JSON.parse(buffer);
	var reports = JSMpeg.infos.reports; 	

	if (reports.cmd == 'switchUpstream') {
		console.log(reports);
		return;
	}

	delete reports.cmd;
	JSMpeg.infos.upstreams = reports.nodes[ reports.nodes.length - 1 ].upstreams; 
	JSMpeg.onHeartbeatReport( reports );
};

return JsonMsg;

})();
