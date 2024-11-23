import { ServerResponse, IncomingMessage } from 'http'
import { Translator } from '../utils/translator.js'
import * as url from 'url'

export class Request {
	private request: IncomingMessage
	private headers: Map<string, any>
	private data: any
	private transmitted: boolean = false
	private method: string
	private pathname
	private params

	constructor(request: IncomingMessage) {
		this.request = request
		this.headers = new Map<string, any>()
		this.method = request.method!
		this.pathname = url.parse(request.url!).pathname
		this.params = url.parse(request.url!, true).query
		for (let i = 0; i < request.rawHeaders.length; i += 2) {
			this.headers.set(
				request.rawHeaders[i].toLowerCase(),
				request.rawHeaders[i + 1]
			)
		}
	}

	public async getData() {
		this.data = await new Promise((resolve, reject) => {
			let _data: any = ''
			this.request.on('data', data => {
				_data += data
			})
			this.request.on('end', () => {
				this.transmitted = true
				try {
					resolve(JSON.parse(_data))
				} catch (err) {
					reject(
						Translator.translate('httpserver.request.notAValidJSONException')
					)
				}
				resolve(_data)
			})
			this.request.on('error', () => {
				reject(Translator.translate('httpserver.request.receiveException'))
			})
		})
	}

	public getHeader(K: string): any {
		return this.headers.get(K)
	}

	public getBody(): object {
		if (this.transmitted) return this.data
		else {
			throw Translator.translate(
				'httpserver.request.transmissionNotEndedException'
			)
		}
	}

	public getMethod(): string {
		return this.method
	}

	public getPathname() {
		return this.pathname
	}

	public getParams() {
		return this.params
	}
}

export class Response {
	private jsonResponse: number = -1
	private response: ServerResponse
	private payload: string = ''
	private payloadArrayBuf: Uint8Array | null = null

	constructor(response: ServerResponse) {
		this.response = response
	}

	public setHeader(K: string, V: any) {
		K = K.toLowerCase()
		if (K == 'content-type' && this.jsonResponse == 1) {
			throw Translator.translate('httpserver.response.contentTypeException')
		}
		this.response.setHeader(K, V)
	}

	public json(json: object) {
		if (this.jsonResponse == 0) {
			throw Translator.translate('httpserver.response.contentTypeException')
		}
		if (this.jsonResponse == 1) {
			throw Translator.translate('httpserver.response.alreadyJsonedException')
		}
		this.setHeader('content-type', 'application/json')
		this.payload = JSON.stringify(json)
		this.jsonResponse = 1
	}

	public write(content: any) {
		if (this.jsonResponse == 1) {
			throw Translator.translate('httpserver.response.contentTypeException')
		}
		this.jsonResponse = 0
		this.payload += content
	}

	public send() {
		if (this.payloadArrayBuf != null) {
			this.response.write(this.payloadArrayBuf)
		} else this.response.write(this.payload)
	}

	public async sendArrayBuffer(buf: Uint8Array) {
		this.response.setHeader('content-type', 'image/gif')
		this.payloadArrayBuf = buf
	}
}
