const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const url = require("url");

//Yuzu主体
class Yuzu {
    //初始化方法,内部方法
    //TODO: 这里的初始化方法均可以用类封装
    _init() {
        //构造服务器引擎实例,并在listen方法中绑定事件
        this._server = http.createServer();

        //构造路由管理
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
        //TODO: 如果没有传入，就使用默认的配置,默认配置待完善
        if (!options) {
        }
        this.config = options;
        //初始化操作
        this._init();
    }

    middleWare(...mws) {
        //注册全局中间件
        this._middleWareProxy.add(mws);
    }

    //RESTFUL API的实现
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
        this._router._routeProxy.register(url, method, handler, mws);
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

    //注册路由器
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
    listen(port) {
        //绑定请求事件的处理方法
        this._server.on("request", (req, res) => {
            //为res添加一些便捷方法
            this._connectionProxy.addResponseMethods(res);
            this._connectionProxy.parseQueryString(req);
            this._connectionProxy.parseBody(req);
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

        //启动服务器
        this._server.listen(port);
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
class ConnectionProxy {
    constructor(options) {
        this.config = options;
    }
    //为res添加一些便捷方法
    addResponseMethods(res) {
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

        //添加便捷方法
        res.html = (filePath) => {
            readAndSet(filePath, "text/html");
        };

        res.json = (filePath) => {
            readAndSet(filePath, "application/json");
        };

        //直接将js对象作为json数据发送
        res.JSON = (json) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(json));
        };

        res.send = (filePath, fileType) => {
            readAndSet(filePath, fileType);
        };
    }
    //解析query参数
    parseQueryString(req) {
        const urlArray = req.url.split("?");
        if (urlArray.length === 1) return; //说明没有携带query参数
        //剥离query参数使路由可以正常解析
        const urlQuery = urlArray[1];
        req.url = urlArray[0];
        //解析query参数
        const query = querystring.parse(urlQuery);
        req.query = query;
    }
    //TODO: 解析表单数据
    parseBody(req) {
        if (req.method.toUpperCase() != "POST") return; //判断是否为post方法
    }
}

//中间件代理
class MiddleWareProxy {
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
        this.queue.forEach((middleWare) => {
            middleWare(req, res, this.Context);
        });
    }
    //向中间件队列添加中间件
    add(mws) {
        mws.forEach((middleWare) => {
            this.queue.push(middleWare);
        });
    }
}

//路由代理
class RouteProxy {
    constructor(frontUrl) {
        // this.config = options;
        this.frontUrl = frontUrl;
        this.routerMap = new Map();
    }
    //注册路由
    register(url, method, handler, middleWares) {
        //封装路由对象
        //加前缀
        url = this.frontUrl + url;
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
        //执行中间件,构造临时闭包上下文
        const tempContext = {};
        middleWares.forEach((middleWare) => {
            middleWare(req, res, tempContext);
        });
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

//路由器:对路由代理的封装
class Router {
    constructor(frontUrl) {
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

//YUZU函数,返回Yuzu对象
function YUZU(options) {
    return new Yuzu(options);
}

//创建路由器,可以依赖前缀
YUZU.Router = (frontUrl) => {
    if (!frontUrl) {
        return new Router("");
    }
    return new Router(frontUrl);
};

//导出构造函数
module.exports = YUZU;
