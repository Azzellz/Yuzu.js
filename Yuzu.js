const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const url = require("url");

//Yuzu主体
//TODO: 只在Yuzu类中暴露服务性方法,核心实现封装成一个类,并且在Yuzu类中实例化并挂载
class Yuzu {
    //TODO: 默认属性,待完善
    static options = {};
    //初始化方法,内部方法
    //TODO: 这里的初始化方法均可以用类封装,可以封装一个叫Cores的类,控制核心
    _init() {
        //构造服务器引擎实例,并在listen方法中绑定事件
        this._server = http.createServer();

        //构造路由器
        this._router = new Router();

        //构造默认错误代理
        this._errorProxy = new ErrorProxy();

        //构造中间件管理
        this._middleWareProxy = new MiddleWareProxy();

        //构造连接代理,处理res和req
        this._connectionProxy = new ConnectionProxy();
    }

    constructor(options) {
        //载入配置信息
        //这个要判断是否有传入options参数
        if (!options) {
            this.config = Yuzu.options;
        } else {
            this.config = options;
        }

        //初始化操作
        this._init();
    }

    //注册中间件,接收一个中间件函数
    middleWare(...mws) {
        //注册全局中间件,把传来的中间件函数全部封装成中间件对象
        this._middleWareProxy.add(mws);
    }

    //RESTFUL API的实现,对外直接暴露,方便使用
    get(url, handler, ...mws) {
        //注册get路由
        this._router._routeProxy.register(url, "GET", handler, mws);
    }
    post(url, handler, ...mws) {
        //注册post路由
        this._router._routeProxy.register(url, "POST", handler, mws);
    }
    delete(url, handler, ...mws) {
        //注册delete路由
        this._router._routeProxy.register(url, "DELETE", handler, mws);
    }
    put(url, handler, ...mws) {
        //注册put路由
        this._router._routeProxy.register(url, "PUT", handler, mws);
    }
    any(url, method, handler, ...mws) {
        //注册自定义路由
        this._router._routeProxy.register(
            url,
            method.toUpperCase(),
            handler,
            mws
        );
    }
    //未能找到资源,定义失败的路由
    fail(handler) {
        //重写默认的Fail方法,
        //重写方法的签名应为(req,res)=>{...}
        this._router._routeProxy.fail = handler;
    }
    //定义错误处理函数,将会在路由处理函数/中间件处理函数抛出错误时调用
    error(errHandle) {
        //重写默认的error方法,
        //重写方法的签名应为(err,req,res)=>{...}
        if (!errHandle) return console.error("!please take a right errHandle!");
        this._errorProxy.errorHandle = errHandle;
    }

    //注册路由器:路由合并
    router(...routers) {
        //合并主引擎的路由器和传入的路由器
        routers.forEach((router) => {
            this._router.merge(router);
        });
    }

    //注册静态资源处理器
    static(dstPath) {
        //这里是静态资源处理器的实现
        //挂载自动静态资源处理器
        this._static = new AutoStaticRoute(dstPath);
    }

    //监听并且进行一些初始化操作
    run(port) {
        //绑定请求事件的处理方法
        this._server.on("request", (req, res) => {
            //代理请求和响应(包含初始化等操作)
            this._connectionProxy.proxy(req, res);
            //主逻辑链
            try {
                //启动中间件调用链,依次执行所有注册的中间件
                this._middleWareProxy.carry(req, res);
                //如果用户使用过static那么就调用static
                if (!(this._static && this._static.auto(req, res))) {
                    //启动路由匹配
                    this._router._routeProxy.route(req, res);
                }
            } catch (error) {
                //异常处理
                this._errorProxy.errorHandle(error, req, res);
            }
        });

        //默认监听端口80
        if (!port) {
            port = 80;
        }

        try {
            //启动服务器
            this._server.listen(port, () => {
                console.log(`yuzu listen on port : ${port}`);
            });
        } catch (error) {
            console.error(error);
        }

        //监听退出事件:自动关闭服务器
        process.on("exit", (code) => {
            this._server.close(() => {
                console.log("Server is closed");
            });
        });
    }
}

