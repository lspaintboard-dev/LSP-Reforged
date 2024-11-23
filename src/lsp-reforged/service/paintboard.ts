import path from 'path'
import { Request, Response } from '../httpserver/handling.js'
import { Server } from '../server/server.js'
import type { Service } from './service.js'
import { Translator } from '../utils/translator.js'
import { Permission } from '../permission/permission.js'
import fs from 'fs-extra'
import * as WebSocket from 'ws'
import * as https from 'https'
import * as async from 'async'

class Color {
	public r: number = 0
	public g: number = 0
	public b: number = 0

	constructor(color: number) {
		this.setByHex(('00000' + color.toString(16)).substr(-6))
	}

	public static toHexByte(num: number): string {
		return num.toString(16).length == 2
			? num.toString(16)
			: '0' + num.toString(16)
	}

	public toHex(): string {
		return (
			Color.toHexByte(this.r) +
			Color.toHexByte(this.g) +
			Color.toHexByte(this.b)
		)
	}

	public setByHex(colorHex: string): void {
		this.r = parseInt(colorHex.slice(0, 2), 16)
		this.g = parseInt(colorHex.slice(2, 4), 16)
		this.b = parseInt(colorHex.slice(4, 6), 16)
	}

	public set(color: number) {
		this.setByHex(('00000' + color.toString(16)).substr(-6))
	}
}

class Pixel {
	public readonly x: number = 0
	public readonly y: number = 0
	public color: Color = new Color(0x000000)

	constructor(x: number, y: number, color: Color) {
		this.x = x
		this.y = y
		this.color = color
	}
}

class PaintBoard {
	private readonly width: number = 0
	private readonly height: number = 0
	private boardArray: Array<Array<Pixel>> = []
	private boardArrayCache: Uint8Array = new Uint8Array()

	constructor(
		width: number,
		height: number,
		loadFromString: boolean,
		defaultColor: number = 0xaaaaaa,
		boardString: string = ''
	) {
		this.width = width
		this.height = height
		this.boardArrayCache = new Uint8Array(this.width * this.height * 3)
		const _defaultColor: Color = new Color(defaultColor) // 切记不要用这个初始化 Pixel，一定要 new 一个
		if (loadFromString) {
			for (let y = 0; y < this.height; y++) {
				let _ = new Array<Pixel>()
				for (let x = 0; x < this.width; x++) {
					let _color = new Color(
						parseInt(
							boardString.slice(
								y * this.width * 6 + x * 6,
								y * this.width * 6 + x * 6 + 6
							),
							16
						)
					)
					_.push(new Pixel(x, y, _color))
					this.boardArrayCache[y * this.width * 3 + x * 3] = _color.r
					this.boardArrayCache[y * this.width * 3 + x * 3 + 1] = _color.g
					this.boardArrayCache[y * this.width * 3 + x * 3 + 2] = _color.b
				}
				this.boardArray.push(_)
			}
		} else {
			for (let y = 0; y < this.height; y++) {
				let _ = new Array<Pixel>()
				for (let x = 0; x < this.width; x++) {
					_.push(new Pixel(x, y, new Color(defaultColor)))
					this.boardArrayCache[y * this.width * 3 + x * 3] = _defaultColor.r
					this.boardArrayCache[y * this.width * 3 + x * 3 + 1] = _defaultColor.g
					this.boardArrayCache[y * this.width * 3 + x * 3 + 2] = _defaultColor.b
				}
				this.boardArray.push(_)
			}
		}
	}

	public getBoard(): Uint8Array {
		return this.boardArrayCache
	}

	public getBoardString(): string {
		let result = ''
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				result += this.boardArray[y][x].color.toHex()
			}
		}
		return result
	}

	public setPixel(x: number, y: number, color: number) {
		this.boardArray[y][x].color.set(color)
		this.boardArrayCache[y * this.width * 3 + x * 3] =
			this.boardArray[y][x].color.r
		this.boardArrayCache[y * this.width * 3 + x * 3 + 1] =
			this.boardArray[y][x].color.g
		this.boardArrayCache[y * this.width * 3 + x * 3 + 2] =
			this.boardArray[y][x].color.b
	}
}

interface PaintQueueData {
	xPos: number
	yPos: number
	color: number
}

interface PaintWSMessage {
	clientId: WebSocket.WebSocket
	type: number
	data: Uint8Array
}

export class PaintboardService implements Service {
	private server: Server | undefined
	private cooldownCache: Map<number, number>
	private paintboard: PaintBoard
	private width: number = 0
	private height: number = 0
	private cooldown: number = 0
	private websocketServer: WebSocket.WebSocketServer | undefined
	private paintReqPerSec: number = 0
	private paintReqPerSecAvg: number = 0
	private paintReqPerSecMax: number = 0
	private paintReqPerSecMin: number = 10000
	private bandSpeed: number = 0
	private paintQueue: async.QueueObject<PaintQueueData>

