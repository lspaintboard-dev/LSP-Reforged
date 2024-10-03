import { Server } from "../server/server";
import { DBService } from "../service/db";
import { Service } from "../service/service";
import { Translator } from "../utils/translator";

export class Permission {
    public static PERM_PAINT: number;
    public static PERM_ADMIN: number;
    public static PERM_ROOT: number;
    static {
        this.PERM_PAINT = 0x1;
        this.PERM_ADMIN = 0x2;
        this.PERM_ROOT = 0x4;
    }

    private permission: number;

    constructor(p: number) {
        this.permission = p;
    }

    public getPermission(): number {
        return this.permission;
    }

    public setPermission(p: number) {
        this.permission = p;
    }

    public hasPermission(p: number) {
        return (this.permission & p) == p;
    }
}

export class PermissionService implements Service {

    private permissionCache: Map<number, Permission>
    private server: Server | undefined;
    
    constructor() {
        this.permissionCache = new Map<number, Permission>();
    }

    public async onInitialize(server: Server, root: string, apiRoot: string): Promise<void> {
        this.server = server;
        try {
            (await this.server.getDB().execute("select * from permissions", true)).forEach((dat: any) => {
                this.permissionCache.set(dat.uid, dat.permissions);
            });
        }
        catch(err) {
            this.server.getLogger().critical("Permission", Translator.translate("permission.serviceInitializeException"));
            process.exit(1);
        }
    }

    public async hasPermission(uid: number, permission: number) {
        return this.permissionCache.get(uid)?.hasPermission(permission);
    }

    public async setPermission(uid: number, permission: number) {
        await this.server?.getDB().execute(`update permissions set permissions = ${permission} where uid = ${uid}`, false);
        if(this.permissionCache.get(uid)) {
            this.permissionCache.get(uid)?.setPermission(permission);
        }
        else {
            this.permissionCache.set(uid, new Permission(permission));
        }
    }
}