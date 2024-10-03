import path from "path";
import { Request, Response } from "../httpserver/handling.js";
import { Server } from "../server/server.js";
import { Service } from "./service.js";
import { Translator } from "../utils/translator.js";
import { Permission } from "../permission/permission.js";
import fs from "fs-extra";
import * as WebSocket from "ws";
import * as https from "https";

class Color {
    public r: number = 0;
    public g: number = 0;
    public b: number = 0;

    constructor(color: number) {
        this.setByHex(('00000'+color.toString(16)).substr(-6));
    }

    public static toHexByte(num: number): string {
        return num.toString(16).length==2?num.toString(16):'0'+num.toString(16);
    }

    public toHex(): string {
        return Color.toHexByte(this.r) + Color.toHexByte(this.g) + Color.toHexByte(this.b);
    }
    
    public setByHex(colorHex: string): void {
        this.r = parseInt(colorHex.slice(0,2), 16);
        this.g = parseInt(colorHex.slice(2,4), 16);
        this.b = parseInt(colorHex.slice(4,6), 16);
    }

    public set(color: number) {
        this.setByHex(('00000'+color.toString(16)).substr(-6));
    }

}

class Pixel {
    public readonly x: number = 0;
    public readonly y: number = 0;
    public color: Color = new Color(0x000000);

    constructor(x: number, y: number, color: Color) {
        this.x = x;
        this.y = y;
        this.color = color;
    }
}

class PaintBoard {
    private readonly width: number = 0;
    private readonly height: number = 0;
    private boardArray: Array<Array<Pixel>> = [];
    private boardArrayCache: Uint8Array = new Uint8Array();

    constructor(width: number, height: number, loadFromString: boolean, defaultColor: number = 0xaaaaaa, boardString: string = '') {
        this.width = width;
        this.height = height;
        this.boardArrayCache = new Uint8Array(this.width * this.height * 3);
        const _defaultColor: Color = new Color(defaultColor); // 切记不要用这个初始化 Pixel，一定要 new 一个
        if(loadFromString) {
            for(let y=0;y<this.height;y++) {
                let _ = new Array<Pixel>();
                for(let x=0;x<this.width;x++) {
                    let _color = new Color(parseInt(boardString.slice(y*this.width*6+x*6, y*this.width*6+x*6+6), 16));
                    _.push(new Pixel(x, y, _color));
                    this.boardArrayCache[y*this.width*3+x*3]=_color.r;
                    this.boardArrayCache[y*this.width*3+x*3+1]=_color.g;
                    this.boardArrayCache[y*this.width*3+x*3+2]=_color.b;
                }
                this.boardArray.push(_);
            }
        }
        else {
            for(let y=0;y<this.height;y++) {
                let _ = new Array<Pixel>();
                for(let x=0;x<this.width;x++) {
                    _.push(new Pixel(x, y, new Color(defaultColor)));
                    this.boardArrayCache[y*this.width*3+x*3]=_defaultColor.r;
                    this.boardArrayCache[y*this.width*3+x*3+1]=_defaultColor.g;
                    this.boardArrayCache[y*this.width*3+x*3+2]=_defaultColor.b;
                }
                this.boardArray.push(_);
            }
        }
    }

    public getBoard(): Uint8Array {
        return this.boardArrayCache;
    }

    public getBoardString(): string {
        let result = "";
        for(let y=0;y<this.height;y++) {
            for(let x=0;x<this.width;x++) {
                result+=this.boardArray[y][x].color.toHex();
            }
        }
        return result;
    }

    public setPixel(x: number, y: number, color: number) {
        this.boardArray[y][x].color.set(color);
        this.boardArrayCache[y*this.width*3+x*3]=this.boardArray[y][x].color.r;
        this.boardArrayCache[y*this.width*3+x*3+1]=this.boardArray[y][x].color.g;
        this.boardArrayCache[y*this.width*3+x*3+2]=this.boardArray[y][x].color.b;
    }
}

export class PaintboardService implements Service {
    private server: Server | undefined;
    private cooldownCache: Map<number, number>;
    private paintboard: PaintBoard;
    private width: number = 0;
    private height: number = 0;
    private cooldown: number = 0;
    private websocketServer: WebSocket.WebSocketServer | undefined;

