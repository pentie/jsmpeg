JSMpeg.Decoder.JsonMsg = (function(){ "use strict";

var JsonMsg = function(options) {
	this.source = null;
	JSMpeg.config.videoMode = options.start;

};

JsonMsg.prototype.write = function(buffer) {
	var infos = JSON.parse(buffer);
	console.log(infos);
};

return JsonMsg;

})();
