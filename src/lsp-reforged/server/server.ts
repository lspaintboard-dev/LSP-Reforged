import * as utils from '../utils/utils.js'
import type { Service } from '../service/service.js'
import { EventEmitter } from 'events'
import { Config } from '../config/config.js'
import { Translator } from '../utils/translator.js'
import { DBService } from '../service/db.js'
import { PermissionService } from '../permission/permission.js'
import { AuthService } from '../auth/auth.js'
import { HttpServer } from '../httpserver/httpserver.js'
import type { HandlerFunction } from '../httpserver/router.js'
import { PaintboardService } from '../service/paintboard.js'

export class Server {
	private logger: utils.Logger
	private services: Map<string, Service>
	private bus: EventEmitter
	private config: Config
	private db: DBService
	private permissionService: PermissionService
	private authService: AuthService
	private httpServer: HttpServer
	private paintboardService: PaintboardService

	constructor(config: Config, db: DBService) {
		this.bus = new EventEmitter()
		this.config = config
		this.logger = new utils.Logger(
			config.getConfig('logging.logLevel'),
			config.getConfig('logging.logIntoConsole'),
			config.getConfig('logging.logIntoFile'),
			config
				.getConfig('logging.logPath')
				.replaceAll('${WORKSPACE}', config.getConfig('global.workspace'))
		)
		this.services = new Map<string, Service>()
		this.db = db
		this.permissionService = new PermissionService()
		this.authService = new AuthService()
		this.paintboardService = new PaintboardService()
		this.db.onInitialize(this, '/db', '/api/db').then(() => {
			this.permissionService
				.onInitialize(this, '/permission', '/api/permission')
				.then(() => {
					this.authService.onInitialize(this, '/auth', '/api/auth').then(() => {
						this.paintboardService.onInitialize(this, '/', '/api/paintboard')
					})
				})
		})
		this.httpServer = new HttpServer(this.logger)
	}

	public getLogger(): utils.Logger {
		return this.logger
	}

	public getService(key: string): Service | undefined {
		if (this.services.has(key)) {
			return this.services.get(key)
		}
		this.getLogger().error(
			'Server',
			Translator.translate('server.serviceNotFoundException') + `: ${key}`
		)
		return undefined
	}

	public getConfig(key?: string): any {
		return this.config.getConfig(key)
	}

	public saveConfig(): void {
		this.config.save()
	}

	public getBus(): EventEmitter {
		return this.bus
	}

	public getDB(): DBService {
		return this.db
	}

	public getPermissionService(): PermissionService {
		return this.permissionService
	}

	public getAuthService(): AuthService {
		return this.authService
	}

	public registerHttpReq(
		path: string,
		handler: HandlerFunction,
		originThis: any
	) {
		this.httpServer.registerHandler(path, handler, originThis)
	}

	public async addService(
		key: string,
		service: Service,
		root: string,
		rootApi: string
	): Promise<boolean> {
		if (this.services.has(key)) {
			this.getLogger().error(
				'Server',
				Translator.translate('server.serviceAlreadyHaveException') + `: ${key}`
			)
			return false
		}
		try {
			this.services.set(key, service)
			await service.onInitialize(this, root, rootApi)
			return true
		} catch (err) {
			this.getLogger().error(
				'Server',
				Translator.translate('server.serviceInitializeException') + `: ${key}`
			)
			return false
		}
	}

	public run(): void {
		this.getLogger().warn(
			'Server',
			Translator.translate('server.startingMessage')
		)
		this.getBus().on('startListen', () => {
			this.httpServer.listen(this.getConfig('global.port'))
			this.getLogger().warn(
				'Server',
				Translator.translate('server.startedMessage')
			)
		})
	}

	public stop(): void {
		this.getLogger().warn('Server', Translator.translate('server.stopMessage'))
		this.config.save()
		this.httpServer.stop()
		this.bus.emit('stop')
	}
}
