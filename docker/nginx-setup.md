# Nginx 配置说明

## 概述

此配置为思维导图任务管理系统提供了生产级的Nginx反向代理设置。

## 配置特点

1. **负载均衡**：上游服务器配置，可扩展多个应用实例
2. **静态资源缓存**：对JS/CSS/图片等静态资源设置长期缓存
3. **API请求处理**：专门针对API请求设置代理规则
4. **健康检查**：8080端口提供健康检查端点
5. **安全头设置**：传递正确的客户端IP和协议信息

## 端口说明

- `80`: HTTP服务端口，代理到应用容器的3000端口
- `8080`: 健康检查端口，提供`/health`端点

## 使用方法

1. 确保docker-compose.yml中已添加nginx服务
2. 启动服务：`docker-compose up -d`
3. 访问应用：http://localhost
4. 检查健康状态：http://localhost:8080/health

## 扩展配置

如需HTTPS支持，可以在nginx配置中添加SSL证书配置：

```nginx
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # ... 其他配置
}
```

## 注意事项

1. 请确保应用容器名称与nginx配置中的upstream名称一致
2. 生产环境中请使用强密码和安全配置
3. 定期更新nginx版本以确保安全性