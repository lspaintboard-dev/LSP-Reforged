# LSP-Reforged
lspaintboard-reforged version!

**0x00** 安装与配置

将项目 pull 到本地后执行 ``npm i`` 即可安装依赖。

配置文件中修改：

```
global.workspace: 工作目录绝对路径
global.port: 监听端口(http)
global.wsPort: 监听端口(websocket)
global.certPath: 证书公钥
global.keyPath: 证书私钥
auth.__client_id: 一个已经过实名认证的洛谷账号的 cookie 中的 __client_id
auth._uid: 一个已经过实名认证的洛谷账号的 uid
auth.registerBeforeS: token 获取所需要用户在多少秒前注册，单位秒
auth.tokenCooldownMs: token 获取两次请求间最短间隔，单位毫秒
database.path: 数据库路径
paintboard.activityStartTimestamp: 活动开始时间戳
paintboard.activityEndTimestamp: 活动结束时间戳
paintboard.cooldown: 绘画冷却，单位毫秒
paintboard.resetBoard: 是否重新生成绘版
```

**上述路径中请使用绝对路径或以 ${WORKSPACE} 开头的路径**

完成后执行 ``npm run-script run`` 即可开始运行。

**0x01** API doc

//TODO