//自动静态资源路由
class AutoStaticRoute {
    constructor(dstPath) {
        //根据传入的路径构造静态资源处理器
        this.path = path.join(__dirname, dstPath);
    }
    //自动处理静态资源请求
    auto(req, res) {
        const targetUrl = path.join(this.path, req.url);
        //判断是否为一个文件,不是文件就不处理
        const targetExt = path.extname(targetUrl);
        //如果不是文件就不处理
        if (!targetExt) return false;
        //读取文件
        fs.readFile(targetUrl, "utf8", (err, data) => {
            if (err) return console.error(err);
            //解析拓展名,并设置响应头
            this.parse(res, targetExt);
            //发送数据
            res.end(data);
            //TODO: 标明请求已经被静态资源处理器捕获
            req._captured = true;
        });
        return true;
    }
    //解析文件拓展名,并设置响应的响应头,只设置常见的,不常见的让浏览器来自动识别
    parse(res, extname) {
        switch (extname) {
            case ".html":
                res.writeHead(200, { "Content-Type": "text/html" });
                break;
            case ".css":
                res.writeHead(200, { "Content-Type": "text/css" });
                break;
            case ".js":
                res.writeHead(200, { "Content-Type": "text/javascript" });
                break;
            case ".png":
                res.writeHead(200, { "Content-Type": "image/png" });
                break;
            case ".jpg":
                res.writeHead(200, { "Content-Type": "image/jpg" });
                break;
            case ".gif":
                res.writeHead(200, { "Content-Type": "image/gif" });
                break;
            case ".svg":
                res.writeHead(200, { "Content-Type": "image/svg+xml" });
                break;
            case ".ico":
                res.writeHead(200, { "Content-Type": "image/x-icon" });
                break;
            case ".json":
                res.writeHead(200, { "Content-Type": "application/json" });
                break;
            case ".txt":
                res.writeHead(200, { "Content-Type": "text/plain" });
                break;
        }
    }
}

//连接代理,用于处理res和req,相当于一个中间件合集
//TODO: 可以把默认中间件抽取成一个类,然后在这里实例化;这样也方便在导出的时候根据传入的配置信息进行选择性构造
class ConnectionProxy {
    constructor(options) {
        this.config = options;
    }

    //代理响应
    #proxyResponse(res) {
        MiddleWare.AddResponseMethods(res);
    }

    //代理请求
    #proxyRequest(req) {
        MiddleWare.ParseBody(req);
        MiddleWare.ParseQueryString(req);
    }

    //代理日志中间件
    #proxyLog(req, res) {
        MiddleWare.Log(req, res);
    }

    //代理请求和响应
    proxy(req, res) {
        //记录请求开始时间
        req.startTime = Date.now();
        this.#proxyRequest(req);
        this.#proxyResponse(res);
        this.#proxyLog(req, res);
    }
}

//中间件基类:包含一些静态的默认中间件
class MiddleWare {
    //TODO: 解析表单数据
    static ParseBody(req) {}

    //为res添加一些便捷方法
    static AddResponseMethods(res) {
        function readAndSet(filePath, typ) {
            //拼接当前路径
            filePath = path.join(__dirname, filePath);
            //异步一把梭哈
            fs.readFile(filePath, "utf-8", (err, data) => {
                if (err) return console.error(err);
                res.writeHead(200, { "Content-Type": typ });
                res.end(data);
            });
        }

        //读取html文件发送
        res.html = (filePath) => {
            readAndSet(filePath, "text/html");
        };

        //读取json文件发送
        res.json = (filePath) => {
            readAndSet(filePath, "application/json");
        };

        //直接将js对象作为json数据发送
        res.JSON = (json) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(json));
        };

        //发送文本
        res.text = (content) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(content);
        };

        //直接根据读取的文件类型发送
        res.send = (filePath, fileType) => {
            readAndSet(filePath, fileType);
        };
    }

    //解析query参数
    static ParseQueryString(req) {
        const urlArray = req.url.split("?");
        if (urlArray.length === 1) return; //说明没有携带query参数
        //剥离query参数使路由可以正常解析
        const urlQuery = urlArray[1];
        req.url = urlArray[0];
        //解析query参数
        const query = querystring.parse(urlQuery);
        req.query = query;
    }

    //TODO: 默认日志中间件:应该包含错误和响应结束
    static Log(req, res) {
        req.on("end", () => {
            console.log(
                `the request : ${req.method} ${req.url} --> timeout: ${
                    Date.now() - req.startTime
                }ms`
            );
        });

        req.on("error", (error) => {
            console.error("Error occurred:", error);
        });
    }

    //打包中间件,返回中间件对象数组,mws应该为中间件对象
    static pack(mws) {
        return mws.map((mw) => new MiddleWare(mw));
    }

    constructor(mw) {
        this.middleWare = mw;
    }
    //中间件的执行方法
    do(req, res, next, context) {
        this.middleWare(req, res, next, context);
    }
}

