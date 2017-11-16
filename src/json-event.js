JSMpeg.Decoder.JsonMsg = (function(){ "use strict";

var JsonMsg = function(options) {
	this.source = null;
	JSMpeg.config.videoMode = options.start;

};

JsonMsg.prototype.write = function(buffer) {
	JSMpeg.infos.reports = JSON.parse(buffer);
	delete JSMpeg.infos.reports.cmd;

	this.echoCmd( JSMpeg.infos.reports.nodes );

	if (typeof event_infos_callback === "function") { 

		var oldMode = JSMpeg.config.videoMode;

		event_infos_callback (JSMpeg.infos, JSMpeg.config);

		if (JSMpeg.config.videoMode !== oldMode) {
			JSMpeg.switch_video_mode(JSMpeg.config.videoMode);
		}

		if (JSMpeg.config.connectionId === 0) {
			this.source.forceReconnect = true;
			this.source.socket.close();
		}
	}
};

JsonMsg.prototype.echoCmd = function( nodes ) 
{
	var lastNode = nodes[nodes.length -1];
	var report = {
		nodeId: lastNode.nodeId,
		timestamp: lastNode.timestamp
	}
	var reqTimestamp = Date.now();
	this.ajaxPost('/manager/echo', report, function(data){
		var res = null;
		try {
			res = JSON.parse(data);
		} catch (e) {}

		if (res === null) {
			return;
		}
		
		if (res.status !== 'ok') return;

		var echoTime = {
			server2Client: res.clientEcho,
			client2Server: Date.now() - reqTimestamp
		};

		var timeQue = JSMpeg.infos.echoTime;
		timeQue.unshift( echoTime );
		if (timeQue.length > JSMpeg.config.echoTimeQueLength) {
			timeQue.pop();
		}
	});
};

JsonMsg.prototype.ajaxPost = function( url, data, callback ) 
{
	var http = new XMLHttpRequest();
	http.open('POST', url, true);
	http.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	http.send(JSON.stringify(data));
	http.onload = function() {
		callback(http.responseText, http.status);
	};
};


return JsonMsg;

})();
