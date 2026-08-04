# 三火工作台 (sanhuo-workbench)

一个绿色森系少女风格的**个人 PWA 工作台**——免登录、数据本地存储、离线可用。

## 功能

- **首页**:欢迎语(随时间变化)+ 今日待办预览 + 商单结余预览
- **待办**:标准 TODO List,支持记录时间与分类,未完成数量实时徽标
- **结余**:商单台账(项目 / 拍摄时间 / 费用 / 需求内容 / 发布状态),按拍摄时间自动置顶提醒,点击卡片可编辑详情
- **PWA**:单页面应用,可安装到桌面,Service Worker 离线缓存,数据存 localStorage

## 技术栈

原生 HTML / CSS / JavaScript(零依赖,无框架),PWA 标准实现(manifest + Service Worker)。

## 使用

```bash
# 本地预览
python -m http.server 8080
# 或任意静态服务器,然后浏览器打开
```

## 目录结构

```
sanhuo-workbench/
├── index.html            # 主页面(三视图:首页/待办/结余)
├── style.css             # 样式(设计 token 为 CSS 变量)
├── app.js                # 应用逻辑(数据/交互/滑删/弹窗)
├── manifest.webmanifest  # PWA 清单
├── sw.js                 # Service Worker(离线缓存)
└── assets/images/        # 背景图与图标
```