//中间件代理
class MiddleWareProxy {
    //轮转执行中间件
    static roundNext(req, res, context, queue) {
        //定义一个指针,指向当前中间件
        let index = 0;
        //定义一个next方法,用于启动下一个中间件
        const next = () => {
            //如果中间件链已经执行完毕,就返回
            if (index >= queue.length) return;
            //获取当前中间件
            const currentMw = queue[index];
            //指针后移
            index++;
            //启动当前中间件
            currentMw.do(req, res, next, context);
        };
        //启动中间件链
        next();
    }

    constructor(options) {
        //设置原型为yuzu实例
        this.config = options;
        //中间件队列
        this.queue = [];
        //中间件上下文
        this.context = {};
    }
    //顺序执行中间件队列
    carry(req, res) {
        //启动中间件链
        MiddleWareProxy.roundNext(req, res, this.context, this.queue);
    }
    //向中间件队列添加中间件
    add(mws) {
        //包装成对象数组
        mws = MiddleWare.pack(mws);
        //遍历添加中间件
        mws.forEach((middleWare) => {
            this.queue.push(middleWare);
        });
    }
}

//路由代理:路由器的内核
class RouteProxy {
    constructor(frontUrl) {
        if (!frontUrl) frontUrl = ""; //默认根前缀

        // this.config = options;
        this.frontUrl = frontUrl;
        this.routerMap = new Map();
    }
    //注册路由
    register(url, method, handler, middleWares) {
        //封装路由对象

        //加前缀
        //斜杆判断,如果传入的参数没有斜杆,要补上一个斜杆。
        if (url[0] != "/") {
            //补上斜杆
            url = "/" + url;
        }
        url = this.frontUrl + url;

        //封装中间件对象
        middleWares = MiddleWare.pack(middleWares);

        const route = {
            url,
            method,
            handler,
            middleWares,
        };
        //handler参数应为一个处理标准的处理箭头函数(req,res)=>{...}
        //封装路由匹配
        //TODO: 这里可以优化key
        const key = `${route.method} ${route.url}`;
        //写入路由map
        this.routerMap.set(key, route);
    }
    //匹配路由,并且执行路由函数
    route(req, res) {
        //根据入参封装路由匹配
        const key = `${req.method} ${req.url}`;
        //解构出路由函数和中间件
        const route = this.routerMap.get(key);

        if (!route) return this.fail(req, res); //路由不存在,执行路由匹配失败的处理函数Fail()

        const { handler, middleWares } = route;
        //执行中间件,构造临时闭包中间件上下文
        const tempContext = {};
        MiddleWareProxy.roundNext(req, res, tempContext, middleWares);
        //执行路由处理函数
        handler(req, res);
    }
    //默认的路由匹配失败的处理函数,可被调用fail()方法重写
    fail(req, res) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain");
        res.end("Not Found!  -by yuzu\n");
    }
}

//错误代理
class ErrorProxy {
    constructor(options) {
        this.config = options;
    }
    errorHandle(err, req, res) {
        console.error(err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain");
        res.end("Something Error with server!  -by yuzu\n");
    }
}

//路由器:对路由代理的封装,具有一个内部类RouteProxy
class Router {
    constructor(frontUrl) {
        if (!frontUrl) frontUrl = ""; //默认前缀为根路径
        // this.config = options;
        //路由代理
        this._routeProxy = new RouteProxy(frontUrl);
    }
    //RESTFUL API的实现
    get(url, handler, ...mws) {
        //注册get路由
        this._routeProxy.register(url, "GET", handler, mws);
    }
    post(url, handler, ...mws) {
        //注册post路由
        this._routeProxy.register(url, "POST", handler, mws);
    }
    delete(url, handler, ...mws) {
        //注册delete路由
        this._routeProxy.register(url, "DELETE", handler, mws);
    }
    put(url, handler, ...mws) {
        //注册put路由
        this._routeProxy.register(url, "PUT", handler, mws);
    }
    any(url, method, handler, ...mws) {
        //注册自定义路由
        this._routeProxy.register(url, method, handler, mws);
    }
    //合并路由器
    merge(...routers) {
        //合并路由代理
        routers.forEach((router) => {
            this._routeProxy.routerMap = new Map([
                ...this._routeProxy.routerMap,
                ...router._routeProxy.routerMap,
            ]);
        });
    }
}

//对构造函数YUZU的封装
//TODO: 可以选择把导出操作封装成一个类???
{
    //YUZU构造函数,返回Yuzu对象
    function YUZU(options) {
        return new Yuzu(options);
    }

    //创建路由器,可以依赖前缀.
    YUZU.Router = (frontUrl) => {
        return new Router(frontUrl);
    };
}

//导出构造函数YUZU
module.exports = YUZU;
