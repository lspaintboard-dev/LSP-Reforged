import { Server } from '../server/server.js'

export interface Service {
	onInitialize(server: Server, root: string, apiRoot: string): void
}