    constructor() {
        this.cooldownCache = new Map<number, number>();
        this.paintboard = new PaintBoard(0, 0, false);
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;
        if(server.getConfig('paintboard.resetBoard')) {
            this.paintboard = new PaintBoard(server.getConfig('paintboard.width'), server.getConfig('paintboard.height'), false, 0xaaaaaa);
        }
        else {
            this.paintboard = new PaintBoard(server.getConfig('paintboard.width'), server.getConfig('paintboard.height'), true, 0xaaaaaa, (await server.getDB().execute("select * from board", true))[0].board);
        }
        this.width = server.getConfig('paintboard.width');
        this.height = server.getConfig('paintboard.height');
        this.cooldown = server.getConfig('paintboard.cooldown');
        const getBoardPath = path.join(apiRoot, 'getboard');
        const paintPath = path.join(apiRoot, 'paint');
        this.server.registerHttpReq(getBoardPath, this.getBoardReqHandler, this);
        this.server.registerHttpReq(paintPath, this.paintReqHandler, this);
        const cert = await fs.readFile(server.getConfig('global.certPath').replaceAll('${WORKSPACE}', server.getConfig("global.workspace")));
        const key = await fs.readFile(server.getConfig('global.keyPath').replaceAll('${WORKSPACE}', server.getConfig("global.workspace")));
        this.websocketServer = await new Promise((resolve, reject) => {
            const opts = {
                cert: cert,
                key: key,
                path: path.join(apiRoot, 'ws')
            }
            const httpsServer = https.createServer(opts);
            const wsServer = new WebSocket.WebSocketServer({ server: httpsServer });
            wsServer.on('connection', (ws, req) => {
                server.getLogger().info("Paintboard", `paintboard.getWebsocketConnection: ${req.connection.remoteAddress}`)
                ws.on('message', (msg: any) => {
                    try {
                        msg = new Uint8Array(msg);
                        console.log(msg)
                        if (msg[0] === 0xff) {
                            ws.send(new Uint8Array([0xfc]));
                        }
                        else {
                            ws.close();
                            wsServer.clients.delete(ws)
                        }
                    }
                    catch {
                        ws.close();
                        wsServer.clients.delete(ws)
                    }
                });
                ws.on('close', function () {
                    wsServer.clients.delete(ws)
                });
                ws.on('error', function () {
                    ws.close();
                    wsServer.clients.delete(ws)
                });
            });
            wsServer.on('listening', () => { resolve(wsServer);});

            wsServer.on('error', (error) => { reject(error); });

            httpsServer.listen(server.getConfig('global.wsPort'));
        });
        this.server.getBus().emit('startListen');
        this.server.getBus().on('stop', async () => {
            await this.server?.getDB().execute(`update board set board = '${this.paintboard.getBoardString()}'`, false);
            this.server?.getBus().emit('stopDB');
        });
    }

    public async paintReqHandler(req: Request, res: Response, urlParams: Array<string>): Promise<number> {
        // x: number = xPos, y: number = yPos, color: number = color, uid: number = uid, token: string = token
        //TODO Websocket
        if(req.getMethod() != "POST") {
            return 405;
        }
        try {
            const body: object = req.getBody();
            if(Number.isInteger(body['x']) && Number.isInteger(body['y']) && Number.isInteger(body['color']) && Number.isInteger(body['uid']) && typeof(body['token']) == "string") {
                const xPos: number = body['x'];
                const yPos: number = body['y'];
                const color: number = body['color'];
                const uid: number = body['uid'];
                const token: string = body['token'];
                if(xPos < this.width && xPos >= 0 && yPos < this.height && yPos >= 0 && color >= 0x000000 && color <= 0xffffff && uid >= 1) {
                    if(!this.cooldownCache.has(uid) || (Date.now() - this.cooldownCache.get(uid)! >= this.cooldown)) {
                        if(this.server!.getAuthService().authToken(uid, token)) {
                            if(this.server!.getPermissionService().hasPermission(uid, Permission.PERM_PAINT)) {
                                this.paintboard.setPixel(xPos, yPos, color);
                                const broadcast = new Uint8Array([0xfa, xPos%256, Math.floor(xPos/256), yPos%256, Math.floor(yPos/256), color&0xFF0000, color&0x00FF00, color&0x0000FF]);
                                this.websocketServer?.clients.forEach((client) => {
                                    if (client.readyState === WebSocket.WebSocket.OPEN) {
                                        try {
                                            client.send(broadcast);
                                        }
                                        catch (err) {
                                            client.close();
                                            this.websocketServer?.clients.delete(client);
                                        }
                                    }
                                    else if (client.readyState !== WebSocket.WebSocket.CONNECTING) {
                                        client.close();
                                        this.websocketServer?.clients.delete(client);
                                    }
                                })
                                res.json({'statusCode': 200});
                                this.cooldownCache.set(uid, Date.now());
                                return 200;
                            }
                            else {
                                res.json({'statusCode': 403, 'data': {'errorType': 'paintboard.permissionDenied'}});
                                return 403;
                            }
                        }
                        else {
                            res.json({'statusCode': 403, 'data': {'errorType': 'auth.invalidToken'}});
                            return 403;
                        }
                    }
                    else {
                        res.json({'statusCode': 418, 'data': {'errorType': 'paintboard.paintInCooldown', "message": `${Translator.translate('paintboard.paintInCooldown')}: ${(this.server?.getConfig('paintboard.cooldown') - Date.now() + this.cooldownCache.get(uid)!)/1000.0}s left.`}});
                        return 418;
                    }
                }
                else {
                    res.json({'statusCode': 400, 'data': {'errorType': 'paintboard.illegalRequest'}});
                    return 400;
                }
            }
            else {
                res.json({'statusCode': 400, 'data': {'errorType': 'paintboard.illegalRequest'}});
                return 400;
            }
        } catch(err) {
            this.server!.getLogger().error("Paintboard", err!.toString());
            res.json({'statusCode': 500, 'data': {'errorType': 'unknown.internalServerError'}});
            return 500;
        }
    }

    public async getBoardReqHandler(req: Request, res: Response, urlParams: Array<string>): Promise<number> {
        if(req.getMethod() != "GET") {
            return 405;
        }
        try {
            res.sendArrayBuffer(this.paintboard.getBoard());
            return 200;
        } catch(err) {
            this.server?.getLogger().error('Paintboard', err!.toString());
            res.json({'statusCode': 500, 'data': {'errorType': 'unknown.internalServerError'}});
            return 500;
        }
    }

}