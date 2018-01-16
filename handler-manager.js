
module.exports = class ManagerHandler 
{
	constructor(env) 
	{
		this.handlerName = 'manager';
		this.nodeId = env.get('nodeId');
		this.config = env.get('getConfig')();
		this.findClient = env.get('findClient');
		this.eachClient = env.get('eachClient');
		this.defaultUpstream = env.get('defaultUpstream');
		this.switchUpstream= env.get('switchUpstream');
		this.upstreamSocket = null;
		this.isCenter = env.get('isCenter');
		this.handlerInfos = env.get('handlerInfos');
		this.sourcerInfos = env.get('sourcerInfos');
		this.activeSource = env.get('activeSource');
		this.isCenter && setInterval(this.heartbeat.bind(this), 1000);
		this.edgeNodes = [];
	}

	http( req, res )
	{
		res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
		res.header('Access-Control-Allow-Headers', 'Content-Type');
		res.header('Access-Control-Allow-Origin', '*');
		res.json(req.body);
	}

	heartbeat() 
	{
		this.downstream( JSON.stringify({
			cmd: 'report',
			nodes: [ this.handlerInfos() ],
			edgeNodes: this.edgeNodes
		}));

		this.edgeNodes.length = 0;
	}

	infos () 
	{
		var count = 0;
		this.eachClient(function each(socket){
			socket.isNode && count++;
		});

		return {
			upstreamNodeId: this.upstreamNodeId,
			downstreamNodeCount: count
		};
	}

	onUpConnect( client ) 
	{
		this.upstreamSocket = client.socket;

		client.socket.send(JSON.stringify({
			handler: this.handlerName,
			userId: this.nodeId,
			cmd: 'getNodeId',
			back: this.nodeId
		}));
	}

	onUpResponseTrans( res, client ) 
	{
		switch (res.cmd) {
			case 'getNodeId':
				if (res.to === this.nodeId) {
					this.upstreamNodeId = res.nodeId;
				}
				return null;

			case 'report':
				let infos = this.handlerInfos();
				infos.upstreamName = client.config.name;
				infos.upstreams.forEach( function( config ) {
					config.active = (config.name == infos.upstreamName);
				});

				res.nodes.push(infos);

				client.socket.send( JSON.stringify({
					handler: this.handlerName,
					userId: this.nodeId,
					cmd: 'report',
					to: 'center',
					infos: infos
				}));

				return res;

			default:
		}

		return res;
	}

	onUpResponse( chunk, client ) 
	{
		let res = null;
		try {
			res = JSON.parse(chunk);
		} catch (e) {}

		if (res === null) {
			return;
		}

		let newRes = this.onUpResponseTrans(res, client);
		if (newRes === null) {
			return;
		}

		this.downstream(JSON.stringify(newRes), client.downClients );
	}

	downstream (chunk, downClients ) 
	{
		this.eachClient(function each(client) {
			client.send(chunk);
		}, downClients);
	}

	onDownConnect( socket )
	{
		this.switchUpstream( socket );
	}

	onDownRequest (socket, req) 
	{
		if (req.to === undefined) {
			req.to = this.nodeId;
		}

		if (req.to === 'center') {
			if (this.isCenter) {
				req.to = this.nodeId;
			}
		}

		if (req.to !== this.nodeId) {
			if (typeof req.crumbs === 'undefined') {
				req.crumbs = [];
			}
			req.crumbs.push(req.userId);
			req.userId = this.nodeId;
			this.upstreamSocket.send(JSON.stringify(req));
			return;
		}

		switch (req.cmd) {
			case 'switchUpstreamByUuid':
				if (!this.accessValid(req)) {
					break;
				}

				let targetSocket = this.findClient( function(socket){
					return socket.uuid == req.uuid;
				});

				let resStatus = 'error';
				if (targetSocket) {
					this.switchUpstream( targetSocket, req.name );
					resStatus = 'ok';
				}

				socket.send(JSON.stringify({
					status: resStatus,
					cmd: req.cmd, 
					nodeId: this.nodeId
				}));
				break;

			case 'switchUpstream':
				console.log(req);
				this.switchUpstream( socket, req.name );
				socket.send(JSON.stringify({
					status: 'ok',
					cmd: req.cmd, 
					nodeId: this.nodeId
				}));
				break;

			case 'defaultUpstream':
				if (!this.accessValid(req)) {
					break;
				}
				this.defaultUpstream( req.name );
				socket.send(JSON.stringify({
					status: 'ok',
					cmd: req.cmd, 
					nodeId: this.nodeId
				}));
				break;

			case 'getNodeId':
				let res = {
					status: 'ok',
					cmd: req.cmd, 
					nodeId: this.nodeId
				};
				if (req.back) {
					res.to = req.back;
				}
				socket.isNode = true;
				socket.send(JSON.stringify(res));
				break;

			case 'report':
				this.edgeNodes.push(req.infos);
				break;

			case 'getSourceList':
				if (!this.accessValid(req)) {
					break;
				}

				socket.send(JSON.stringify({
					status: 'ok',
					cmd: req.cmd, 
					nodeId: this.nodeId,
					list:  this.sourcerInfos(),
				}));
				break;

			case 'selectSource':
				console.log('selectSource', req);
				if (!this.accessValid(req)) {
					break;
				}

				this.activeSource( req, (cmdline) => {
					if (cmdline === null) {
						console.log('source start error: parma error');
						return;
					}
					console.log('selectSource', cmdline);
					socket.send(JSON.stringify({
						status: 'ok',
						cmd: req.cmd, 
						nodeId: this.nodeId,
						cmdline: cmdline
					}));
				});
				break;

			default:
		}
	}

	accessValid( req ) 
	{
		return true;
	}
};