	// 添加统计计数器
	private wsRequestCount: number = 0
	private wsSuccessCount: number = 0
	private getBoardCount: number = 0
	private lastStatsTime: number = Date.now()

	constructor() {
		this.cooldownCache = new Map<number, number>()
		this.paintboard = new PaintBoard(0, 0, false)
		this.paintQueue = async.queue(async (data: PaintQueueData) => {
			const xPos: number = data.xPos
			const yPos: number = data.yPos
			const color: number = data.color
			const broadcast: Uint8Array | null = new Uint8Array([
				0xfa,
				xPos % 256,
				Math.floor(xPos / 256),
				yPos % 256,
				Math.floor(yPos / 256),
				(color & 0xff0000) / 0x10000,
				(color & 0x00ff00) / 0x100,
				color & 0x0000ff
			])
			this.websocketServer?.clients.forEach(client => {
				if (client.readyState === WebSocket.WebSocket.OPEN) {
					try {
						client.send(broadcast!)
					} catch (err) {
						client.close()
					}
				} else if (client.readyState !== WebSocket.WebSocket.CONNECTING) {
					client.close()
				}
			})
		})
	}

	private processWsMessage = async (msg: PaintWSMessage) => {
		const { clientId, type, data } = msg

		switch (type) {
			case 0xfb: // pong
				break

			case 0xfe: {
				// paint
				this.wsRequestCount++ // 增加请求计数

				const xPos = data[1] * 256 + data[0]
				const yPos = data[3] * 256 + data[2]
				const color = (data[4] << 16) + (data[5] << 8) + data[6]
				const uid = (data[7] << 16) + (data[8] << 8) + data[9]
				const token = Array.from(data.slice(10, 26))
					.map(b => b.toString(16).padStart(2, '0'))
					.join('')
					.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
				const id = data[26] + data[27] * 256

				if (
					xPos >= this.width ||
					xPos < 0 ||
					yPos >= this.height ||
					yPos < 0 ||
					!Number.isInteger(uid) ||
					uid < 1
				) {
					clientId.send(
						new Uint8Array([0xff, id % 256, Math.floor(id / 256), 0xec])
					)
					return
				}

				// Check cooldown & permissions
				if (
					!this.cooldownCache.has(uid) ||
					Date.now() - this.cooldownCache.get(uid)! >= this.cooldown ||
					this.server!.getPermissionService().hasPermission(
						uid,
						Permission.PERM_ROOT
					)
				) {
					if (this.server!.getAuthService().authToken(uid, token)) {
						if (
							this.server!.getPermissionService().hasPermission(
								uid,
								Permission.PERM_PAINT
							)
						) {
							this.wsSuccessCount++ // 增加成功计数
							this.paintboard.setPixel(xPos, yPos, color)
							this.paintQueue.push({ xPos, yPos, color })
							clientId.send(
								new Uint8Array([0xff, id % 256, Math.floor(id / 256), 0xef])
							)
							this.cooldownCache.set(uid, Date.now())
							return
						} else {
							clientId.send(
								new Uint8Array([0xff, id % 256, Math.floor(id / 256), 0xeb])
							)
							return
						}
					} else {
						clientId.send(
							new Uint8Array([0xff, id % 256, Math.floor(id / 256), 0xed])
						)
						return
					}
				} else {
					clientId.send(
						new Uint8Array([0xff, id % 256, Math.floor(id / 256), 0xee])
					)
					return
				}
			}
		}
	}

