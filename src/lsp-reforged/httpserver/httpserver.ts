import { type HandlerFunction, Router } from './router.js'
import * as http from 'http'
import * as url from 'url'
import { Logger } from '../utils/logger.js'
import { Request, Response } from './handling.js'

export class HttpServer {
	private router: Router = new Router()
	private server: http.Server

	constructor(logger: Logger) {
		// 可能不行async
		this.server = http.createServer(async (req, res) => {
			let request = new Request(req)
			let response = new Response(res)
			logger.info('HttpServer', `${req.method} ${request.getPathname()}`)
			res.setHeader('Access-Control-Allow-Origin', '*')
			if (req.method == 'OPTIONS') {
				res.setHeader(
					'access-control-allow-headers',
					req.headers['access-control-request-headers']!
				)
				res.end()
				return
			}
			if (req.method == 'POST') {
				try {
					await request.getData()
				} catch (err) {
					response.json({ statusCode: 400, data: { errorType: err } })
					res.statusCode = 400
					res.end()
					logger.info(
						'HttpServer',
						`${req.method} ${request.getPathname()}: 400`
					)
					return
				}
			}
			const pathname = request.getPathname()
			this.router.route(request, response, logger).then(code => {
				logger.info('HttpServer', `${req.method} ${pathname}: ${code}`)
				res.statusCode = code!
				res.writeHead(code!)
				response.send()
				res.end()
			})
		})
	}

	public listen(port: number) {
		this.server.listen(port, '0.0.0.0')
	}

	public stop() {
		this.server.close()
	}

	public registerHandler(
		path: string,
		handler: HandlerFunction,
		originThis: any
	) {
		this.router.register(path, handler, originThis)
	}
}
