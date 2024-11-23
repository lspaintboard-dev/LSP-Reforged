import { Request, Response } from '../httpserver/handling.js'
import { Server } from '../server/server.js'
import { type Service } from '../service/service.js'
import { Translator } from '../utils/translator.js'
import { v4 as uuidv4 } from 'uuid'
import axios, { type AxiosResponse } from 'axios'
import path from 'path'

interface TokenRequestBody {
	uid: string
	paste: string
}

interface LuoguPasteResponse {
	code?: number
	currentData?: {
		paste?: {
			data?: string
			user?: {
				uid?: number
			}
		}
		user?: {
			registerTime?: number
		}
	}
}

export class AuthService implements Service {
	public tokenCache: Map<number, string>
	private tokenTime: Map<number, number>
	private server: Server | undefined
	private cookieStr: string

	constructor() {
		this.tokenCache = new Map<number, string>()
		this.cookieStr = ''
		this.tokenTime = new Map<number, number>()
	}

	public async onInitialize(
		server: Server,
		root: string,
		apiRoot: string
	): Promise<void> {
		this.server = server
		try {
			;(
				await this.server.getDB().execute('select * from tokens', true)
			).forEach((dat: any) => {
				this.tokenCache.set(dat.uid, dat.token)
			})
			this.cookieStr = `__client_id=${this.server.getConfig(
				'auth.__client_id'
			)}; _uid=${this.server.getConfig('auth._uid')};`
			try {
				await axios.get('https://www.luogu.com/paste?_contentOnly=1', {
					headers: { cookie: this.cookieStr }
				})
			} catch (error) {
				this.server
					.getLogger()
					.critical(
						'Auth',
						Translator.translate('auth.serviceCookieTestException')
					)
				process.exit(1)
			}
		} catch (err) {
			this.server
				.getLogger()
				.critical(
					'Auth',
					Translator.translate('auth.serviceInitializeException')
				)
			process.exit(1)
		}
		const getTokenPath = path.join(apiRoot, 'gettoken')
		server.registerHttpReq(getTokenPath, this.newTokenReqHandler, this)
	}

	public async refreshToken(uid: number): Promise<string> {
		const token: string = uuidv4()
		if (this.tokenCache.has(uid)) {
			await this.server
				?.getDB()
				.execute(`update tokens set token='${token}' where uid=${uid}`, false)
		} else {
			await this.server
				?.getDB()
				.execute(
					`insert into tokens (uid, token) values (${uid}, '${token}')`,
					false
				)
		}
		this.tokenCache.set(uid, token)
		this.tokenTime.set(uid, Date.now())
		return token
	}

	public authToken(uid: number, token: string): boolean {
		return this.tokenCache.get(uid) == token
	}

	public async newTokenReqHandler(
		req: Request,
		res: Response,
		urlParams: Array<string>
	): Promise<number> {
		if (req.getMethod() != 'POST') {
			return 405
		}
		try {
			const obj = req.getBody() as TokenRequestBody
			const uid = parseInt(obj.uid)
			const paste = obj.paste.toString()
			if (!uid || !paste) {
				res.json({
					statusCode: 400,
					data: { errorType: 'auth.illegalRequest' }
				})
				return 400
			}
			if (
				this.tokenTime.has(uid) &&
				Date.now() - this.tokenTime.get(uid)! <
					this.server?.getConfig('auth.tokenCooldownMs')
			) {
				res.json({
					statusCode: 418,
					data: {
						errorType: 'auth.inCooldown',
						message: `${Translator.translate('auth.inCooldown')}: ${
							(this.server?.getConfig('auth.tokenCooldownMs') -
								Date.now() +
								this.tokenTime.get(uid)!) /
							1000.0
						}s left.`
					}
				})
				return 418
			}
			try {
				const result = await this.verifyDataFromLuogu(uid, paste)
				if (result) {
					res.json({
						statusCode: 200,
						data: { token: await this.refreshToken(uid) }
					})
					return 200
				}
				res.json({
					statusCode: 403,
					data: { errorType: 'auth.invalidPasteBoard' }
				})
				return 403
			} catch (err) {
				this.server?.getLogger().error('Auth', err!.toString())
				res.json({
					statusCode: 500,
					data: { errorType: 'unknown.internalServerError' }
				})
				return 500
			}
		} catch {
			const body = req.getBody() as TokenRequestBody
			if (parseInt(body.uid)) this.tokenTime.set(parseInt(body.uid), Date.now())
			res.json({ statusCode: 400, data: { errorType: 'auth.illegalRequest' } })
			return 400
		}
	}

	private async verifyDataFromLuogu(
		uid: number,
		paste: string
	): Promise<boolean> {
		try {
			const resp: AxiosResponse<LuoguPasteResponse> | null = await new Promise(
				(resolve, reject) => {
					axios
						.get(`https://www.luogu.com/paste/${paste}?_contentOnly=1`, {
							headers: { cookie: this.cookieStr }
						})
						.then(value => {
							resolve(value)
						})
						.catch(error => {
							try {
								if (
									error.response.status == 404 ||
									error.response.status == 403
								) {
									resolve(null)
								}
							} catch {
								reject(error)
							}
						})
				}
			)
			const obj: LuoguPasteResponse = resp ? resp.data : { code: 114514 }
			if (obj.code == 114514) return false
			if (
				obj.currentData?.paste?.data ==
					this.server?.getConfig('auth.authString') &&
				obj.currentData?.paste?.user?.uid == uid
			) {
				const resp1 = await axios.get<LuoguPasteResponse>(
					`https://www.luogu.com/user/${uid}?_contentOnly=1`,
					{ headers: { cookie: this.cookieStr } }
				)
				const obj1 = resp1.data
				if (
					obj1.currentData?.user?.registerTime != undefined &&
					obj1.currentData.user.registerTime <=
						this.server?.getConfig('auth.registerBeforeS')
				) {
					return true
				} else return false
			} else {
				return false
			}
		} catch (error) {
			throw Translator.translate('auth.luoguException')
		}
	}
}