	public async onInitialize(
		server: Server,
		root: string,
		apiRoot: string
	): Promise<void> {
		this.server = server
		if (server.getConfig('paintboard.resetBoard')) {
			this.paintboard = new PaintBoard(
				server.getConfig('paintboard.width'),
				server.getConfig('paintboard.height'),
				false,
				0xaaaaaa
			)
		} else {
			this.paintboard = new PaintBoard(
				server.getConfig('paintboard.width'),
				server.getConfig('paintboard.height'),
				true,
				0xaaaaaa,
				(await server.getDB().execute('select * from board', true))[0].board
			)
		}
		this.width = server.getConfig('paintboard.width')
		this.height = server.getConfig('paintboard.height')
		this.cooldown = server.getConfig('paintboard.cooldown')
		const getBoardPath = path.join(apiRoot, 'getboard')
		this.server.registerHttpReq(getBoardPath, this.getBoardReqHandler, this)
		this.server.getBus().emit('startListen')
		this.websocketServer = await new Promise(async (resolve, reject) => {
			const wsServer: WebSocket.WebSocketServer = await new Promise(
				(resolve, reject) => {
					if (server.getConfig('global.wsUseTLS')) {
						const cert = fs.readFileSync(
							server
								.getConfig('global.certPath')
								.replaceAll(
									'${WORKSPACE}',
									server.getConfig('global.workspace')
								)
						)
						const key = fs.readFileSync(
							server
								.getConfig('global.keyPath')
								.replaceAll(
									'${WORKSPACE}',
									server.getConfig('global.workspace')
								)
						)
						const opts = {
							cert: cert,
							key: key,
							path: path.join(apiRoot, 'ws')
						}
						const httpsServer = https.createServer(opts)
						httpsServer.listen(server.getConfig('global.wsPort'))
						server.getBus().on('stop', () => {
							httpsServer.close()
						})
						resolve(new WebSocket.WebSocketServer({ server: httpsServer }))
					} else {
						const _ = new WebSocket.WebSocketServer({
							port: server.getConfig('global.wsPort')
						})
						server.getBus().on('stop', () => {
							_.close()
						})
						resolve(_)
					}
				}
			)
			wsServer.on('connection', (ws, req) => {
				server
					.getLogger()
					.info(
						'Paintboard',
						`paintboard.getWebsocketConnection: ${req.connection.remoteAddress}`
					)
				ws.on('message', async msg => {
					const data = new Uint8Array(msg as Buffer)
					await this.processWsMessage({
						clientId: ws,
						type: data[0],
						data: data.slice(1)
					})
				})
				ws.on('close', function () {
					wsServer.clients.delete(ws)
				})
				ws.on('error', function () {
					ws.close()
					wsServer.clients.delete(ws)
				})
			})
			wsServer.on('listening', () => {
				resolve(wsServer)
			})

			wsServer.on('error', error => {
				reject(error)
			})
			resolve(wsServer)
		})
		this.server.getBus().on('stop', async () => {
			await this.server
				?.getDB()
				.execute(
					`update board set board = '${this.paintboard.getBoardString()}'`,
					false
				)
			this.server?.getBus().emit('stopDB')
		})
		setInterval(() => {
			if (this.paintReqPerSecAvg == 0)
				this.paintReqPerSecAvg = this.paintReqPerSec
			this.paintReqPerSecMax = Math.max(
				this.paintReqPerSecMax,
				this.paintReqPerSec
			)
			this.paintReqPerSecMin = Math.max(
				this.paintReqPerSecMin,
				this.paintReqPerSec
			)
			this.paintReqPerSecAvg =
				this.paintReqPerSecAvg * 0.9 + this.paintReqPerSec * 0.1
			this.server!.getLogger().info(
				'Paintboard',
				`Lst/Avg/Min/Max: ${this.paintReqPerSec}/${this.paintReqPerSecAvg}/${this.paintReqPerSecMax}/${this.paintReqPerSecMin}`
			)
			this.server!.getLogger().info(
				'Paintboard',
				`BandSpeed: ${this.bandSpeed / 1024 / 1024} Mbps`
			)
			this.paintReqPerSec = 0
			this.bandSpeed = 0
		}, 1000)

		setInterval(() => {
			this.websocketServer?.clients.forEach(client => {
				if (client.readyState === WebSocket.WebSocket.OPEN) {
					// 修改这里
					client.send(new Uint8Array([0xfc]))
				}
			})
		}, 30000)

		// 添加统计输出定时器
		setInterval(() => {
			const now = Date.now()
			const elapsed = (now - this.lastStatsTime) / 1000 // 转换为秒

			this.server
				?.getLogger()
				.warn(
					'Paintboard Stats',
					`WS Paint Requests/sec: ${(this.wsRequestCount / elapsed).toFixed(
						2
					)}, ` +
						`Successful/sec: ${(this.wsSuccessCount / elapsed).toFixed(2)}, ` +
						`GetBoard/sec: ${(this.getBoardCount / elapsed).toFixed(2)}`
				)

			// 重置计数器
			this.wsRequestCount = 0
			this.wsSuccessCount = 0
			this.getBoardCount = 0
			this.lastStatsTime = now
		}, 5000)
	}

	// 移除paintReqHandler方法

	// 保留getBoardReqHandler方法
	public async getBoardReqHandler(
		req: Request,
		res: Response,
		urlParams: Array<string>
	): Promise<number> {
		if (req.getMethod() != 'GET') {
			return 405
		}

		this.getBoardCount++ // 增加 getBoard 请求计数

		const _: Uint8Array = this.paintboard.getBoard()
		this.bandSpeed += 1.8 * 1024 * 1024
		return res
			.sendArrayBuffer(_)
			.then(() => {
				return 200
			})
			.catch((reason: any) => {
				this.server?.getLogger().error('Paintboard', reason!.toString())
				res.json({
					statusCode: 500,
					data: { errorType: 'unknown.internalServerError' }
				})
				return 500
			})
	}
}
