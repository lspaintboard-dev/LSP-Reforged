import { Server } from "./server/server.js";
import { Config } from "./config/config.js";
import { DBService, DBSqlite3 } from "./service/db.js";
import { Translator } from "./utils/translator.js";

const configPath: string = process.argv[2];
const config: Config = new Config(configPath);

Translator.setTranslations(config.getConfig('localization.' + config.getConfig('global.defaultLanguage')))

const server = new Server(config, new DBService(new DBSqlite3()));

server.run();