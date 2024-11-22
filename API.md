## API doc for LS-Paintboard

### POST /api/paintboard/paint

- Request
  ```javascript
    {
        "x": 0,
        "y": 0,
        "color": 0, // color 的十六进制转化出的十进制数，例如 #0001FF -> 511
        "uid": 0, // 洛谷 uid 数字
        "token": "" // token 字符串
    }
  ```
- Response
  若非 200 可通过读取 ``data.errorType`` 知晓错误原因
  - 418 冷却未完毕
  - 400 请求格式错误或活动未开始
  - 403 uid 在绘版服务器被封禁或 token 错误
  - 500 你也没什么办法

### GET /api/paintboard/getboard

- Request
  EMPTY
- Response
  二进制格式返回的版面信息
  解码方法: 
  ```javascript
    for(let y=0;y<600;y++) {
        for(let x=0;x<1000;x++) {
            update(y,x,'#' + ('00000'+(byteArray[y*1000*3+x*3]*0x10000+byteArray[y*1000*3+x*3+1]*0x100+byteArray[y*1000*3+x*3+2]).toString(16)).substr(-6));
        }
    }
  ```

### POST /api/auth/gettoken

- Request
  ```javascript
    {
        "uid": 0, // 洛谷 uid 数字
        "paste": "" // 八位剪贴板字符串
    }
  ```
- Response
  若非 200 可通过读取 ``data.errorType`` 知晓错误原因
  - 418 冷却未完毕
  - 400 请求格式错误
  - 403 paste 验证失败
  - 500 你也确实没什么办法

### Websocket /api/paintboard/ws

- Request
  你不需要发送任何东西，发送会导致通道被关闭
- Response
  - 第一字节 ``0xfa`` 代表绘版绘画信息
    第二、三字节为 x 坐标信息，``xPos=data[1]+data[2]*0x100``
    第四、五字节为 y 坐标信息，``yPos=data[3]+data[4]*0x100``
    第六、七、八字节为颜色，``color=data[5]*0x10000+data[6]*0x100+data[7]``